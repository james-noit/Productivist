import type { BlockKind, BlockPlan, BlockStep, Dose, ExerciseDef } from '../../../types/sportask';
import type { GenerationContext } from './context';
import { available } from './filter';
import { pickExercise } from './select';

export type GoalKind = 'mobility' | 'strength' | 'calories';

/** How a block length becomes a structure (PLAN section 8.2). `tail` is the mobility time reserved at the end of long blocks. */
export interface Sizing {
  prep: number;
  slots: number;
  rounds: number;
  tail: number;
}

export function slotsFor(blockSeconds: number, kind: GoalKind): Sizing {
  if (blockSeconds < 45) return { prep: Math.max(0, Math.min(5, Math.floor(blockSeconds / 4))), slots: 1, rounds: 1, tail: 0 };
  if (blockSeconds < 90) return { prep: 10, slots: kind === 'mobility' ? 2 : 1, rounds: 1, tail: 0 };
  if (blockSeconds < 180) return { prep: 10, slots: 2, rounds: 1, tail: 0 };
  if (blockSeconds < 420) return { prep: 15, slots: blockSeconds < 300 ? 3 : 4, rounds: 1, tail: 0 };
  if (blockSeconds < 900) return { prep: 15, slots: blockSeconds < 540 ? 3 : blockSeconds < 720 ? 4 : 5, rounds: 2, tail: 0 };
  return {
    prep: 20,
    slots: blockSeconds < 1200 ? 4 : blockSeconds < 1500 ? 5 : 6,
    rounds: blockSeconds < 1500 ? 2 : 3,
    tail: kind === 'mobility' ? 0 : blockSeconds < 1200 ? 60 : 90,
  };
}

export const SWITCH_SECONDS = 0;

export function secondsPerRep(ex: ExerciseDef, tempo = 1): number {
  return (ex.secondsPerRep ?? 3) * tempo;
}

/** Work time that a rep target needs: reps x seconds per rep, plus 5 s of set-up. */
export function repWork(ex: ExerciseDef, reps: number, tempo = 1): number {
  return Math.ceil(reps * secondsPerRep(ex, tempo) + 5);
}

/** Work time per slot when `n` slots share `avail` seconds with `rest` between them (none after the last). */
export function slotWorkFor(avail: number, n: number, rest: number): number {
  return Math.floor((avail - (n - 1) * rest) / n);
}

/** Scales a dose, never below the sensible minimum (3 reps, 15 s) or below the original when that is already smaller. */
export function scaleDose(dose: Dose, factor: number): Dose {
  if (dose.seconds !== undefined) return { seconds: Math.max(Math.min(MIN_STEP_SECONDS, dose.seconds), Math.floor(dose.seconds * factor)) };
  const reps = dose.reps ?? 1;
  return { reps: Math.max(Math.min(MIN_REPS, reps), Math.floor(reps * factor)) };
}

/** No step is shorter than this, and no rep target is lower than MIN_REPS (unless the exercise's own default is). */
export const MIN_STEP_SECONDS = 15;
export const MIN_REPS = 3;

/** Whether the exercise can be done sensibly in `window` seconds (all sides): >= 15 s per side and at least 3 reps. */
export function fitsWindow(ex: ExerciseDef, window: number, tempo = 1): boolean {
  const w = Math.floor(window / (ex.perSide ? 2 : 1));
  if (w < MIN_STEP_SECONDS) return false;
  if (ex.dose.reps !== undefined) return repWork(ex, Math.min(MIN_REPS, ex.dose.reps), tempo) <= w;
  return true;
}

export interface SlotSpec {
  ex: ExerciseDef;
  /** The dose to aim for. Ignored (except as a hint) with `fixed`. */
  target?: Dose;
  loadKg?: number;
  /** Time available for the work of the whole slot, all sides included. */
  work: number;
  /** Rest after the slot. */
  rest: number;
  round?: number;
  tempo?: number;
  /** Interval work: the work is exactly the window, whatever the dose. */
  fixed?: boolean;
  /** Which side to do when the exercise is per side but the slot is a single step (intervals). */
  sideOverride?: 'left' | 'right';
}

/** Turns one slot into one step, or two for a per-side exercise. The target is reduced to fit the window, never the opposite. */
export function slotSteps(spec: SlotSpec): BlockStep[] {
  const { ex } = spec;
  const split = ex.perSide === true && !spec.sideOverride;
  const sides = split ? 2 : 1;
  const w = Math.max(1, Math.floor(spec.work / sides));
  let workSeconds: number;
  let target: Dose | undefined;
  if (spec.fixed) {
    workSeconds = w;
    if (ex.metric === 'seconds') target = { seconds: w };
  } else {
    const dose = spec.target ?? ex.dose;
    if (dose.seconds !== undefined) {
      const seconds = Math.max(1, Math.min(Math.floor(dose.seconds), w));
      workSeconds = seconds;
      target = { seconds };
    } else {
      const reps = Math.max(1, Math.floor(dose.reps ?? 1));
      const need = repWork(ex, reps, spec.tempo);
      if (need <= w) {
        workSeconds = Math.min(w, Math.max(need, MIN_STEP_SECONDS));
        target = { reps };
      } else {
        const fitted = Math.max(1, Math.floor((w - 5) / secondsPerRep(ex, spec.tempo)));
        workSeconds = Math.min(w, Math.max(repWork(ex, fitted, spec.tempo), MIN_STEP_SECONDS));
        target = { reps: fitted };
      }
    }
  }
  const make = (side: 'left' | 'right' | undefined, rest: number): BlockStep => {
    const step: BlockStep = { exerciseId: ex.id, workSeconds, restSeconds: Math.max(0, Math.floor(rest)) };
    if (target) step.target = { ...target };
    if (side) step.side = side;
    if (spec.loadKg !== undefined) step.loadKg = spec.loadKg;
    if (spec.round !== undefined) step.round = spec.round;
    return step;
  };
  if (split) return [make('left', SWITCH_SECONDS), make('right', spec.rest)];
  return [make(spec.sideOverride, spec.rest)];
}

