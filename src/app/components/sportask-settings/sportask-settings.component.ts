import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { parseIso, todayIso } from '../../../lib/dates';
import { CADENCES, MAX_BREAK_SECONDS, MAX_FOCUS_SECONDS, MIN_CUSTOM_FOCUS_SECONDS, MIN_DURATION_SECONDS, clampCadence, resolveCadence, type CadenceValues } from '../../../lib/sportask/cadences';
import { EQUIPMENT } from '../../../lib/sportask/equipment';
import { GOALS } from '../../../lib/sportask/goals';
import { sanitizeSettings } from '../../../lib/sportask/sanitize';
import { SKINS } from '../../../lib/sportask/skins';
import { loadSportaskTexts, localize } from '../../../lib/sportask/texts';
import { SettingsService } from '../../../services/settings.service';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import type { EquipmentItem, SportaskSettings } from '../../../types/sportask';
import { NumberStepperComponent } from '../number-stepper/number-stepper.component';
import { UiIconComponent, type UiIconName } from '../ui-icon/ui-icon.component';

type Question = 'switch' | 'leave' | null;
type BandStrength = 'light' | 'medium' | 'heavy';

const BAND_STRENGTHS: readonly BandStrength[] = ['light', 'medium', 'heavy'];
const LEVELS: readonly (1 | 2 | 3)[] = [1, 2, 3];
const MAX_WEIGHTS = 12;

const minutes = (seconds: number): number => seconds / 60;

/**
 * Configuration > Sportask: the goal and program the user is enrolled in, the equipment at home, limits, the default
 * rhythm, the style and the body weight. Lazy (inside `@defer` in the Configuration modal), like the Git forge section:
 * it reads `sanitizeSettings(raw)` and writes patches through `SportaskSettingsService.update`, which is all the sync
 * needs. The strings are a lazy chunk (`lib/sportask/texts.ts`); the first render waits for them.
 */
