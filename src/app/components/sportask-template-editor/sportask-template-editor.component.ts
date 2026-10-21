import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { trapTab } from '../../../lib/focus-trap';
import { CATALOG } from '../../../lib/sportask/catalog';
import { PATTERN_ORDER, ZONE_ORDER } from '../../../lib/sportask/metrics';
import { upsertTemplate } from '../../../lib/sportask/data-ops';
import { SportDataService } from '../../../services/sport-data.service';
import type { BodyZone, Dose, GoalTag, Level, MovementPattern, SportTemplate, TemplateSlot } from '../../../types/sportask';
import { KebabMenuComponent } from '../kebab-menu/kebab-menu.component';
import { NumberStepperComponent } from '../number-stepper/number-stepper.component';
import { SportaskExercisePickerComponent } from '../sportask-exercise-picker/sportask-exercise-picker.component';
import { SportPanelState } from '../sportask-view/sport-panel.state';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

type Format = SportTemplate['format'];
type Confirm = 'discard' | null;

const FORMATS: readonly Format[] = ['sequence', 'intervals', 'emom'];
const TAGS: readonly GoalTag[] = ['mobility', 'strength', 'calories'];
const MAX_SLOTS = 40;
const MIN_WORK = 5;
const MAX_INTERVAL = 600;
const NAME_MAX = 200;
/** An EMOM needs at least two minutes to be one (planFromTemplate falls back to a sequence below that). */
const EMOM_MIN_SECONDS = 120;

interface DraftSlot {
  uid: number;
  kind: 'exercise' | 'pattern';
  exerciseId: string;
  /** Reps or seconds (by the exercise's own metric) instead of its default; null = the default. */
  dose: number | null;
  pattern: MovementPattern;
  tag: GoalTag | '';
  zone: BodyZone | '';
  /** Kept from an imported template; not editable here. */
  maxLevel: Level | null;
}

interface Draft {
  name: string;
  format: Format;
  work: number | null;
  rest: number | null;
  slots: DraftSlot[];
}

let nextUid = 1;

function toDraft(t: SportTemplate): Draft {
  return {
    name: t.name,
    format: t.format,
    work: t.workSeconds ?? null,
    rest: t.restSeconds ?? null,
    slots: t.slots.map((s): DraftSlot => {
      if ('exerciseId' in s) {
        return { uid: nextUid++, kind: 'exercise', exerciseId: s.exerciseId, dose: s.dose ? (s.dose.reps ?? s.dose.seconds ?? null) : null, pattern: 'mobility', tag: '', zone: '', maxLevel: null };
      }
      return { uid: nextUid++, kind: 'pattern', exerciseId: '', dose: null, pattern: s.pattern, tag: s.tag ?? '', zone: s.zone ?? '', maxLevel: s.maxLevel ?? null };
    }),
  };
}

/** The draft without the ids the rows are tracked by, to tell whether anything changed. */
const fingerprint = (d: Draft): string => JSON.stringify([d.name.trim(), d.format, d.format === 'intervals' ? [d.work, d.rest] : null, d.slots.map(({ uid: _uid, ...rest }) => rest)]);

/**
 * The free-training template editor: name, format (sequence, intervals, EMOM), work and rest for intervals, and the slots. A slot
 * is a fixed exercise (chosen from a searchable list) or a movement pattern with an optional tag and body zone. Follows the Task
 * Details pattern: a local draft against a snapshot, *Save* disabled until something changed and the template is valid, Ctrl/Cmd+Enter
 * saves, closing a changed draft asks first. Slots are reordered with Alt+Up/Down or the ⋯ menu. Saving goes through
 * `upsertTemplate` (lib/sportask/data-ops.ts), so it syncs.
 */
