import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { parseIso, todayIso } from '../../../lib/dates';
import { GOALS } from '../../../lib/sportask/goals';
import { hasProfile } from '../../../lib/sportask/profile';
import { sanitizeSettings } from '../../../lib/sportask/sanitize';
import { deactivate } from '../../../lib/sportask/session-ops';
import { type GoalPick, type RhythmValue, type StyleValue, acceptedAt, pickFor } from '../../../lib/sportask/setup';
import { loadSportaskTexts } from '../../../lib/sportask/texts';
import { SettingsService } from '../../../services/settings.service';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import { SportaskService } from '../../../services/sportask.service';
import type { Constraints, EquipmentInventory, SportProfile, SportaskSettings } from '../../../types/sportask';
import { SportaskEquipmentFieldsComponent } from '../sportask-equipment-fields/sportask-equipment-fields.component';
import { SportaskGoalFieldsComponent } from '../sportask-goal-fields/sportask-goal-fields.component';
import { SportaskProfileFieldsComponent } from '../sportask-profile-fields/sportask-profile-fields.component';
import { SportaskLimitsFieldsComponent } from '../sportask-limits-fields/sportask-limits-fields.component';
import { SportaskRhythmFieldsComponent } from '../sportask-rhythm-fields/sportask-rhythm-fields.component';
import { SportaskSetupWizardComponent } from '../sportask-setup-wizard/sportask-setup-wizard.component';
import { SportaskStyleFieldsComponent } from '../sportask-style-fields/sportask-style-fields.component';

type Question = 'switch' | 'leave' | null;

const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;

/**
 * Configuration > Sportask: the on/off switch; while it is on and the setup is not done, the setup wizard; afterwards the goal and
 * program the user is enrolled in, the equipment at home, limits, the default rhythm, the style and the body weight (with a
 * *Run setup again* button that reopens the wizard prefilled). Lazy (inside `@defer` in the Configuration modal), like the Git
 * forge section: it reads `sanitizeSettings(raw)` and writes patches through `SportaskSettingsService.update`, which is all the
 * sync needs. The blocks are the shared `sportask-*-fields` components (also used by the wizard); the program's confirm bars
 * stay here. The strings are a lazy chunk (`lib/sportask/texts.ts`); the first render waits for them.
 */