@Component({
  selector: 'app-sportask-settings',
  standalone: true,
  imports: [TranslatePipe, NumberStepperComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-settings.component.html',
  styleUrl: './sportask-settings.component.css',
})
export class SportaskSettingsComponent {
  private readonly store = inject(SportaskSettingsService);
  private readonly appSettings = inject(SettingsService);
  private readonly injector = inject(Injector);
  private readonly translate = inject(TranslateService);

  readonly ready = signal(false);

  protected readonly goals = GOALS.all;
  protected readonly equipment = EQUIPMENT.all;
  protected readonly cadences = CADENCES.all;
  protected readonly skins = SKINS.all;
  protected readonly levels = LEVELS;
  protected readonly bandStrengths = BAND_STRENGTHS;
  protected readonly limits = {
    focusMin: minutes(MIN_CUSTOM_FOCUS_SECONDS),
    focusMax: minutes(MAX_FOCUS_SECONDS),
    breakMin: minutes(MIN_DURATION_SECONDS),
    breakMax: minutes(MAX_BREAK_SECONDS),
  };

  readonly weightKg = this.store.weightKg;
  protected readonly lang = this.appSettings.language;

  /** The stored settings, with defaults filled in. */
  readonly settings = computed(() => sanitizeSettings(this.store.settings()));
  readonly enrolment = computed(() => this.settings().enrolment);

  // Draft of the goal block: what the cards are showing, which is not yet (or no longer) the stored enrolment.
  private readonly draftGoalId = signal<string | null>(null);
  private readonly draftProgramId = signal<string | null>(null);
  private readonly draftLevel = signal<1 | 2 | 3 | null>(null);
  readonly accepted = signal(false);
  readonly question = signal<Question>(null);

  readonly goalId = computed(() => this.draftGoalId() ?? this.enrolment()?.goalId ?? GOALS.all[0]!.id);
  readonly goal = computed(() => GOALS.get(this.goalId()) ?? GOALS.all[0]!);
  readonly programId = computed(() => {
    const goal = this.goal();
    const wanted = this.draftProgramId() ?? (this.enrolment()?.goalId === goal.id ? this.enrolment()?.programId : undefined);
    return goal.programs.find((p) => p.id === wanted)?.id ?? goal.programs[0]!.id;
  });
  readonly program = computed(() => this.goal().programs.find((p) => p.id === this.programId())!);
  readonly level = computed<1 | 2 | 3>(() => this.draftLevel() ?? this.enrolment()?.level ?? 1);

  /** True while the cards show exactly what the user is enrolled in. */
  readonly isCurrent = computed(() => {
    const e = this.enrolment();
    return !!e && e.goalId === this.goalId() && e.programId === this.programId() && e.level === this.level();
  });
  readonly alreadyAccepted = computed(() => (this.enrolment()?.acceptedDisclaimerAt ?? 0) > 0);
  readonly canStart = computed(() => this.alreadyAccepted() || this.accepted());
  readonly since = computed(() => {
    const e = this.enrolment();
    const date = e ? parseIso(e.startedOn) : null;
    return date ? new Intl.DateTimeFormat(this.lang(), { dateStyle: 'medium' }).format(date) : '';
  });

  readonly cards = computed(() => {
    const lang = this.lang();
    const enrolledId = this.enrolment()?.goalId;
    return this.goals.map((g) => ({
      id: g.id,
      icon: g.icon as UiIconName,
      name: localize(g.name, lang),
      description: localize(g.description, lang),
      selected: g.id === this.goalId(),
      enrolled: g.id === enrolledId,
    }));
  });
  readonly programs = computed(() => {
    const lang = this.lang();
    return this.goal().programs.map((p) => ({ id: p.id, name: localize(p.name, lang) }));
  });
  readonly programInfo = computed(() => {
    const p = this.program();
    return { summary: localize(p.summary, this.lang()), weeks: p.weeks, days: p.daysPerWeek };
  });

  readonly equipmentRows = computed(() => {
    const lang = this.lang();
    const inventory = this.settings().equipment;
    return this.equipment.map((e) => {
      const item: EquipmentItem = inventory[e.id] ?? { owned: false };
      return { id: e.id, icon: e.icon as UiIconName, name: localize(e.name, lang), details: e.details, owned: item.owned, weights: item.weightsKg ?? [], bands: item.bandStrengths ?? [] };
    });
  });
  /** The weight being typed, per equipment id. */
  readonly weightDrafts = signal<Readonly<Record<string, string | undefined>>>({});

  // Default rhythm.
  readonly cadenceId = computed(() => this.settings().cadenceId);
  /** The values the custom fields show (the stored custom cadence, or the current preset to start from). */
  readonly custom = computed<CadenceValues>(() => {
    const s = this.settings();
    return s.customCadence ?? resolveCadence({ cadenceId: s.cadenceId, customCadence: undefined });
  });
  readonly cadenceRows = computed(() => {
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

  readonly skinTiles = computed(() => {
    const lang = this.lang();
    return this.skins.map((s) => ({ id: s.id, name: localize(s.name, lang), scheme: s.colorScheme, preview: s.preview }));
  });

  constructor() {
    void loadSportaskTexts(this.translate).then(() => this.ready.set(true));
  }

  private fmt(n: number): string {
    return new Intl.NumberFormat(this.lang(), { maximumFractionDigits: 1 }).format(n);
  }

  private patch(p: Partial<SportaskSettings>): void {
    this.store.update(p);
  }

  // --- Goal -----------------------------------------------------------------------------------------------------

  pickGoal(id: string): void {
    this.question.set(null);
    if (id === this.goalId()) return;
    this.draftGoalId.set(id);
    this.draftProgramId.set(null);
  }

  pickProgram(id: string): void {
    this.question.set(null);
    this.draftProgramId.set(id);
  }

  pickLevel(level: 1 | 2 | 3): void {
    this.question.set(null);
    this.draftLevel.set(level);
  }

  /** Enrols (first time) or opens the "switch?" question (already enrolled in something else). */
  start(): void {
    if (!this.canStart() || this.isCurrent()) return;
    if (this.enrolment()) this.openQuestion('switch');
    else this.enrol();
  }

  enrol(): void {
    const previous = this.enrolment();
    this.patch({
      enrolment: {
        goalId: this.goalId(),
        programId: this.programId(),
        level: this.level(),
        startedOn: todayIso(),
        acceptedDisclaimerAt: previous && previous.acceptedDisclaimerAt > 0 ? previous.acceptedDisclaimerAt : Date.now(),
      },
    });
    this.closeQuestion();
  }

  leave(): void {
    this.patch({ enrolment: null });
    this.draftGoalId.set(null);
    this.draftProgramId.set(null);
    this.draftLevel.set(null);
    this.accepted.set(false);
    this.closeQuestion();
  }

  askLeave(): void {
    this.openQuestion('leave');
  }

  private questionOpener: HTMLElement | null = null;

  private openQuestion(q: Exclude<Question, null>): void {
    this.questionOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.question.set(q);
    afterNextRender(() => document.querySelector<HTMLElement>('.ss .confirm-bar [data-keep]')?.focus(), { injector: this.injector });
  }

  closeQuestion(): void {
    this.question.set(null);
    const opener = this.questionOpener;
    this.questionOpener = null;
    if (opener) afterNextRender(() => (opener.isConnected ? opener.focus() : undefined), { injector: this.injector });
  }

  /** Escape answers an open question first, so it does not also close the Configuration modal. */
  onQuestionKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    this.closeQuestion();
  }

  // --- Equipment --------------------------------------------------------------------------------------------------

  private setItem(id: string, change: Partial<EquipmentItem>): void {
    const inventory = this.settings().equipment;
    const item: EquipmentItem = inventory[id] ?? { owned: false };
    this.patch({ equipment: { ...inventory, [id]: { ...item, ...change } } });
  }

  toggleOwned(id: string): void {
    this.setItem(id, { owned: !(this.settings().equipment[id]?.owned ?? false) });
  }

  setWeightDraft(id: string, value: string): void {
    this.weightDrafts.update((d) => ({ ...d, [id]: value }));
  }

  addWeight(id: string): void {
    const kg = Math.round(Number((this.weightDrafts()[id] ?? '').replace(',', '.')) * 100) / 100;
    if (!(kg > 0 && kg <= 500)) return;
    const current = this.settings().equipment[id]?.weightsKg ?? [];
    if (current.length < MAX_WEIGHTS && !current.includes(kg)) {
      this.setItem(id, { weightsKg: [...current, kg].sort((a, b) => a - b) });
    }
    this.setWeightDraft(id, '');
  }

  removeWeight(id: string, kg: number): void {
    this.setItem(id, { weightsKg: (this.settings().equipment[id]?.weightsKg ?? []).filter((w) => w !== kg) });
  }

  onWeightKeydown(event: KeyboardEvent, id: string): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    this.addWeight(id);
  }

  toggleBand(id: string, strength: BandStrength): void {
    const current = this.settings().equipment[id]?.bandStrengths ?? [];
    const next = current.includes(strength) ? current.filter((b) => b !== strength) : BAND_STRENGTHS.filter((b) => b === strength || current.includes(b));
    this.setItem(id, { bandStrengths: next });
  }

  // --- Constraints, style ------------------------------------------------------------------------------------------

  setConstraint(key: 'lowImpact' | 'noFloor'): void {
    const c = this.settings().constraints;
    this.patch({ constraints: { ...c, [key]: !c[key] } });
  }

  setSkin(id: string): void {
    this.patch({ skin: id });
  }

  toggle(key: 'skinWholeApp' | 'cues' | 'autoStartBreak'): void {
    this.patch({ [key]: !this.settings()[key] });
  }

  // --- Rhythm -------------------------------------------------------------------------------------------------------

  pickCadence(id: string): void {
    if (id === 'custom') this.patch({ cadenceId: 'custom', customCadence: this.custom() });
    else this.patch({ cadenceId: id });
  }

  private setCustom(change: Partial<CadenceValues>, clear?: 'longBreak'): void {
    const next: CadenceValues = { ...this.custom(), ...change };
    if (clear) delete next.longBreak;
    this.patch({ cadenceId: 'custom', customCadence: clampCadence(next) });
  }

  /** A length typed in minutes (half minutes allowed); the clamped value is written back so the box never lies. */
  onMinutes(event: Event, field: 'focusSeconds' | 'breakSeconds' | 'longSeconds'): void {
    const input = event.target as HTMLInputElement;
    const n = Number(input.value.replace(',', '.'));
    const current = this.custom();
    if (input.value.trim() === '' || !Number.isFinite(n)) {
      input.value = String(minutes(field === 'longSeconds' ? (current.longBreak?.seconds ?? 0) : current[field]));
      return;
    }
    if (field === 'longSeconds') this.setCustom({ longBreak: { every: current.longBreak?.every ?? 4, seconds: n * 60 } });
    else this.setCustom({ [field]: n * 60 });
    const stored = this.custom();
    input.value = String(minutes(field === 'longSeconds' ? (stored.longBreak?.seconds ?? 0) : stored[field]));
  }

  toggleLongBreak(): void {
    if (this.custom().longBreak) this.setCustom({}, 'longBreak');
    else this.setCustom({ longBreak: { every: 4, seconds: 900 } });
  }

  setLongEvery(value: number | null): void {
    const lb = this.custom().longBreak;
    if (lb && value !== null) this.setCustom({ longBreak: { ...lb, every: value } });
  }

  setExerciseEvery(value: number | null): void {
    if (value !== null) this.setCustom({ exerciseEvery: value });
  }

  // --- Weight ---------------------------------------------------------------------------------------------------------

  setWeight(value: number | null): void {
    this.weightKg.set(value);
  }
}