@Component({
  selector: 'app-sportask-template-editor',
  standalone: true,
  imports: [TranslatePipe, KebabMenuComponent, NumberStepperComponent, SportaskExercisePickerComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-template-editor.component.html',
  styleUrl: './sportask-template-editor.component.css',
})
export class SportaskTemplateEditorComponent {
  /** The template to edit, or the starting point of a new one (blank, or a copy of a built-in). */
  readonly template = input.required<SportTemplate>();
  readonly isNew = input(false);
  readonly closed = output<void>();
  /** The id of the template just saved (emitted before `closed`), so a caller can select it. */
  readonly saved = output<string>();

  private readonly data = inject(SportDataService);
  protected readonly state = inject(SportPanelState);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly confirmFocus = viewChild<ElementRef<HTMLButtonElement>>('confirmFocus');
  private readonly opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private pressedOnBackdrop = false;

  protected readonly formats = FORMATS;
  protected readonly tags = TAGS;
  protected readonly patterns = PATTERN_ORDER;
  protected readonly zones = ZONE_ORDER;
  protected readonly maxSlots = MAX_SLOTS;
  protected readonly nameMax = NAME_MAX;

  protected readonly draft = linkedSignal<SportTemplate, Draft>({ source: this.template, computation: (t) => toDraft(t) });
  private readonly baseline = computed(() => fingerprint(toDraft(this.template())));
  protected readonly dirty = computed(() => fingerprint(this.draft()) !== this.baseline());

  protected readonly confirm = signal<Confirm>(null);
  /** The slot whose exercise is being chosen ('new' = a slot to append), or null. */
  protected readonly picking = signal<number | 'new' | null>(null);
  protected readonly pickingCurrent = computed(() => {
    const p = this.picking();
    return typeof p === 'number' ? (this.draft().slots.find((s) => s.uid === p)?.exerciseId ?? null) : null;
  });

  protected readonly problems = computed(() => {
    const d = this.draft();
    const out: string[] = [];
    if (!d.name.trim()) out.push('name');
    if (d.slots.length === 0) out.push('slots');
    if (d.slots.some((s) => s.kind === 'exercise' && !CATALOG.exercises.get(s.exerciseId))) out.push('exercise');
    if (d.format === 'intervals') {
      if ((d.work ?? 30) < MIN_WORK || (d.work ?? 30) > MAX_INTERVAL) out.push('work');
      if ((d.rest ?? 30) > MAX_INTERVAL) out.push('rest');
    }
    return out;
  });
  /** A new template (a blank one, or a copy of a built-in) can be saved as it is; an existing one only once it changed. */
  protected readonly canSave = computed(() => this.problems().length === 0 && (this.dirty() || this.isNew()));

  /** Each slot ready to show: the names are looked up once here, never in the template. */
  protected readonly rows = computed(() => {
    this.state.lang();
    return this.draft().slots.map((s, index) => {
      const ex = s.kind === 'exercise' ? CATALOG.exercises.get(s.exerciseId) : undefined;
      return {
        slot: s,
        index,
        name: ex ? this.state.exerciseName(ex.id) : s.kind === 'exercise' ? s.exerciseId : '',
        unit: ex?.metric === 'seconds' ? 'seconds' : 'reps',
        defaultDose: ex ? (ex.dose.seconds ?? ex.dose.reps ?? 1) : 1,
        first: index === 0,
        last: index === this.draft().slots.length - 1,
      };
    });
  });

  constructor() {
    // A new template starts in the name field (a copy has its name selected, ready to be replaced).
    afterNextRender(() => {
      const name = this.isNew() ? this.panel().nativeElement.querySelector<HTMLInputElement>('#ste-name') : null;
      if (name) {
        name.focus({ preventScroll: true });
        name.select();
      } else this.panel().nativeElement.focus({ preventScroll: true });
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    });
  }

  // ---- draft edits --------------------------------------------------------------------------------------------------

  protected edit(patch: Partial<Draft>): void {
    this.draft.update((d) => ({ ...d, ...patch }));
  }

  protected setName(event: Event): void {
    this.edit({ name: (event.target as HTMLInputElement).value });
  }

  protected setFormat(format: Format): void {
    const d = this.draft();
    this.edit({ format, work: format === 'intervals' ? (d.work ?? 30) : d.work, rest: format === 'intervals' ? (d.rest ?? 30) : d.rest });
  }

  protected editSlot(uid: number, patch: Partial<DraftSlot>): void {
    this.draft.update((d) => ({ ...d, slots: d.slots.map((s) => (s.uid === uid ? { ...s, ...patch } : s)) }));
  }

  protected selectValue(uid: number, key: 'pattern' | 'tag' | 'zone', event: Event): void {
    this.editSlot(uid, { [key]: (event.target as HTMLSelectElement).value } as Partial<DraftSlot>);
  }

  protected addPatternSlot(): void {
    if (this.draft().slots.length >= MAX_SLOTS) return;
    const slot: DraftSlot = { uid: nextUid++, kind: 'pattern', exerciseId: '', dose: null, pattern: 'mobility', tag: '', zone: '', maxLevel: null };
    this.draft.update((d) => ({ ...d, slots: [...d.slots, slot] }));
    this.focusSlot(slot.uid);
  }

  protected startPicking(which: number | 'new'): void {
    if (which === 'new' && this.draft().slots.length >= MAX_SLOTS) return;
    this.picking.set(which);
  }

  protected pick(exerciseId: string): void {
    const which = this.picking();
    this.picking.set(null);
    if (which === 'new') {
      const slot: DraftSlot = { uid: nextUid++, kind: 'exercise', exerciseId, dose: null, pattern: 'mobility', tag: '', zone: '', maxLevel: null };
      this.draft.update((d) => ({ ...d, slots: [...d.slots, slot] }));
      this.focusSlot(slot.uid);
    } else if (which !== null) {
      // A different exercise may count in other units: the old dose no longer applies.
      this.editSlot(which, { exerciseId, dose: null });
      this.focusSlot(which);
    }
  }

  protected cancelPicking(): void {
    const which = this.picking();
    this.picking.set(null);
    this.focusSlot(typeof which === 'number' ? which : null);
  }

  protected removeSlot(uid: number): void {
    const slots = this.draft().slots;
    const at = slots.findIndex((s) => s.uid === uid);
    this.draft.update((d) => ({ ...d, slots: d.slots.filter((s) => s.uid !== uid) }));
    const next = slots[at + 1] ?? slots[at - 1];
    this.focusSlot(next?.uid ?? null);
  }

  protected move(uid: number, by: -1 | 1): void {
    const slots = [...this.draft().slots];
    const from = slots.findIndex((s) => s.uid === uid);
    const to = from + by;
    if (from < 0 || to < 0 || to >= slots.length) return;
    [slots[from], slots[to]] = [slots[to]!, slots[from]!];
    this.edit({ slots });
    this.focusSlot(uid);
  }

  protected onSlotKeydown(event: KeyboardEvent, uid: number): void {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    event.stopPropagation();
    this.move(uid, event.key === 'ArrowUp' ? -1 : 1);
  }

  /** Puts focus back on a slot's first control after the list re-renders (or on the panel when there is none). */
  private focusSlot(uid: number | null): void {
    afterNextRender(
      () => {
        const target = uid === null ? null : this.panel().nativeElement.querySelector<HTMLElement>(`[data-slot="${uid}"] [data-first]`);
        (target ?? this.panel().nativeElement).focus({ preventScroll: false });
      },
      { injector: this.injector },
    );
  }

  // ---- closing and saving -------------------------------------------------------------------------------------------

  protected requestClose(): void {
    if (this.picking() !== null) this.cancelPicking();
    else if (this.confirm()) this.dismissConfirm();
    else if (this.dirty()) {
      this.confirm.set('discard');
      afterNextRender(() => this.confirmFocus()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
    } else this.closed.emit();
  }

  protected dismissConfirm(): void {
    this.confirm.set(null);
    afterNextRender(() => this.panel().nativeElement.focus({ preventScroll: true }), { injector: this.injector });
  }

  protected discard(): void {
    this.closed.emit();
  }

  protected save(): void {
    if (!this.canSave()) return;
    const d = this.draft();
    const base = this.template();
    const slots: TemplateSlot[] = d.slots.map((s): TemplateSlot => {
      if (s.kind === 'exercise') {
        const metric = CATALOG.exercises.get(s.exerciseId)?.metric;
        const dose: Dose | null = s.dose === null ? null : metric === 'seconds' ? { seconds: s.dose } : { reps: s.dose };
        return dose ? { exerciseId: s.exerciseId, dose } : { exerciseId: s.exerciseId };
      }
      const slot: Extract<TemplateSlot, { pattern: MovementPattern }> = { pattern: s.pattern };
      if (s.tag) slot.tag = s.tag;
      if (s.zone) slot.zone = s.zone;
      if (s.maxLevel) slot.maxLevel = s.maxLevel;
      return slot;
    });
    const now = Date.now();
    const out: SportTemplate = {
      id: base.id,
      name: d.name.trim().slice(0, NAME_MAX),
      slots,
      format: d.format,
      order: base.order,
      createdAt: base.createdAt || now,
      updatedAt: now,
    };
    if (d.format === 'intervals') {
      out.workSeconds = d.work ?? 30;
      out.restSeconds = d.rest ?? 30;
    }
    if (d.format === 'emom') out.minSeconds = EMOM_MIN_SECONDS;
    upsertTemplate(this.data, out);
    this.saved.emit(out.id);
    this.closed.emit();
  }

  protected onBackdropDown(event: MouseEvent): void {
    this.pressedOnBackdrop = event.target === event.currentTarget;
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (this.pressedOnBackdrop && event.target === event.currentTarget) this.requestClose();
    this.pressedOnBackdrop = false;
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.requestClose();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      if (!this.confirm() && this.picking() === null) this.save();
    } else {
      trapTab(event, this.panel().nativeElement);
    }
  }
}
