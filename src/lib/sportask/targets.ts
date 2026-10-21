import { addDays, startOfWeek } from '../dates';
import type { MetricKind, SportBlock, SportaskSettings } from '../../types/sportask';
import type { AnyGoal, Catalog, GenerationContext } from './engine/context';
import { available } from './engine/filter';
import { type LadderParams, replayLadders, usableAlternatives } from './engine/progression';
import { phaseFor, programWeek } from './engine/schedule';
import { GOALS } from './goals';
import { netKcal, workSecondsDone } from './kcal';
import { activityScale, trainingDays } from './profile';

/**
 * The weekly objectives of the enrolled program (0.25), worked out from the goal, the user's profile (days a week, activity, baseline),
 * the equipment and limits, and the history. Nothing here is stored: two devices with the same history and settings show the same
 * numbers. Pure, lazy, no `Date.now()` (`today` is passed in).
 *
 * - `days`: training days this week against the days a week the user wants (never more than the program prescribes).
 * - `minutes`: active minutes this week against the program's weekly minutes scaled to those days and the user's activity, then
 *   adapted from the complete weeks so far: +10% after a week that reached 90% of it, -20% after one under half (within 0.6x and 1.5x).
 * - `kcal`: calories only, with a body weight: the minutes target turned into an estimate with the average MET of what the user can do.
 * - `rung`: strength: the next step of a ladder (two rungs above where it started, or one above where the user is now).
 * - `test`: mobility and calories: a 25% better result (at least a few units) than the starting one, then than the last one that reached it.
 */

export type TargetKind = 'days' | 'minutes' | 'kcal' | 'rung' | 'test';

export interface GoalTarget {
  id: string;
  kind: TargetKind;
  current: number;
  target: number;
  /** Where it started: the first rung, the first test result. */
  from?: number;
  /** 0 to 1. */
  progress: number;
  /** The target has been reached (this week, or for a rung/test: right now). */
  met: boolean;
  ladderId?: string;
  /** For a rung: an exercise of the rung the user is on and of the target one (usable with their equipment), to name them. */
  currentExerciseId?: string;
  targetExerciseId?: string;
  assessmentId?: string;
  metric?: MetricKind;
  higherIsBetter?: boolean;
}

