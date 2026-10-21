import { addDays, diffDays, startOfWeek } from '../../dates';
import { trainingDays } from '../profile';
import { returnDate } from './adapt';
import type { GenerationContext, PhaseDef, ProgramDef } from './context';

export interface ProgramPosition {
  /** 1-based week inside the program (cycles after the last week). */
  week: number;
  /** Number of completed cycles. */
  cycle: number;
  /** Weeks since the start (0-based, not cycled). */
  index: number;
  /** First day of the current program week. */
  weekStart: string;
}

export function programWeek(startedOn: string, today: string, weeks: number): ProgramPosition {
  const days = Math.max(0, diffDays(startedOn, today));
  const index = Math.floor(days / 7);
  const n = Math.max(1, weeks);
  return { week: (index % n) + 1, cycle: Math.floor(index / n), index, weekStart: addDays(startedOn, index * 7) };
}

/** The phase that covers `week`; weeks outside the table use the nearest phase. */
export function phaseFor<P>(program: ProgramDef<P>, week: number): PhaseDef<P> {
  const found = program.phases.find((p) => week >= p.fromWeek && week <= p.toWeek);
  if (found) return found;
  return week < program.phases[0]!.fromWeek ? program.phases[0]! : program.phases[program.phases.length - 1]!;
}

/** Monday = 0 ... Sunday = 6. */
export function weekdayIndex(iso: string): number {
  return diffDays(startOfWeek(iso), iso);
}

function isGoalWork(b: { origin: string; goalId?: string; status: string }, goalId: string): boolean {
  return b.origin === 'goal' && b.goalId === goalId && (b.status === 'done' || b.status === 'partial');
}

/**
 * Whether today counts as a training day of the program: until `daysPerWeek` distinct days of this ISO week have a done/partial block
 * of the goal, every day is one; after that only the days already trained are. `daysPerWeek` is the program's, or fewer if the user
 * asked for fewer days in their profile (0.25).
 */
export function isTrainingDay(ctx: GenerationContext, program: ProgramDef<unknown>, goalId: string): boolean {
  const monday = startOfWeek(ctx.today);
  const days = new Set<string>();
  for (const b of ctx.history) if (b.date >= monday && b.date <= ctx.today && isGoalWork(b, goalId)) days.add(b.date);
  return days.has(ctx.today) || days.size < trainingDays(program.daysPerWeek, ctx.profile);
}

/** Days away after which the user's return makes the tests due again whatever the program week (a re-baseline, PLAN 0.25), and how long that lasts. */
export const RETEST_AFTER_DAYS = 21;
export const RETEST_WINDOW_DAYS = 14;

/**
 * The assessments pending today, in program order: today already has a done block, no test ran today, and either it is an assessment
 * week and the assessment was not recorded yet in this program week, or the user came back after `RETEST_AFTER_DAYS` away within the last
 * `RETEST_WINDOW_DAYS` and the assessment was not recorded since (one a day, until they are all done: tests move the baseline after a
 * break). The caller still checks that it fits and that an exercise is available.
 */
export function pendingAssessmentIds(ctx: GenerationContext, program: ProgramDef<unknown>, position: ProgramPosition, goalId?: string): string[] {
  if (!ctx.todayBlocks.some((b) => b.status === 'done')) return [];
  if (ctx.todayBlocks.some((b) => b.kind === 'test')) return [];
  const back = goalId ? returnDate(ctx.history, goalId, RETEST_AFTER_DAYS) : null;
  const returning = back !== null && diffDays(back, ctx.today) <= RETEST_WINDOW_DAYS;
  const inWeek = program.assessmentWeeks.includes(position.week);
  if (!inWeek && !returning) return [];
  const from = inWeek ? position.weekStart : back!;
  const to = inWeek ? addDays(position.weekStart, 6) : ctx.today;
  const recorded = new Set<string>();
  for (const b of ctx.history) {
    if (b.kind === 'test' && b.assessmentId && b.status !== 'skipped' && b.date >= from && b.date <= to) recorded.add(b.assessmentId);
  }
  return program.assessmentIds.filter((id) => !recorded.has(id));
}