@Component({
  selector: 'app-sportask-settings',
  standalone: true,
  imports: [
    TranslatePipe,
    SportaskGoalFieldsComponent,
    SportaskProfileFieldsComponent,
    SportaskEquipmentFieldsComponent,
    SportaskLimitsFieldsComponent,
    SportaskRhythmFieldsComponent,
    SportaskStyleFieldsComponent,
    SportaskSetupWizardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-settings.component.html',
  styleUrl: './sportask-settings.component.css',
})
export class SportaskSettingsComponent {
  private readonly store = inject(SportaskSettingsService);
  private readonly sportask = inject(SportaskService);
  private readonly appSettings = inject(SettingsService);
  private readonly injector = inject(Injector);
  private readonly translate = inject(TranslateService);

  readonly ready = signal(false);

  protected readonly weightLimits = { min: MIN_WEIGHT_KG, max: MAX_WEIGHT_KG };

  readonly weightKg = this.store.weightKg;
  protected readonly lang = this.appSettings.language;

  /** The feature switch. Off hides everything below it and the rest of the app's Sportask surfaces. */
  readonly enabled = this.store.enabled;

  /** The stored settings, with defaults filled in. */
  readonly settings = computed(() => sanitizeSettings(this.store.settings()));
  readonly enrolment = computed(() => this.settings().enrolment);

  /** The wizard is open over the settings (*Run setup again*). */
  readonly rerun = signal(false);
  readonly setupDone = this.store.setupDone;

  // Draft of the goal block: what the cards are showing, which is not yet (or no longer) the stored enrolment.
  private readonly draft = signal<GoalPick | null>(null);
  readonly accepted = signal(false);
  readonly question = signal<Question>(null);

  readonly pick = computed<GoalPick>(() => {
    const e = this.enrolment();
    return this.draft() ?? (e ? pickFor(e.goalId, e.programId, e.level) : pickFor(GOALS.all[0]!.id));
  });
  readonly rhythm = computed<RhythmValue>(() => {
    const s = this.settings();
    return s.customCadence ? { cadenceId: s.cadenceId, customCadence: s.customCadence } : { cadenceId: s.cadenceId };
  });
  readonly style = computed<StyleValue>(() => {
    const s = this.settings();
    return { skin: s.skin, skinWholeApp: s.skinWholeApp, cues: s.cues, autoStartBreak: s.autoStartBreak };
  });
  readonly profile = computed<SportProfile>(() => this.settings().profile ?? {});
  readonly enrolledGoalId = computed(() => this.enrolment()?.goalId ?? null);

  /** True while the cards show exactly what the user is enrolled in. */
  readonly isCurrent = computed(() => {
    const e = this.enrolment();
    const p = this.pick();
    return !!e && e.goalId === p.goalId && e.programId === p.programId && e.level === p.level;
  });
  /** The notice was accepted before: the settings keep it when a program is left, the enrolment carries a copy. */
  private readonly acceptedAt = computed(() => acceptedAt(this.settings()));
  readonly alreadyAccepted = computed(() => this.acceptedAt() > 0);
  readonly canStart = computed(() => this.alreadyAccepted() || this.accepted());
  readonly since = computed(() => {
    const e = this.enrolment();
    const date = e ? parseIso(e.startedOn) : null;
    return date ? new Intl.DateTimeFormat(this.lang(), { dateStyle: 'medium' }).format(date) : '';
  });

  constructor() {
    void loadSportaskTexts(this.translate).then(() => this.ready.set(true));
  }

  /** Turning it off also stops a running session, an armed plan and an open *Train now* block; the data is kept. */
  toggleEnabled(): void {
    const next = !this.enabled();
    this.store.update({ enabled: next });
    this.rerun.set(false);
    if (!next) {
      this.question.set(null);
      deactivate(this.sportask);
    }
  }

  private patch(p: Partial<SportaskSettings>): void {
    this.store.update(p);
  }

  // --- Goal -----------------------------------------------------------------------------------------------------

  onPick(p: GoalPick | null): void {
    this.question.set(null);
    if (p) this.draft.set(p);
  }

  /** Enrols (first time) or opens the "switch?" question (already enrolled in something else). */
  start(): void {
    if (!this.canStart() || this.isCurrent()) return;
    if (this.enrolment()) this.openQuestion('switch');
    else this.enrol();
  }

  enrol(): void {
    const acceptedAt = this.acceptedAt() || Date.now();
    this.patch({
      enrolment: { goalId: this.pick().goalId, programId: this.pick().programId, level: this.pick().level, startedOn: todayIso(), acceptedDisclaimerAt: acceptedAt },
      disclaimerAcceptedAt: acceptedAt,
    });
    this.closeQuestion();
  }

  leave(): void {
    this.patch({ enrolment: null });
    this.draft.set(null);
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

  // --- Blocks (the shared field components; each emits its new slice) ---------------------------------------------------

  /** An empty profile is stored as absent (the wire rule: optional fields only when set). */
  setProfile(profile: SportProfile): void {
    this.patch({ profile: hasProfile(profile) ? profile : undefined });
  }

  setEquipment(equipment: EquipmentInventory): void {
    this.patch({ equipment });
  }

  setConstraints(constraints: Constraints): void {
    this.patch({ constraints });
  }

  setRhythm(r: RhythmValue): void {
    this.patch(r.customCadence ? { cadenceId: r.cadenceId, customCadence: r.customCadence } : { cadenceId: r.cadenceId });
  }

  setStyle(s: StyleValue): void {
    this.patch(s);
  }

  // --- Setup wizard -------------------------------------------------------------------------------------------------------

  /** Closes the wizard (finished or cancelled) and puts focus on *Run setup again*. */
  closeWizard(): void {
    this.rerun.set(false);
    afterNextRender(() => document.querySelector<HTMLElement>('.ss__rerun button')?.focus(), { injector: this.injector });
  }

  // --- Weight ---------------------------------------------------------------------------------------------------------

  /** Typed in kg; empty clears it. Committed on blur/Enter (`change`), clamped to the box's limits, and written back. */
  onWeight(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.trim().replace(',', '.');
    if (raw === '') {
      this.weightKg.set(null);
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n)) this.weightKg.set(Math.round(Math.min(MAX_WEIGHT_KG, Math.max(MIN_WEIGHT_KG, n)) * 2) / 2);
    input.value = String(this.weightKg() ?? '');
  }
}
