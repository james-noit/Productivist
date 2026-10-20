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

export function scaleDose(dose: Dose, factor: number): Dose {
  if (dose.seconds !== undefined) return { seconds: Math.max(5, Math.floor(dose.seconds * factor)) };
  return { reps: Math.max(1, Math.floor((dose.reps ?? 1) * factor)) };
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
        workSeconds = need;
        target = { reps };
      } else {
        const fitted = Math.max(1, Math.floor((w - 5) / secondsPerRep(ex, spec.tempo)));
        workSeconds = Math.min(w, repWork(ex, fitted, spec.tempo));
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

/** Candidates for a short easy mobility finish: mobility-tagged, available, level <= 2. */
export function mobilityCandidates(ctx: GenerationContext): ExerciseDef[] {
  return ctx.catalog.exercises.all.filter((e) => e.tags.includes('mobility') && e.level <= 2 && available(e, ctx));
}

/** The mobility finish of long strength/calories blocks: up to two holds that fit in `seconds`. */
export function mobilityTail(ctx: GenerationContext, seconds: number, avoidIds: Iterable<string>, round?: number): BlockStep[] {
  if (seconds <= 0) return [];
  const avoid = new Set(avoidIds);
  const steps: BlockStep[] = [];
  const first = pickExercise(mobilityCandidates(ctx), ctx, { avoidIds: avoid });
  if (!first) return steps;
  avoid.add(first.id);
  const zones = first.zones ?? [];
  const second = pickExercise(
    mobilityCandidates(ctx).filter((e) => !e.zones?.some((z) => zones.includes(z))),
    ctx,
    { avoidIds: avoid },
  );
  const picks = second ? [first, second] : [first];
  const each = Math.floor(seconds / picks.length);
  picks.forEach((ex, i) => {
    steps.push(...slotSteps({ ex, work: each - (i < picks.length - 1 ? 5 : 0), rest: 5, ...(round !== undefined ? { round } : {}) }));
  });
  return steps;
}
