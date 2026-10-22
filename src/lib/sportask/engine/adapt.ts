import { diffDays } from '../../dates';
import type { SportBlock } from '../../../types/sportask';
import { capacityFactor } from '../profile';
import type { GenerationContext } from './context';

/**
 * How the dose adapts to the person (0.25), all derived from the history and the profile, nothing stored:
 *  - `capacity`: the starting scale from the level and the profile (`profile.ts`);
 *  - `dynamic`: a step back after days away and a nudge from the recent effort ratings.
 * `factor` is their product. Pure; `ctx.today` is the clock.
 */
export interface Adaptation {
  capacity: number;
  dynamic: number;
  factor: number;
  /** Days since the last block of the goal before today, or null when there is none. */
  away: number | null;
  reason?: 'return' | 'ease' | 'push';
}

const counts = (b: Pick<SportBlock, 'status'>): boolean => b.status === 'done' || b.status === 'partial';

/** How hard a block felt: +1 too hard (or a very high effort rating), -1 too easy (or a very low one), 0 otherwise. The feedback chip wins over the number. */
export function effortOf(b: Pick<SportBlock, 'feedback' | 'rpe'>): -1 | 0 | 1 {
  if (b.feedback === 'tooHard') return 1;
  if (b.feedback === 'tooEasy') return -1;
  if (b.rpe !== undefined) return b.rpe >= 9 ? 1 : b.rpe <= 3 ? -1 : 0;
  return 0;
}

/** Days away at which the dose steps back, and by how much (the ladders step back on their own, see `progression.ts`). */
export function returnFactor(away: number | null): number {
  if (away === null || away < 7) return 1;
  if (away < 14) return 0.9;
  if (away < 28) return 0.8;
  return 0.7;
}

/** Days from the last counted block of the goal before `today` to `today`; null without one. */
export function daysAway(history: readonly SportBlock[], today: string, goalId: string): number | null {
  let last: string | null = null;
  for (const b of history) {
    if (b.origin !== 'goal' || b.goalId !== goalId || !counts(b) || b.date >= today) continue;
    if (last === null || b.date > last) last = b.date;
  }
  return last === null ? null : diffDays(last, today);
}

/** The day the user came back to the goal after the latest absence of at least `gapDays`, or null when there was none (or no history). */
export function returnDate(history: readonly SportBlock[], goalId: string, gapDays: number): string | null {
  const dates = [...new Set(history.filter((b) => b.origin === 'goal' && b.goalId === goalId && counts(b)).map((b) => b.date))].sort();
  for (let i = dates.length - 1; i > 0; i--) if (diffDays(dates[i - 1]!, dates[i]!) >= gapDays) return dates[i]!;
  return null;
}

const EFFORT_WINDOW = 5;
const EFFORT_DAYS = 21;
const EFFORT_MIN_BLOCKS = 3;

/** The mean effort (-1..1) of the goal's last training blocks within three weeks; null with fewer than three. */
export function recentEffort(history: readonly SportBlock[], today: string, goalId: string): number | null {
  const recent: number[] = [];
  for (let i = history.length - 1; i >= 0 && recent.length < EFFORT_WINDOW; i--) {
    const b = history[i]!;
    if (b.origin !== 'goal' || b.goalId !== goalId || !counts(b) || b.kind !== 'train') continue;
    if (diffDays(b.date, today) > EFFORT_DAYS) break;
    recent.push(effortOf(b));
  }
  return recent.length < EFFORT_MIN_BLOCKS ? null : recent.reduce((t, e) => t + e, 0) / recent.length;
}

/** The adaptation for a block of `goalId` made now. */
export function adaptation(ctx: Pick<GenerationContext, 'history' | 'today' | 'enrolment' | 'profile'>, goalId: string): Adaptation {
  const level = ctx.enrolment?.level ?? 1;
  const capacity = capacityFactor(goalId, level, ctx.profile);
  const away = daysAway(ctx.history, ctx.today, goalId);
  const back = returnFactor(away);
  const effort = recentEffort(ctx.history, ctx.today, goalId);
  const effortFactor = effort === null ? 1 : effort >= 0.5 ? 0.9 : effort <= -0.5 ? 1.1 : 1;
  const dynamic = back * effortFactor;
  const factor = Math.min(1.3, Math.max(0.6, capacity * dynamic));
  const out: Adaptation = { capacity, dynamic, factor, away };
  if (back < 1) out.reason = 'return';
  else if (effortFactor < 1) out.reason = 'ease';
  else if (effortFactor > 1) out.reason = 'push';
  return out;
}