export interface TargetInput {
  /** Sanitised settings. */
  settings: SportaskSettings;
  /** Every block, any order. */
  history: readonly SportBlock[];
  today: string;
  catalog: Catalog;
  weightKg: number | null;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const round5 = (n: number): number => Math.round(n / 5) * 5;
const MIN_WEEKLY_MINUTES = 10;

const counted = (b: Pick<SportBlock, 'status'>): boolean => b.status === 'done' || b.status === 'partial';
const isGoalWork = (b: SportBlock, goalId: string): boolean => b.origin === 'goal' && b.goalId === goalId && counted(b) && b.kind !== 'test';

/** The program's weekly minutes for a phase, scaled to the user's training days and activity: the plan before any adaptation. */
export function baseWeeklyMinutes(goal: AnyGoal, programDays: number, params: unknown, settings: Pick<SportaskSettings, 'profile'>): number | null {
  const spec = goal.targets;
  if (!spec) return null;
  const days = trainingDays(programDays, settings.profile);
  return Math.max(MIN_WEEKLY_MINUTES, round5((spec.weeklyMinutes(params) * (days / programDays)) * activityScale(settings.profile)));
}

/** The weekly minutes target after the complete weeks so far: replays +10% / -20% steps, deterministic from the history. */
export function adaptedMinutes(base: number, weeklyMinutes: readonly number[]): number {
  let target = base;
  for (const m of weeklyMinutes) {
    if (m >= target * 0.9) target = Math.min(base * 1.5, target * 1.1);
    else if (m < target * 0.5) target = Math.max(base * 0.6, target * 0.8);
  }
  return Math.max(MIN_WEEKLY_MINUTES, round5(target));
}

/** Active minutes of each complete week after the first one with a block of the goal, oldest first. */
function completeWeeks(history: readonly SportBlock[], goalId: string, today: string): number[] {
  const own = history.filter((b) => isGoalWork(b, goalId));
  if (own.length === 0) return [];
  const firstWeek = startOfWeek(own.reduce((min, b) => (b.date < min ? b.date : min), own[0]!.date));
  const thisWeek = startOfWeek(today);
  const out: number[] = [];
  for (let w = addDays(firstWeek, 7); w < thisWeek; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    let seconds = 0;
    for (const b of own) if (b.date >= w && b.date <= end) seconds += workSecondsDone(b);
    out.push(seconds / 60);
  }
  return out.slice(-12);
}

function testPoints(history: readonly SportBlock[], assessmentId: string): number[] {
  const byDate = new Map<string, number[]>();
  for (const b of [...history].sort((x, y) => x.startedAt - y.startedAt)) {
    if (b.kind !== 'test' || b.assessmentId !== assessmentId || b.status === 'skipped') continue;
    const done = new Set(b.results.filter((r) => r.done).map((r) => r.stepIndex));
    const values: number[] = [];
    b.steps.forEach((_, i) => {
      const v = b.results.find((r) => r.stepIndex === i)?.value;
      if (done.has(i) && v !== undefined) values.push(v);
    });
    if (values.length > 0) byDate.set(b.date, values);
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v.reduce((t, x) => t + x, 0) / v.length);
}

const MIN_STEP: Record<MetricKind, number> = { reps: 2, seconds: 5, cm: 2 };

/** The target after `base`: 25% better, at least a few units; a distance already at zero (or overlapping) has nowhere to go. */
export function nextTestTarget(base: number, metric: MetricKind, higherIsBetter: boolean): number {
  const step = Math.max(MIN_STEP[metric], Math.round(Math.abs(base) * 0.25));
  if (higherIsBetter) return base + step;
  return base > 0 ? Math.max(0, base - step) : base;
}

function analysisContext(input: TargetInput): GenerationContext {
  const { settings } = input;
  return {
    blockId: 'targets',
    blockSeconds: 0,
    now: 0,
    today: input.today,
    catalog: input.catalog,
    equipment: settings.equipment,
    constraints: settings.constraints,
    history: [...input.history].sort((a, b) => a.startedAt - b.startedAt),
    todayBlocks: [],
    enrolment: settings.enrolment,
    ...(settings.profile ? { profile: settings.profile } : {}),
    rng: () => 0.5,
  };
}

/** The objectives of the enrolled goal, in display order; empty without an enrolment (free training has none) or a goal without targets. */
export function goalTargets(input: TargetInput): GoalTarget[] {
  const e = input.settings.enrolment;
  const goal = e ? GOALS.get(e.goalId) : undefined;
  if (!e || !goal?.targets) return [];
  const program = goal.programs.find((p) => p.id === e.programId) ?? goal.programs[0]!;
  const position = programWeek(e.startedOn, input.today, program.weeks);
  const params = phaseFor(program, position.week).params;
  const spec = goal.targets;
  const out: GoalTarget[] = [];

  const monday = startOfWeek(input.today);
  const week = input.history.filter((b) => b.date >= monday && b.date <= input.today && isGoalWork(b, goal.id));

  const days = trainingDays(program.daysPerWeek, input.settings.profile);
  const trained = new Set(week.map((b) => b.date)).size;
  out.push({ id: 'days', kind: 'days', current: trained, target: days, progress: clamp01(trained / days), met: trained >= days });

  const base = baseWeeklyMinutes(goal, program.daysPerWeek, params, input.settings) ?? MIN_WEEKLY_MINUTES;
  const minutesTarget = adaptedMinutes(base, completeWeeks(input.history, goal.id, input.today));
  const minutes = week.reduce((t, b) => t + workSecondsDone(b), 0) / 60;
  out.push({ id: 'minutes', kind: 'minutes', current: minutes, target: minutesTarget, progress: clamp01(minutes / minutesTarget), met: minutes >= minutesTarget });

  if (spec.kcal && input.weightKg) {
    const p = params as { maxLevel?: number; allowHighImpact?: boolean };
    const mets = input.catalog.exercises.all
      .filter((x) => x.tags.includes(goal.tag) && x.pattern !== 'mobility' && x.level <= (p.maxLevel ?? 5) && (x.impact !== 'high' || p.allowHighImpact === true) && available(x, input.settings))
      .map((x) => x.met);
    const avg = mets.length > 0 ? mets.reduce((t, m) => t + m, 0) / mets.length : 4;
    const kcalTarget = Math.max(10, Math.round(((minutesTarget / 60) * Math.max(0, avg - 1) * input.weightKg) / 10) * 10);
    const kcal = week.reduce((t, b) => t + netKcal(b, input.catalog, input.weightKg), 0);
    out.push({ id: 'kcal', kind: 'kcal', current: kcal, target: kcalTarget, progress: clamp01(kcal / kcalTarget), met: kcal >= kcalTarget });
  }

  if (spec.ladders?.length) {
    const ctx = analysisContext(input);
    const states = replayLadders(ctx, params as LadderParams);
    for (const id of spec.ladders) {
      const state = states.get(id);
      const ladder = input.catalog.ladders.get(id);
      if (!state || !ladder) continue;
      let top = -1;
      for (let r = ladder.rungs.length - 1; r >= 0 && top < 0; r--) if (usableAlternatives(ladder, r, ctx).length > 0) top = r;
      if (top < 0) continue;
      let target = Math.min(top, Math.max(state.from + 2, state.rung + 1));
      while (target < top && usableAlternatives(ladder, target, ctx).length === 0) target += 1;
      const atTop = state.rung >= top;
      const span = Math.max(1, target - state.from);
      const progress = atTop ? 1 : clamp01((state.rung - state.from + state.successes / 2) / span);
      const nameOf = (rung: number): string | undefined => usableAlternatives(ladder, rung, ctx)[0]?.id;
      const t: GoalTarget = { id: `rung:${id}`, kind: 'rung', current: state.rung, target, from: state.from, progress, met: atTop, ladderId: id };
      const cur = nameOf(state.rung);
      const tgt = nameOf(target);
      if (cur) t.currentExerciseId = cur;
      if (tgt) t.targetExerciseId = tgt;
      out.push(t);
    }
  }

  for (const id of spec.assessments ?? []) {
    const def = input.catalog.assessments.get(id);
    const points = testPoints(input.history, id);
    if (!def || points.length === 0) continue;
    const first = points[0]!;
    const current = points[points.length - 1]!;
    let base = first;
    for (const v of points.slice(1)) {
      const reached = def.higherIsBetter ? v >= nextTestTarget(base, def.metric, true) : v <= nextTestTarget(base, def.metric, false);
      if (reached) base = v;
    }
    const target = nextTestTarget(base, def.metric, def.higherIsBetter);
    const nothingLeft = target === base;
    const gain = def.higherIsBetter ? current - base : base - current;
    const need = Math.abs(target - base);
    out.push({
      id: `test:${id}`,
      kind: 'test',
      current,
      target: nothingLeft ? current : target,
      from: first,
      progress: nothingLeft ? 1 : clamp01(gain / need),
      met: nothingLeft || (def.higherIsBetter ? current >= target : current <= target),
      assessmentId: id,
      metric: def.metric,
      higherIsBetter: def.higherIsBetter,
    });
  }
  return out;
}