/**
 * Closes a plan: whatever time is left becomes the last step's rest ("breathe / walk"), never a silent gap, so the total equals the
 * block length. If the steps overflow (they should not), whole steps are dropped from the end, then the last one is shortened.
 */
export function finalizePlan(kind: BlockKind, prep: number, steps: BlockStep[], blockSeconds: number, assessmentId?: string): BlockPlan {
  const out = steps.map((s) => ({ ...s, target: s.target ? { ...s.target } : undefined }));
  const used = (): number => prep + out.reduce((t, s, i) => t + s.workSeconds + (i === out.length - 1 ? 0 : s.restSeconds), 0);
  while (out.length > 1 && used() > blockSeconds) out.pop();
  const last = out[out.length - 1];
  if (last) {
    const over = used() - blockSeconds;
    if (over > 0) last.workSeconds = Math.max(1, last.workSeconds - over);
    last.restSeconds = Math.max(0, blockSeconds - used());
  }
  const clean = out.map((s) => {
    const step = { ...s };
    if (!step.target) delete step.target;
    return step;
  });
  const total = prep + clean.reduce((t, s) => t + s.workSeconds + s.restSeconds, 0);
  const plan: BlockPlan = { kind, prepSeconds: prep, steps: clean, totalSeconds: total };
  if (assessmentId) plan.assessmentId = assessmentId;
  return plan;
}

/** Candidates for a short easy mobility finish: mobility-tagged, available, level <= 2 (and whatever `filter` allows). */
export function mobilityCandidates(ctx: GenerationContext, filter?: (e: ExerciseDef) => boolean): ExerciseDef[] {
  return ctx.catalog.exercises.all.filter((e) => e.tags.includes('mobility') && e.level <= 2 && available(e, ctx) && (!filter || filter(e)));
}

/** Smallest worthwhile filler: 20 s of work per side, at least 3 reps (5 s of set-up included in the rep time). */
const FILLER_WORK = 20;

interface FillerPlan {
  dose: Dose;
  perSide: number;
  total: number;
}
function fillerPlan(ex: ExerciseDef): FillerPlan {
  const sides = ex.perSide ? 2 : 1;
  if (ex.dose.seconds !== undefined) {
    const seconds = Math.max(FILLER_WORK, ex.dose.seconds);
    return { dose: { seconds }, perSide: seconds, total: seconds * sides };
  }
  const reps = Math.max(MIN_REPS, ex.dose.reps ?? MIN_REPS, Math.ceil((FILLER_WORK - 5) / secondsPerRep(ex)));
  const perSide = repWork(ex, reps);
  return { dose: { reps }, perSide, total: perSide * sides };
}

/**
 * Short mobility holds that fit in `seconds` (PLAN section 8.2's mobility finish). Each filler is a real step: at least 20 s of work per side
 * and at least 3 reps or a 20 s hold. Floor exercises only when `allowFloor` (the block already uses the floor). May return fewer
 * steps than fit, or none.
 */
export function mobilityTail(
  ctx: GenerationContext,
  seconds: number,
  avoidIds: Iterable<string>,
  filter?: (e: ExerciseDef) => boolean,
  allowFloor = false,
): BlockStep[] {
  const steps: BlockStep[] = [];
  const avoid = new Set(avoidIds);
  let remaining = seconds;
  let lastZones: readonly string[] = [];
  while (remaining >= FILLER_WORK) {
    let eligible = mobilityCandidates(ctx, filter).filter((e) => (allowFloor || !e.floor) && fillerPlan(e).total <= remaining);
    const fresh = eligible.filter((e) => !e.zones?.some((z) => lastZones.includes(z)));
    if (fresh.length > 0) eligible = fresh;
    const ex = pickExercise(eligible, ctx, { avoidIds: avoid });
    if (!ex) break;
    const plan = fillerPlan(ex);
    steps.push(...slotSteps({ ex, target: plan.dose, work: plan.total, rest: 5 }));
    remaining -= plan.total + 5;
    avoid.add(ex.id);
    lastZones = ex.zones ?? [];
  }
  return steps;
}

/** Leftover shorter than this stays as the last step's rest ("breathe / walk"). */
export const MIN_FILL_SECONDS = 30;

/**
 * Time the generator did not use becomes a few mobility holds instead of dead time (PLAN section 8.2: no silent gap), but only when at
 * least MIN_FILL_SECONDS are left; the last step's rest is padding, so it is given up for them. Appends to `steps`.
 */
export function fillRemainder(ctx: GenerationContext, steps: BlockStep[], prep: number, avoidIds: Iterable<string>, filter?: (e: ExerciseDef) => boolean): void {
  if (steps.length === 0) return;
  const tail = steps[steps.length - 1]!;
  const original = tail.restSeconds;
  const withoutRest = prep + steps.reduce((t, s, i) => t + s.workSeconds + (i === steps.length - 1 ? 0 : s.restSeconds), 0);
  const remaining = ctx.blockSeconds - withoutRest;
  if (remaining < MIN_FILL_SECONDS) return;
  const usesFloor = steps.some((s) => ctx.catalog.exercises.get(s.exerciseId)?.floor);
  tail.restSeconds = 0;
  const extra = mobilityTail(ctx, remaining, [...avoidIds, ...steps.map((s) => s.exerciseId)], filter, usesFloor);
  if (extra.length === 0) tail.restSeconds = original;
  else steps.push(...extra);
}
