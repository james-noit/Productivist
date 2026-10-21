import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { createId } from '../../../core/create-id';
import { trapTab } from '../../../lib/focus-trap';
import { CATALOG } from '../../../lib/sportask/catalog';
import { generate } from '../../../lib/sportask/engine/generate';
import { GOALS } from '../../../lib/sportask/goals';
import { stepAt, timeline, type RunnerState } from '../../../lib/sportask/runner';
import { resultsFromRows, type ResultRow } from '../../../lib/sportask/results';
import { sanitizeSettings } from '../../../lib/sportask/sanitize';
import { closeBreak } from '../../../lib/sportask/session-ops';
import { blockRow, buildContext } from '../../../lib/sportask/session-context';
import { resolveSkin } from '../../../lib/sportask/skins';
import { BUILTIN_TEMPLATES } from '../../../lib/sportask/templates';
import { loadSportaskTexts, localize } from '../../../lib/sportask/texts';
import { ClockService } from '../../../services/clock.service';
import { SettingsService } from '../../../services/settings.service';
import { SportDataService } from '../../../services/sport-data.service';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import { SportaskService } from '../../../services/sportask.service';
import type { BlockStep, Feedback, MetricKind, PendingBlock } from '../../../types/sportask';
import { KebabMenuComponent } from '../kebab-menu/kebab-menu.component';
import { SportaskPictogramComponent } from '../sportask-pictogram/sportask-pictogram.component';
import { SportaskResultsFormComponent } from '../sportask-results-form/sportask-results-form.component';
import { SportaskSkinComponent } from '../sportask-skin/sportask-skin.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

type Stage = 'preview' | 'running' | 'results';
type Side = 'left' | 'right';
type DoseUnit = 'reps' | 'seconds';

const MAX_REROLLS = 3;

interface Dose {
  unit: DoseUnit;
  n: number;
}

interface StepRow {
  index: number;
  pictogram: string;
  name: string;
  side: Side | null;
  dose: Dose | null;
  loadKg: number | null;
  round: number | null;
  current: boolean;
}

/** What the running screen shows; `kind` decides the layout and what is read out loud. */
interface NowView {
  kind: 'prep' | 'work' | 'rest' | 'breathe';
  index: number;
  remaining: number;
  pictogram: string;
  name: string;
  cue: string;
  side: Side | null;
  dose: Dose | null;
  loadKg: number | null;
  repsStep: boolean;
  next: { name: string; side: Side | null; dose: Dose | null } | null;
}

const pad = (n: number): string => String(n).padStart(2, '0');
/** m:ss for the clock-like numbers. */
export const mmss = (seconds: number): string => `${Math.floor(Math.max(0, seconds) / 60)}:${pad(Math.max(0, seconds) % 60)}`;

/**
 * The training block of one break (docs/sportask/PLAN.md section 6). `AppComponent` renders it from
 * `SportaskService.breakOpen`, over every view, with --modal-z 60 (the ringing alarm, 200, stays above it).
 * Stages: Preview -> Running -> Results. Only the plan and its start time are stored (in the session, so a reload or another tab
 * resumes); where the block is, is derived from the clock: the break not started is the preview, a break in progress (running or
 * paused) is the runner at `total - remaining`, and the clock being back in focus (or "Finish now") is the results form.
 */
