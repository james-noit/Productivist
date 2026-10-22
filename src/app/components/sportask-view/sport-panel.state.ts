import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { addDays, diffDays, formatIso, startOfWeek, todayIso } from '../../../lib/dates';
import { CATALOG } from '../../../lib/sportask/catalog';
import { programWeek } from '../../../lib/sportask/engine/schedule';
import { GOALS } from '../../../lib/sportask/goals';
import type { MetricEnv } from '../../../lib/sportask/metrics';
import { sanitizeSettings } from '../../../lib/sportask/sanitize';
import { resolveSkin } from '../../../lib/sportask/skins';
import { loadSportaskTexts, localize } from '../../../lib/sportask/texts';
import { SettingsService } from '../../../services/settings.service';
import { SportDataService } from '../../../services/sport-data.service';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import { ViewService } from '../../../services/view.service';
import type { SportBlock } from '../../../types/sportask';

export type PanelTab = 'summary' | 'progress' | 'history' | 'templates';
export const PANEL_TABS: readonly PanelTab[] = ['summary', 'progress', 'history', 'templates'];

/**
 * What the tabs of the Sportask panel share: the settings, the enrolment and where the user is in the program, the history
 * (sorted once), the metric environment and the text helper. A plain `@Injectable()` listed in `SportaskViewComponent`'s
 * `providers`, so it is lazy and dies with the page (never a root service).
 */
@Injectable()
export class SportPanelState {
  private readonly store = inject(SportaskSettingsService);
  private readonly data = inject(SportDataService);
  private readonly appSettings = inject(SettingsService);
  private readonly translate = inject(TranslateService);
  private readonly view = inject(ViewService);

  readonly ready = signal(false);
  readonly lang = this.appSettings.language;
  /** Bumped when the translations (re)load, so the labels built in a `computed` follow a language switch. */
  private readonly texts = signal(0);

  /** Device-local: the tab the panel opens on. An unknown stored value reads as the summary. */
  private readonly storedTab = localStorageSignal<string>('productivist.sportaskTab', 'summary');
  readonly tab = computed<PanelTab>(() => (PANEL_TABS.find((t) => t === this.storedTab()) ?? 'summary'));
  /** The weeks the Progress tab shows (4, 12, 52 or 0 = everything). */
  readonly weeks = localStorageSignal<number>('productivist.sportaskWeeks', 12);

  readonly today = signal(todayIso());

  constructor() {
    const bump = (): void => this.texts.update((n) => n + 1);
    const a = this.translate.onLangChange.subscribe(bump);
    const b = this.translate.onTranslationChange.subscribe(bump);
    inject(DestroyRef).onDestroy(() => {
      a.unsubscribe();
      b.unsubscribe();
    });
    void loadSportaskTexts(this.translate).then(() => {
      bump();
      this.ready.set(true);
    });
  }

  selectTab(tab: PanelTab): void {
    this.storedTab.set(tab);
  }

  /** A `sportask.*` string, re-read when the language or the loaded texts change. */
  t(key: string, params?: Record<string, unknown>): string {
    this.texts();
    this.lang();
    return this.translate.instant(`sportask.${key}`, params);
  }

  // ---- settings, enrolment ------------------------------------------------------------------------------------------

  readonly settings = computed(() => sanitizeSettings(this.store.settings()));
  readonly skin = computed(() => resolveSkin(this.settings().skin));
  readonly enrolment = computed(() => this.settings().enrolment);
  readonly goal = computed(() => {
    const e = this.enrolment();
    return e ? GOALS.get(e.goalId) : undefined;
  });
  readonly program = computed(() => {
    const e = this.enrolment();
    const goal = this.goal();
    return goal ? (goal.programs.find((p) => p.id === e?.programId) ?? goal.programs[0]) : undefined;
  });
  readonly position = computed(() => {
    const e = this.enrolment();
    const program = this.program();
    return e && program ? programWeek(e.startedOn, this.today(), program.weeks) : null;
  });

  // ---- history ------------------------------------------------------------------------------------------------------

  /** Every block, oldest first. */
  readonly blocks = computed<readonly SportBlock[]>(() => [...this.data.blocks()].sort((a, b) => a.startedAt - b.startedAt));
  readonly firstDate = computed(() => this.blocks()[0]?.date ?? null);

  readonly weightKg = this.store.weightKg;
  readonly env = computed<MetricEnv>(() => ({
    catalog: CATALOG,
    weightKg: this.weightKg() ?? null,
    enrolment: this.enrolment(),
    equipment: this.settings().equipment,
    constraints: this.settings().constraints,
    ...(this.settings().profile ? { profile: this.settings().profile } : {}),
  }));

  /** The metric ids to chart: the goal's, or the free-training ones without an enrolment. */
  readonly metricIds = computed(() => this.goal()?.metricIds ?? null);

  /**
   * The next test of the program: "this week" while an assessment week still has tests the user has not taken, otherwise the Monday
   * of the next assessment week. Null without a program or when the program has no tests.
   */
  readonly nextTest = computed<{ thisWeek: boolean; date: string } | null>(() => {
    const program = this.program();
    const pos = this.position();
    if (!program || !pos || program.assessmentWeeks.length === 0) return null;
    const end = addDays(pos.weekStart, 6);
    const taken = new Set(this.blocks().filter((b) => b.kind === 'test' && b.status !== 'skipped' && b.date >= pos.weekStart && b.date <= end).map((b) => b.assessmentId));
    if (program.assessmentWeeks.includes(pos.week) && program.assessmentIds.some((id) => !taken.has(id))) return { thisWeek: true, date: pos.weekStart };
    for (let k = 1; k <= program.weeks; k++) {
      if (program.assessmentWeeks.includes(((pos.week - 1 + k) % program.weeks) + 1)) return { thisWeek: false, date: addDays(pos.weekStart, 7 * k) };
    }
    return null;
  });

  /** The range of the Progress tab: `weeks` calendar weeks ending today (0 = from the first block). */
  readonly range = computed(() => {
    const today = this.today();
    const n = this.weeks();
    if (n <= 0) return { from: this.firstDate() ?? startOfWeek(today), to: today };
    return { from: addDays(startOfWeek(today), -(n - 1) * 7), to: today };
  });

  // ---- names --------------------------------------------------------------------------------------------------------

  exerciseName(id: string): string {
    return localize(CATALOG.exercises.get(id)?.name, this.lang()) || id;
  }

  private readonly longDay = computed(() => new Intl.DateTimeFormat(this.lang(), { weekday: 'long', day: 'numeric', month: 'short' }));
  /** A day as "Monday, 9 Mar" for the lines of the header. */
  dayLabel(iso: string): string {
    return formatIso(this.longDay(), iso);
  }

  daysFromToday(iso: string): number {
    return diffDays(this.today(), iso);
  }

  openConfiguration(): void {
    this.view.openConfiguration('sportask');
  }

  openPomodoro(): void {
    this.view.setView('pomodoro');
  }
}
