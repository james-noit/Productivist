import type { BlockPlan, BlockStep } from '../../types/sportask';

export interface RunnerState {
  phase: 'prep' | 'work' | 'rest' | 'done';
  stepIndex: number;
  /** Seconds elapsed inside the current phase. */
  stepElapsed: number;
  /** Seconds left in the current phase (never negative). */
  stepRemaining: number;
  /** What comes after the current phase: the next step to do (during prep, the first). */
  next: BlockStep | null;
}

export interface Segment {
  start: number;
  end: number;
  phase: 'prep' | 'work' | 'rest';
  stepIndex: number;
}

/** The plan as contiguous segments (zero-length ones left out). The last end is `plan.totalSeconds`. */
export function timeline(plan: BlockPlan): Segment[] {
  const out: Segment[] = [];
  let t = 0;
  const push = (phase: Segment['phase'], stepIndex: number, length: number): void => {
    if (length <= 0) return;
    out.push({ start: t, end: t + length, phase, stepIndex });
    t += length;
  };
  push('prep', 0, plan.prepSeconds);
  plan.steps.forEach((s, i) => {
    push('work', i, s.workSeconds);
    push('rest', i, s.restSeconds);
  });
  return out;
}

export function stepAt(plan: BlockPlan, elapsedSeconds: number): RunnerState {
  const e = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const segments = timeline(plan);
  const seg = segments.find((s) => e >= s.start && e < s.end);
  if (!seg) return { phase: 'done', stepIndex: Math.max(0, plan.steps.length - 1), stepElapsed: 0, stepRemaining: 0, next: null };
  const upcoming = seg.phase === 'prep' ? (plan.steps[0] ?? null) : (plan.steps[seg.stepIndex + 1] ?? null);
  return { phase: seg.phase, stepIndex: seg.stepIndex, stepElapsed: e - seg.start, stepRemaining: Math.max(0, seg.end - e), next: upcoming };
}
