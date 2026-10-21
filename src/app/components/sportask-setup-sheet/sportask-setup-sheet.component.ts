import { ChangeDetectionStrategy, Component, DestroyRef, type OnInit, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { trapTab } from '../../../lib/focus-trap';
import { CADENCES, MAX_BREAK_SECONDS, MAX_FOCUS_SECONDS, MIN_CUSTOM_FOCUS_SECONDS, MIN_DURATION_SECONDS, clampCadence, resolveCadence, type CadenceValues } from '../../../lib/sportask/cadences';
import { EQUIPMENT } from '../../../lib/sportask/equipment';
import { templateAvailability } from '../../../lib/sportask/engine/template-plan';
import { programWeek } from '../../../lib/sportask/engine/schedule';
import { GOALS } from '../../../lib/sportask/goals';
import { sanitizeSettings } from '../../../lib/sportask/sanitize';
import { startSession } from '../../../lib/sportask/session-ops';
import { buildContext } from '../../../lib/sportask/session-context';
import { resolveSkin } from '../../../lib/sportask/skins';
import { BUILTIN_TEMPLATES } from '../../../lib/sportask/templates';
import { loadSportaskTexts, localize } from '../../../lib/sportask/texts';
import { todayIso } from '../../../lib/dates';
import { SettingsService } from '../../../services/settings.service';
import { SportDataService } from '../../../services/sport-data.service';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import { SportaskService } from '../../../services/sportask.service';
import { ViewService } from '../../../services/view.service';
import type { EquipmentInventory, SportaskStartOptions } from '../../../types/sportask';
import { NumberStepperComponent } from '../number-stepper/number-stepper.component';
import { SportaskSkinComponent } from '../sportask-skin/sportask-skin.component';
import { UiIconComponent, type UiIconName } from '../ui-icon/ui-icon.component';

type Mode = 'goal' | 'free';
const RANDOM = 'random';
const minutes = (seconds: number): number => seconds / 60;

/**
 * The setup sheet (PLAN 7.2): what to train (the goal the user is enrolled in, or free training), the rhythm, and the equipment
 * for today. *Turn on* starts the session; in the planner context it only arms it for when the plan launches. Lazy, opened
 * from `sportask-button` (and, in phase 5, from the Plan-my-day wizard).
 */
@Component({
  selector: 'app-sportask-setup-sheet',
  standalone: true,
  imports: [TranslatePipe, NumberStepperComponent, SportaskSkinComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-setup-sheet.component.html',
  styleUrl: './sportask-setup-sheet.component.css',
})
export class SportaskSetupSheetComponent implements OnInit {
  /** Which view started it (becomes the session's `source`; ignored in the planner context). */
  readonly source = input<'pomodoro' | 'multitask'>('pomodoro');
  /** Opened from the Plan-my-day wizard: the primary button saves for the plan instead of starting. */
  readonly planner = input(false);
  readonly closed = output<void>();

  private readonly sportask = inject(SportaskService);
  private readonly store = inject(SportaskSettingsService);
  private readonly data = inject(SportDataService);
  private readonly appSettings = inject(SettingsService);
  private readonly view = inject(ViewService);
  private readonly translate = inject(TranslateService);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly ready = signal(false);
  protected readonly lang = this.appSettings.language;
  protected readonly cadences = CADENCES.all;
  protected readonly equipmentDefs = EQUIPMENT.all;
  protected readonly limits = {
    focusMin: minutes(MIN_CUSTOM_FOCUS_SECONDS),
    focusMax: minutes(MAX_FOCUS_SECONDS),
    breakMin: minutes(MIN_DURATION_SECONDS),
    breakMax: minutes(MAX_BREAK_SECONDS),
  };

  private readonly settings = computed(() => sanitizeSettings(this.store.settings()));
  protected readonly enrolment = computed(() => this.settings().enrolment);
  /** The skin this surface wears (`data-sport-skin`), whatever the whole-app option says. */
  protected readonly skin = computed(() => resolveSkin(this.settings().skin));

  // ---- the draft (starts from the session, the armed planner session, or the settings; filled in ngOnInit, once the inputs are set) ----

  protected readonly mode = signal<Mode>('free');
  protected readonly templateId = signal<string>(RANDOM);
  protected readonly cadenceId = signal<string>('classic');
  protected readonly custom = signal<CadenceValues>(resolveCadence({ cadenceId: 'classic', customCadence: undefined }));
  /** Owned items the session override switches off. */
  protected readonly ownedOff = signal<ReadonlySet<string>>(new Set());
  protected readonly accepted = signal(false);

  ngOnInit(): void {
    const session = this.sportask.session();
    const existing = this.planner() ? this.sportask.armed() : session?.active ? session : null;
    const settings = this.settings();
    const cadence: CadenceValues = existing?.cadence ?? resolveCadence(settings);
    this.mode.set(existing?.mode ?? (settings.enrolment ? 'goal' : 'free'));
    this.templateId.set(existing?.templateId ?? RANDOM);
    this.custom.set(cadence);
    const wanted = JSON.stringify(clampCadence(cadence));
    const match = CADENCES.all.find((c) => JSON.stringify(resolveCadence({ cadenceId: c.id, customCadence: undefined })) === wanted);
    this.cadenceId.set(existing ? (match?.id ?? 'custom') : settings.cadenceId === 'custom' ? 'custom' : (CADENCES.get(settings.cadenceId)?.id ?? 'classic'));
    const override = existing?.equipmentOverride;
    const off = new Set<string>();
    if (override) for (const id of Object.keys(settings.equipment)) if (settings.equipment[id]?.owned && override[id]?.owned !== true) off.add(id);
    this.ownedOff.set(off);
  }

  // ---- derived -----------------------------------------------------------------------------------------------------------

  protected readonly cadence = computed<CadenceValues>(() =>
    this.cadenceId() === 'custom' ? clampCadence(this.custom()) : resolveCadence({ cadenceId: this.cadenceId(), customCadence: undefined }),
  );

  protected readonly equipmentChips = computed(() => {
    const lang = this.lang();
    const own = this.settings().equipment;
    const off = this.ownedOff();
    return EQUIPMENT.all
      .filter((e) => own[e.id]?.owned)
      .map((e) => ({ id: e.id, icon: e.icon as UiIconName, name: localize(e.name, lang), on: !off.has(e.id) }));
  });
  protected readonly noEquipment = computed(() => this.equipmentChips().length > 0 && this.equipmentChips().every((c) => !c.on));

  /** The inventory for this session: null while nothing was switched off. */
  protected readonly override = computed<EquipmentInventory | null>(() => {
    const off = this.ownedOff();
    if (off.size === 0) return null;
    const own = this.settings().equipment;
    const out: EquipmentInventory = {};
    for (const id of Object.keys(own)) {
      const item = own[id];
      if (item) out[id] = off.has(id) ? { ...item, owned: false } : item;
    }
    return out;
  });

  protected readonly goalCard = computed(() => {
    const e = this.enrolment();
    const goal = e ? GOALS.get(e.goalId) : undefined;
    if (!e || !goal) return null;
    const program = goal.programs.find((p) => p.id === e.programId) ?? goal.programs[0]!;
    const pos = programWeek(e.startedOn, todayIso(), program.weeks);
    const lang = this.lang();
    return { icon: goal.icon as UiIconName, name: localize(goal.name, lang), program: localize(program.name, lang), week: pos.week, weeks: program.weeks };
  });

  protected readonly cadenceRows = computed(() => {
    const lang = this.lang();
    return this.cadences.map((c) => ({
      id: c.id,
      name: localize(c.name, lang),
      focus: this.fmt(minutes(c.focusSeconds)),
      brk: this.fmt(minutes(c.breakSeconds)),
      longMin: c.longBreak ? this.fmt(minutes(c.longBreak.seconds)) : null,
      longEvery: c.longBreak?.every ?? 0,
      every: c.exerciseEvery,
    }));
  });

  protected readonly templateRows = computed(() => {
    const lang = this.lang();
    const cadence = this.cadence();
    const ctx = buildContext({
      blockId: 'setup',
      blockSeconds: cadence.breakSeconds,
      blocks: [],
      settings: this.settings(),
      equipmentOverride: this.override(),
    });
    const all = [...BUILTIN_TEMPLATES.all, ...[...this.data.templates()].sort((a, b) => a.order - b.order)];
    return all
      .filter((t) => (t.minSeconds ?? 0) <= cadence.breakSeconds)
      .map((t) => ({
        id: t.id,
        name: t.nameText ? localize(t.nameText, lang) : t.name,
        available: templateAvailability(t, ctx).available,
      }));
  });

  /** A template that no longer fits the break (or the equipment) falls back to the random pick. */
  protected readonly chosenTemplate = computed(() => {
    const id = this.templateId();
    return id !== RANDOM && this.templateRows().some((t) => t.id === id && t.available) ? id : RANDOM;
  });

  protected readonly needsAcceptance = computed(() => {
    const s = this.settings();
    return (s.disclaimerAcceptedAt ?? 0) <= 0 && (s.enrolment?.acceptedDisclaimerAt ?? 0) <= 0;
  });
  protected readonly canActivate = computed(() => (this.mode() === 'goal' ? this.goalCard() !== null : true) && (!this.needsAcceptance() || this.accepted()));
  protected readonly shortBreak = computed(() => this.cadence().breakSeconds < 90);

  constructor() {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void loadSportaskTexts(this.translate).then(() => {
      this.ready.set(true);
      afterNextRender(() => this.panel()?.nativeElement.querySelector<HTMLElement>('[data-first]')?.focus({ preventScroll: true }), { injector: this.injector });
    });
    inject(DestroyRef).onDestroy(() => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    });
  }

  private fmt(n: number): string {
    return new Intl.NumberFormat(this.lang(), { maximumFractionDigits: 1 }).format(n);
  }

  // ---- edits ---------------------------------------------------------------------------------------------------------------

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected pickCadence(id: string): void {
    if (id === 'custom' && this.cadenceId() !== 'custom') this.custom.set(this.cadence());
    this.cadenceId.set(id);
  }

  private setCustom(change: Partial<CadenceValues>, clearLong = false): void {
    const next: CadenceValues = { ...this.custom(), ...change };
    if (clearLong) delete next.longBreak;
    this.custom.set(clampCadence(next));
  }

  protected onMinutes(event: Event, field: 'focusSeconds' | 'breakSeconds' | 'longSeconds'): void {
    const input = event.target as HTMLInputElement;
    const n = Number(input.value.replace(',', '.'));
    const current = this.custom();
    const shown = (c: CadenceValues): number => minutes(field === 'longSeconds' ? (c.longBreak?.seconds ?? 0) : c[field]);
    if (input.value.trim() === '' || !Number.isFinite(n)) {
      input.value = String(shown(current));
      return;
    }
    if (field === 'longSeconds') this.setCustom({ longBreak: { every: current.longBreak?.every ?? 4, seconds: n * 60 } });
    else this.setCustom({ [field]: n * 60 });
    input.value = String(shown(this.custom()));
  }

  protected toggleLong(): void {
    if (this.custom().longBreak) this.setCustom({}, true);
    else this.setCustom({ longBreak: { every: 4, seconds: 900 } });
  }

  protected setLongEvery(value: number | null): void {
    const lb = this.custom().longBreak;
    if (lb && value !== null) this.setCustom({ longBreak: { ...lb, every: value } });
  }

  protected setExerciseEvery(value: number | null): void {
    if (value !== null) this.setCustom({ exerciseEvery: value });
  }

  protected toggleGear(id: string): void {
    this.ownedOff.update((off) => {
      const next = new Set(off);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected setNoEquipment(): void {
    this.ownedOff.set(new Set(this.equipmentChips().map((c) => c.id)));
  }

  protected pickGoal(): void {
    this.closed.emit();
    this.view.openConfiguration('sportask');
  }

  protected activate(): void {
    if (!this.canActivate()) return;
    if (this.needsAcceptance()) this.store.update({ disclaimerAcceptedAt: Date.now() });
    const mode = this.mode();
    const options: Omit<SportaskStartOptions, 'source'> = {
      mode,
      templateId: mode === 'free' ? this.chosenTemplate() : null,
      cadence: this.cadence(),
      equipmentOverride: this.override(),
    };
    if (this.planner()) this.sportask.armed.set(options);
    else startSession(this.sportask, { ...options, source: this.source() });
    this.closed.emit();
  }

  protected close(): void {
    this.closed.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    const panel = this.panel()?.nativeElement;
    if (panel && trapTab(event, panel)) event.stopPropagation();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }
}
