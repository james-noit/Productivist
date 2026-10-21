import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, input, linkedSignal, output, signal, untracked, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { todayIso } from '../../../lib/dates';
import { focusableIn } from '../../../lib/focus-trap';
import { CADENCES, resolveCadence } from '../../../lib/sportask/cadences';
import { EQUIPMENT } from '../../../lib/sportask/equipment';
import { GOALS } from '../../../lib/sportask/goals';
import { sanitizeSettings } from '../../../lib/sportask/sanitize';
import { SETUP_STEPS, type SetupDraft, type SetupStep, acceptedAt, draftFromSettings, quickDraft, setupPatch, stepValid } from '../../../lib/sportask/setup';
import { SKINS } from '../../../lib/sportask/skins';
import { localize } from '../../../lib/sportask/texts';
import { SettingsService } from '../../../services/settings.service';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import { SportaskEquipmentFieldsComponent } from '../sportask-equipment-fields/sportask-equipment-fields.component';
import { SportaskGoalFieldsComponent } from '../sportask-goal-fields/sportask-goal-fields.component';
import { SportaskLimitsFieldsComponent } from '../sportask-limits-fields/sportask-limits-fields.component';
import { SportaskRhythmFieldsComponent } from '../sportask-rhythm-fields/sportask-rhythm-fields.component';
import { SportaskStyleFieldsComponent } from '../sportask-style-fields/sportask-style-fields.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

type Stage = 'choose' | 'quick' | 'steps';

/** What the summary and the Quick screen print, as plain data (the template composes the sentences with the translate pipe). */
interface Summary {
  goal: { goal: string; program: string; level: 1 | 2 | 3 } | null;
  gear: string[];
  limits: ('lowImpact' | 'noFloor')[];
  rhythm: { custom: boolean; name: string; focus: number; brk: number };
  style: { skin: string; wholeApp: boolean; cues: boolean; autoStart: boolean };
}

/** The title string of each step: the settings blocks' own titles, so the wizard and the page name things the same. */
const STEP_KEYS: Record<SetupStep, string> = {
  goal: 'sportask.goal.title',
  gear: 'sportask.gear.title',
  limits: 'sportask.limits.title',
  rhythm: 'sportask.rhythm.title',
  style: 'sportask.style.title',
  summary: 'sportask.wizard.summaryTitle',
};

const minutes = (seconds: number): number => Math.round((seconds / 60) * 10) / 10;

/**
 * The guided setup of Configuration > Sportask: a choice between Quick setup (one screen that shows what it sets) and a personalised
 * walk through six steps (goal, equipment, limits, rhythm, style, summary). Everything is a local draft; nothing reaches the settings
 * until *Finish* writes it in one `SportaskSettingsService.update` (with `setupDoneAt`, the switch and the notice acceptance).
 * `rerun` starts the draft from the current settings and lets *Cancel* come back without changes. Escape (and Cancel) with a dirty
 * draft ask "Discard setup?" inline; while that can happen a capture listener on `document` swallows Escape so the Configuration
 * modal does not also close. The blocks are the shared `sportask-*-fields` components. Lazy; the parent has loaded the strings.
 */
@Component({
  selector: 'app-sportask-setup-wizard',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    UiIconComponent,
    SportaskGoalFieldsComponent,
    SportaskEquipmentFieldsComponent,
    SportaskLimitsFieldsComponent,
    SportaskRhythmFieldsComponent,
    SportaskStyleFieldsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-setup-wizard.component.html',
  styleUrl: './sportask-setup-wizard.component.css',
})
export class SportaskSetupWizardComponent {
  /** Started from *Run setup again*: prefilled from the current settings (a free-training user stays free) and cancellable. */
  readonly rerun = input(false);
  readonly finished = output<void>();
  readonly cancelled = output<void>();

  private readonly store = inject(SportaskSettingsService);
  private readonly lang = inject(SettingsService).language;
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly body = viewChild<ElementRef<HTMLElement>>('body');

  protected readonly steps = SETUP_STEPS;
  protected readonly stage = signal<Stage>('choose');
  protected readonly index = signal(0);
  protected readonly accepted = signal(false);
  protected readonly question = signal(false);

  private readonly settings = computed(() => sanitizeSettings(this.store.settings()));
  /** Where the personalised path starts; read once (a sync pull while the wizard is open must not reset what was typed). */
  private readonly initial = computed(() => draftFromSettings(untracked(this.settings), this.rerun()));
  private readonly initialJson = computed(() => JSON.stringify(this.initial()));
  protected readonly draft = linkedSignal<SetupDraft>(() => this.initial());

  protected readonly quick = quickDraft();
  protected readonly step = computed<SetupStep>(() => SETUP_STEPS[this.index()]!);
  protected readonly last = computed(() => this.index() === SETUP_STEPS.length - 1);
  protected readonly alreadyAccepted = computed(() => acceptedAt(this.settings()) > 0);
  protected readonly valid = computed(() => stepValid(this.step(), this.draft(), this.accepted() || this.alreadyAccepted()));
  protected readonly dirty = computed(
    () => this.stage() === 'steps' && (this.index() > 0 || this.accepted() || JSON.stringify(this.draft()) !== this.initialJson()),
  );
  protected readonly cancelable = computed(() => this.rerun() || this.dirty());