@Component({
  selector: 'app-sportask-break-modal',
  standalone: true,
  imports: [TranslatePipe, KebabMenuComponent, SportaskPictogramComponent, SportaskResultsFormComponent, SportaskSkinComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-break-modal.component.html',
  styleUrl: './sportask-break-modal.component.css',
})
export class SportaskBreakModalComponent {
  private readonly sportask = inject(SportaskService);
  protected readonly clock = inject(ClockService);
  private readonly store = inject(SportaskSettingsService);
  private readonly data = inject(SportDataService);
  private readonly appSettings = inject(SettingsService);
  private readonly translate = inject(TranslateService);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly ready = signal(false);
  protected readonly lang = this.appSettings.language;
  protected readonly maxRerolls = MAX_REROLLS;

  private readonly settings = computed(() => sanitizeSettings(this.store.settings()));
  /** The skin this surface wears (`data-sport-skin`), whatever the whole-app option says. */
  protected readonly skin = computed(() => resolveSkin(this.settings().skin));
  protected readonly session = this.sportask.session;
  protected readonly pending = computed(() => this.session()?.pending ?? null);
  protected readonly autoStarted = signal(false);

  /** "Finish now": the elapsed seconds when the user stopped the break early, or null. */
  private readonly finishedAt = signal<number | null>(null);
  /** Rep steps the user ticked off with "Done" before their time was up. */
  private readonly markedDone = signal<ReadonlySet<number>>(new Set());
  protected readonly confirm = signal<'discard' | null>(null);

  // ---- where the block is --------------------------------------------------------------------------------------------

  protected readonly stage = computed<Stage>(() => {
    const p = this.pending();
    if (!p) return 'preview';
    if (this.finishedAt() !== null) return 'results';
    const inBreak = this.clock.mode() === 'break';
    if (!inBreak) return 'results';
    return this.clock.running() || this.clock.remainingSeconds() < this.clock.totalSeconds() ? 'running' : 'preview';
  });

  /** Seconds of the break gone by (only meaningful while running). */
  private readonly elapsed = computed(() => Math.max(0, this.clock.totalSeconds() - this.clock.remainingSeconds()));
  private readonly runner = computed(() => {
    const p = this.pending();
    return p && this.stage() === 'running' ? stepAt(p.plan, this.elapsed()) : null;
  });

  // ---- catalog names --------------------------------------------------------------------------------------------------

  private readonly assessment = computed(() => {
    const id = this.pending()?.plan.assessmentId;
    return id ? CATALOG.assessments.get(id) : undefined;
  });

  protected readonly isTest = computed(() => this.pending()?.plan.kind === 'test');
  protected readonly isRestDay = computed(() => this.pending()?.meta.restDay === true);
  protected readonly fallback = computed(() => this.pending()?.meta.fallback ?? null);
  protected readonly phaseNote = computed(() => localize(this.pending()?.meta.phaseNote, this.lang()));
  protected readonly testInfo = computed(() => {
    const a = this.assessment();
    return a ? { name: localize(a.name, this.lang()), instructions: localize(a.instructions, this.lang()), metric: a.metric } : null;
  });

  /** The heading: which kind of block this is, as a translation key plus its parameters. */
  protected readonly heading = computed(() => {
    const p = this.pending();
    const lang = this.lang();
    if (!p) return { key: 'sportask.brk.head.freeAny', params: {} };
    const goalName = localize(p.meta.goalId ? GOALS.get(p.meta.goalId)?.name : undefined, lang);
    if (p.plan.kind === 'test') return { key: 'sportask.brk.head.test', params: { name: this.testInfo()?.name ?? '' } };
    if (p.meta.restDay) return { key: 'sportask.brk.head.rest', params: { goal: goalName } };
    if (p.meta.origin === 'goal') {
      return {
        key: p.plan.kind === 'warmup' ? 'sportask.brk.head.warmup' : 'sportask.brk.head.goal',
        params: { goal: goalName, week: p.meta.programWeek ?? 1 },
      };
    }
    const tpl = p.meta.templateId ? (BUILTIN_TEMPLATES.get(p.meta.templateId) ?? this.data.templates().find((t) => t.id === p.meta.templateId)) : undefined;
    const name = tpl ? (tpl.nameText ? localize(tpl.nameText, lang) : tpl.name) : '';
    return name ? { key: 'sportask.brk.head.free', params: { name } } : { key: 'sportask.brk.head.freeAny', params: {} };
  });

  private doseOf(step: BlockStep): Dose | null {
    if (step.target?.reps !== undefined) return { unit: 'reps', n: step.target.reps };
    if (step.target?.seconds !== undefined) return { unit: 'seconds', n: step.target.seconds };
    return CATALOG.exercises.get(step.exerciseId)?.metric === 'seconds' ? { unit: 'seconds', n: step.workSeconds } : null;
  }

  private nameOf(exerciseId: string): string {
    return localize(CATALOG.exercises.get(exerciseId)?.name, this.lang()) || exerciseId;
  }

  // ---- preview ----------------------------------------------------------------------------------------------------------

  protected readonly rows = computed<StepRow[]>(() => {
    const p = this.pending();
    if (!p) return [];
    const current = this.runner()?.phase === 'done' ? -1 : (this.runner()?.stepIndex ?? -1);
    return p.plan.steps.map((s, index) => ({
      index,
      pictogram: CATALOG.exercises.get(s.exerciseId)?.pictogram ?? 'march',
      name: this.nameOf(s.exerciseId),
      side: s.side ?? null,
      dose: this.doseOf(s),
      loadKg: s.loadKg ?? null,
      round: s.round ?? null,
      current: index === current,
    }));
  });
  protected readonly totalTime = computed(() => mmss(this.pending()?.plan.totalSeconds ?? 0));
  protected readonly canReroll = computed(() => (this.pending()?.rerolls ?? 0) < MAX_REROLLS && !this.isTest());

  // ---- running ----------------------------------------------------------------------------------------------------------

  protected readonly now = computed<NowView | null>(() => {
    const p = this.pending();
    const r = this.runner();
    if (!p || !r) return null;
    const steps = p.plan.steps;
    const last = steps.length - 1;
    const nextOf = (s: BlockStep | undefined | null): NowView['next'] =>
      s ? { name: this.nameOf(s.exerciseId), side: s.side ?? null, dose: this.doseOf(s) } : null;
    if (r.phase === 'done') return this.view('breathe', last, this.clock.remainingSeconds(), null);
    if (r.phase === 'prep') return this.view('prep', 0, r.stepRemaining, nextOf(steps[0]));
    const marked = r.phase === 'work' && this.markedDone().has(r.stepIndex);
    if (r.phase === 'rest' || marked) {
      return r.stepIndex >= last
        ? this.view('breathe', last, r.stepRemaining, null)
        : this.view('rest', r.stepIndex, r.stepRemaining, nextOf(steps[r.stepIndex + 1]));
    }
    return this.view('work', r.stepIndex, r.stepRemaining, nextOf(steps[r.stepIndex + 1]));
  });

  private view(kind: NowView['kind'], index: number, remaining: number, next: NowView['next']): NowView {
    const step = this.pending()?.plan.steps[index];
    const ex = step ? CATALOG.exercises.get(step.exerciseId) : undefined;
    const cues = ex?.cues ?? [];
    const upcoming = kind === 'rest' || kind === 'prep';
    const shown = upcoming && next ? this.pending()!.plan.steps[kind === 'prep' ? 0 : index + 1] : step;
    const shownEx = shown ? CATALOG.exercises.get(shown.exerciseId) : ex;
    const shownCues = shownEx?.cues ?? cues;
    return {
      kind,
      index,
      remaining,
      pictogram: kind === 'breathe' ? 'stretchStand' : (shownEx?.pictogram ?? 'march'),
      name: kind === 'breathe' ? '' : this.nameOf(shown?.exerciseId ?? ''),
      // A test shows the test's instructions where an exercise shows its form cues.
      cue: kind === 'breathe' ? '' : (kind === 'work' || kind === 'prep') && this.isTest() ? (this.testInfo()?.instructions ?? '') : localize(shownCues[0], this.lang()),
      side: kind === 'breathe' ? null : (shown?.side ?? null),
      dose: kind === 'breathe' || !shown ? null : this.doseOf(shown),
      loadKg: kind === 'breathe' ? null : (shown?.loadKg ?? null),
      repsStep: kind === 'work' && step?.target?.reps !== undefined,
      next: kind === 'work' ? next : null,
    };
  }

  /** The progress strip: every step (work + rest) as a segment as wide as its time. */
  protected readonly strip = computed(() => {
    const p = this.pending();
    if (!p) return [];
    const r = this.runner();
    const total = Math.max(1, p.plan.steps.reduce((t, s) => t + s.workSeconds + s.restSeconds, 0));
    return p.plan.steps.map((s, i) => {
      let state: 'past' | 'current' | 'todo' = 'todo';
      if (r?.phase === 'done') state = 'past';
      else if (r && r.phase !== 'prep') state = i < r.stepIndex ? 'past' : i === r.stepIndex ? 'current' : 'todo';
      return { width: ((s.workSeconds + s.restSeconds) / total) * 100, state };
    });
  });

  /** Read out loud when the step changes, and only then (no seconds in it). */
  private readonly announceKey = computed(() => {
    const n = this.now();
    return n ? `${n.kind}:${n.index}` : '';
  });
  protected readonly announce = computed(() => {
    this.announceKey();
    const n = untracked(this.now);
    if (!n) return null;
    const dose = n.dose ? this.translate.instant(`sportask.brk.unit.${n.dose.unit}`, { n: n.dose.n }) : '';
    return { key: `sportask.brk.say.${n.kind}`, params: { name: n.name, dose } };
  });

  protected readonly paused = computed(() => this.stage() === 'running' && !this.clock.running());

  // ---- results ----------------------------------------------------------------------------------------------------------

  private readonly resultsKey = computed(() => {
    const p = this.pending();
    return p && this.stage() === 'results' ? `${p.blockId}:${this.finishedAt() ?? 'full'}` : null;
  });

  /** One row per step, or one per exercise (and side) when the block repeats its circuit in rounds. */
  protected readonly draft = linkedSignal<string | null, ResultRow[]>({
    source: this.resultsKey,
    computation: (key) => (key ? untracked(() => this.buildRows()) : []),
  });
  protected readonly feedback = linkedSignal<string | null, Feedback | null>({ source: this.resultsKey, computation: () => 'ok' });
  protected readonly rpe = linkedSignal<string | null, number | null>({ source: this.resultsKey, computation: () => null });

  protected readonly allDone = computed(() => this.draft().length > 0 && this.draft().every((r) => r.done));

  private buildRows(): ResultRow[] {
    const p = this.pending();
    if (!p) return [];
    const finished = this.finishedAt();
    const elapsed = finished ?? (p.startedAt === null ? 0 : p.plan.totalSeconds);
    const workEnd = new Map<number, number>();
    for (const seg of timeline(p.plan)) if (seg.phase === 'work') workEnd.set(seg.stepIndex, seg.end);
    const marked = this.markedDone();
    const steps = p.plan.steps;
    const grouped = steps.some((s) => s.round !== undefined);
    const rows: ResultRow[] = [];
    const byKey = new Map<string, ResultRow>();
    steps.forEach((s, index) => {
      const ex = CATALOG.exercises.get(s.exerciseId);
      const metric: MetricKind = this.isTest() ? (this.assessment()?.metric ?? ex?.metric ?? 'reps') : (ex?.metric ?? 'reps');
      const dose = this.doseOf(s);
      const done = marked.has(index) || (workEnd.get(index) ?? Infinity) <= elapsed;
      const key = grouped ? `${s.exerciseId}|${s.side ?? ''}` : String(index);
      const existing = byKey.get(key);
      if (existing) {
        existing.indexes.push(index);
        existing.done = existing.done && done;
        return;
      }
      // A test starts empty (the user types the result); otherwise the field starts at the target.
      const prefill = this.isTest() || !dose || dose.unit !== metric ? null : dose.n;
      const row: ResultRow = {
        key,
        indexes: [index],
        name: this.nameOf(s.exerciseId),
        side: s.side ?? null,
        metric,
        loadable: ex?.loadable === true && !this.isTest(),
        value: prefill,
        loadKg: s.loadKg ?? null,
        done,
      };
      byKey.set(key, row);
      rows.push(row);
    });
    return rows;
  }

  // ---- lifecycle --------------------------------------------------------------------------------------------------------

  private cueKey: string | null = null;
  private countdownKey: string | null = null;

  constructor() {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void loadSportaskTexts(this.translate).then(() => this.ready.set(true));

    // Make the block (or take the one a reload left behind).
    const existing = this.pending();
    if (!existing || !Array.isArray(existing.plan?.steps) || existing.plan.steps.length === 0 || !existing.meta) this.makeBlock({});
    else this.maybeAutoStart();

    // Self-heal: an open modal with no block (another tab cleared it, or the first attempt failed) makes one. Written in a
    // microtask, and only while the break is still open, so closing the modal never brings a block back.
    effect(() => {
      if (this.session()?.active && !this.pending()) {
        queueMicrotask(() => {
          if (this.sportask.breakOpen() && !this.pending()) this.makeBlock({});
        });
      }
    });

    // Move focus to the stage's first control whenever the stage changes.
    effect(() => {
      this.stage();
      this.ready();
      this.confirm();
      afterNextRender(() => this.focusFirst(), { injector: this.injector });
    });

    // Step cues: a tone at each change and at 3-2-1 before one, only while the block runs and the page is visible.
    effect(() => {
      const r = this.runner();
      const running = this.clock.running();
      untracked(() => this.cue(r, running));
    });

    // Escape and Tab belong to this dialog; the ringing alarm (above it) gets the keys first.
    const onKey = (event: KeyboardEvent): void => {
      if (this.clock.alarmModalOpen()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.escape();
        return;
      }
      const panel = this.panel()?.nativeElement;
      if (panel && trapTab(event, panel)) event.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);

    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('keydown', onKey, true);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else document.body.focus();
    });
  }

  private focusFirst(): void {
    const panel = this.panel()?.nativeElement;
    if (!panel) return;
    const target = panel.querySelector<HTMLElement>('[data-first]') ?? panel;
    target.focus({ preventScroll: true });
  }

  private cue(r: RunnerState | null, running: boolean): void {
    if (!r || !running) {
      this.cueKey = null;
      this.countdownKey = null;
      return;
    }
    const audible = this.settings().cues && this.appSettings.bellSound() && document.visibilityState === 'visible';
    const key = `${r.phase}:${r.stepIndex}`;
    if (key !== this.cueKey) {
      this.cueKey = key;
      if (audible && r.phase !== 'done') this.clock.playCue('step');
      return;
    }
    const last = r.phase === 'rest' && r.stepIndex >= (this.pending()?.plan.steps.length ?? 1) - 1;
    if (audible && !last && r.phase !== 'done' && r.stepRemaining >= 1 && r.stepRemaining <= 3) {
      const tick = `${key}:${r.stepRemaining}`;
      if (tick !== this.countdownKey) {
        this.countdownKey = tick;
        this.clock.playCue('countdown');
      }
    }
  }

  // ---- making a block ---------------------------------------------------------------------------------------------------

  private makeBlock(opts: { reroll?: boolean; forceTrain?: boolean }): void {
    const session = this.session();
    if (!session) return;
    const previous = this.pending();
    const blockId = createId();
    const blockSeconds = this.clock.mode() === 'break' ? this.clock.totalSeconds() : session.cadence.breakSeconds;
    const forceTrain = opts.forceTrain ?? previous?.forceTrain ?? false;
    const settings = this.settings();
    const ctx = buildContext({
      blockId,
      blockSeconds,
      blocks: this.data.blocks(),
      settings,
      equipmentOverride: session.equipmentOverride,
    });
    const { plan, meta } = generate(ctx, { mode: session.mode, templateId: session.templateId }, settings, {
      templates: this.data.templates(),
      forceTrain,
    });
    const next: PendingBlock = {
      blockId,
      plan,
      startedAt: null,
      meta,
      blockSeconds: ctx.blockSeconds,
      rerolls: (previous?.rerolls ?? 0) + (opts.reroll ? 1 : 0),
    };
    if (forceTrain) next.forceTrain = true;
    this.sportask.session.update((s) => (s ? { ...s, pending: next } : s));
    this.markedDone.set(new Set());
    this.maybeAutoStart();
  }

  private maybeAutoStart(): void {
    if (this.settings().autoStartBreak && this.stage() === 'preview' && this.pending()?.startedAt === null && !this.autoStarted()) {
      this.autoStarted.set(true);
      // Not inside a click: the audio context may stay silent, but the block runs.
      queueMicrotask(() => this.begin());
    }
  }

  // ---- actions ----------------------------------------------------------------------------------------------------------

  protected begin(): void {
    const p = this.pending();
    if (!p || this.stage() !== 'preview') return;
    this.sportask.session.update((s) => (s ? { ...s, pending: { ...p, startedAt: Date.now() } } : s));
    this.clock.start();
  }

  protected another(): void {
    if (this.canReroll()) this.makeBlock({ reroll: true });
  }

  protected trainAnyway(): void {
    this.makeBlock({ forceTrain: true });
  }

  protected togglePause(): void {
    if (this.clock.running()) this.clock.pause();
    else this.clock.start();
  }

  protected finishNow(): void {
    this.finishedAt.set(this.elapsed());
    this.clock.pause();
  }

  protected markStepDone(index: number): void {
    this.markedDone.update((set) => new Set(set).add(index));
  }

  protected leave(): void {
    this.sportask.stop();
  }

  /** Records the block as skipped and goes back to a normal break. */
  protected skip(): void {
    const p = this.pending();
    if (p) this.data.addBlock(blockRow(p, { status: 'skipped', results: [] }));
    closeBreak(this.sportask);
  }

  protected save(andResume: boolean): void {
    const p = this.pending();
    if (!p || this.stage() !== 'results') return;
    const results = resultsFromRows(this.draft());
    const status = results.length > 0 && results.every((r) => r.done) ? 'done' : 'partial';
    this.data.addBlock(blockRow(p, { status, results, rpe: this.rpe(), feedback: this.isTest() ? null : this.feedback() }));
    const early = this.finishedAt() !== null;
    closeBreak(this.sportask);
    if (!andResume) return;
    // The break ended by itself: the clock is already back in focus. After "Finish now" it is still in the paused break.
    if (early || this.clock.mode() === 'break') this.clock.setMode('focus');
    this.clock.startNextSession();
  }

  protected discard(): void {
    const p = this.pending();
    if (p) this.data.addBlock(blockRow(p, { status: 'skipped', results: [] }));
    this.confirm.set(null);
    closeBreak(this.sportask);
  }

  protected cancelConfirm(): void {
    this.confirm.set(null);
  }

  private escape(): void {
    switch (this.stage()) {
      case 'results':
        this.confirm.update((c) => (c ? null : 'discard'));
        break;
      case 'preview':
        // Closing the preview without training is a skip.
        if (this.pending()) this.skip();
        break;
      default:
        break; // While the block runs Escape does nothing: Pause and Finish now are explicit.
    }
  }
}