  /** What finishing will do to the current program, when it has one or the draft drops it. */
  protected readonly programNote = computed<'leave' | 'switch' | null>(() => {
    const e = this.settings().enrolment;
    const pick = (this.stage() === 'quick' ? this.quick : this.draft()).pick;
    if (!e) return null;
    if (!pick) return 'leave';
    return e.goalId === pick.goalId && e.programId === pick.programId && e.level === pick.level ? null : 'switch';
  });

  protected readonly stepKeys = STEP_KEYS;

  protected readonly summary = computed(() => this.describe(this.draft()));
  protected readonly quickSummary = computed(() => this.describe(this.quick));

  private opener: HTMLElement | null = null;

  constructor() {
    // Capture phase, so it runs before the Configuration modal's own Escape listener on the same node.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (this.question()) {
        this.swallow(event);
        this.keepEditing();
      } else if (this.dirty()) {
        this.swallow(event);
        this.askDiscard();
      }
    };
    document.addEventListener('keydown', onKey, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', onKey, true));
  }

  private swallow(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
  }

  private describe(d: SetupDraft): Summary {
    const lang = this.lang();
    const goal = d.pick ? GOALS.get(d.pick.goalId) : undefined;
    const cadence = resolveCadence({ cadenceId: d.rhythm.cadenceId, customCadence: d.rhythm.customCadence });
    const preset = CADENCES.get(d.rhythm.cadenceId);
    const gear = EQUIPMENT.all.flatMap((e) => {
      const item = d.equipment[e.id];
      if (!item?.owned) return [];
      const detail = item.weightsKg?.length ? ` (${item.weightsKg.join(', ')} kg)` : '';
      return [localize(e.name, lang) + detail];
    });
    return {
      goal: d.pick && goal ? { goal: localize(goal.name, lang), program: localize(goal.programs.find((p) => p.id === d.pick!.programId)?.name, lang), level: d.pick.level } : null,
      gear,
      limits: (['lowImpact', 'noFloor'] as const).filter((k) => d.constraints[k]),
      rhythm: {
        custom: d.rhythm.cadenceId === 'custom',
        name: preset ? localize(preset.name, lang) : '',
        focus: minutes(cadence.focusSeconds),
        brk: minutes(cadence.breakSeconds),
      },
      style: { skin: localize(SKINS.get(d.style.skin)?.name, lang), wholeApp: d.style.skinWholeApp, cues: d.style.cues, autoStart: d.style.autoStartBreak },
    };
  }

  // --- Navigation ---------------------------------------------------------------------------------------------------------

  /** Moves focus to the first control of the screen that just replaced the previous one. */
  private focusFirst(): void {
    afterNextRender(() => {
      const body = this.body()?.nativeElement;
      // A screen without a control (Quick setup) puts the focus on its heading, which is then read out.
      const target = (body ? focusableIn(body)[0] : undefined) ?? this.host.nativeElement.querySelector<HTMLElement>('#wz-heading');
      target?.focus();
    }, { injector: this.injector });
  }

  protected choose(stage: 'quick' | 'steps'): void {
    this.stage.set(stage);
    this.index.set(0);
    this.focusFirst();
  }

  protected back(): void {
    if (this.stage() === 'steps' && this.index() > 0) {
      this.index.update((i) => i - 1);
      this.focusFirst();
    } else {
      this.stage.set('choose');
      afterNextRender(() => document.querySelector<HTMLElement>('.wz__choice')?.focus(), { injector: this.injector });
    }
  }

  protected next(): void {
    if (!this.valid() || this.last()) return;
    this.index.update((i) => i + 1);
    this.focusFirst();
  }

  protected goTo(step: SetupStep): void {
    this.index.set(SETUP_STEPS.indexOf(step));
    this.focusFirst();
  }

  protected set(change: Partial<SetupDraft>): void {
    this.draft.update((d) => Object.assign({}, d, change));
  }

  /** Writes the whole draft (or the Quick preset) in one update. */
  protected finish(): void {
    const quick = this.stage() === 'quick';
    if (!quick && !this.valid()) return;
    this.store.update(setupPatch(quick ? this.quick : this.draft(), this.settings(), Date.now(), todayIso()));
    this.finished.emit();
  }

  // --- Discard ------------------------------------------------------------------------------------------------------------

  protected cancel(): void {
    if (this.dirty()) this.askDiscard();
    else this.cancelled.emit();
  }

  private askDiscard(): void {
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.question.set(true);
    afterNextRender(() => document.querySelector<HTMLElement>('app-sportask-setup-wizard .confirm-bar [data-keep]')?.focus(), { injector: this.injector });
  }

  protected keepEditing(): void {
    this.question.set(false);
    const opener = this.opener;
    this.opener = null;
    if (opener) afterNextRender(() => (opener.isConnected ? opener.focus() : undefined), { injector: this.injector });
  }

  protected discard(): void {
    this.question.set(false);
    this.opener = null;
    if (this.rerun()) {
      this.cancelled.emit();
      return;
    }
    this.draft.set(this.initial());
    this.accepted.set(false);
    this.index.set(0);
    this.stage.set('choose');
    afterNextRender(() => document.querySelector<HTMLElement>('.wz__choice')?.focus(), { injector: this.injector });
  }
}
