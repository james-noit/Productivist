import { addDays, diffDays, startOfWeek } from '../../dates';
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
 * of the goal, every day is one; after that only the days already trained are.
 */
export function isTrainingDay(ctx: GenerationContext, program: ProgramDef<unknown>, goalId: string): boolean {
  const monday = startOfWeek(ctx.today);
  const days = new Set<string>();
  for (const b of ctx.history) if (b.date >= monday && b.date <= ctx.today && isGoalWork(b, goalId)) days.add(b.date);
  return days.has(ctx.today) || days.size < program.daysPerWeek;
}

/**
 * The assessments pending today, in program order: it is an assessment week, today already has a done block, no test ran today, and the
 * assessment was not recorded yet in this program week. The caller still checks that it fits and that an exercise is available.
 */
export function pendingAssessmentIds(ctx: GenerationContext, program: ProgramDef<unknown>, position: ProgramPosition): string[] {
  if (!program.assessmentWeeks.includes(position.week)) return [];
  if (!ctx.todayBlocks.some((b) => b.status === 'done')) return [];
  if (ctx.todayBlocks.some((b) => b.kind === 'test')) return [];
  const weekEnd = addDays(position.weekStart, 6);
  const recorded = new Set<string>();
  for (const b of ctx.history) {
    if (b.kind === 'test' && b.assessmentId && b.status !== 'skipped' && b.date >= position.weekStart && b.date <= weekEnd) recorded.add(b.assessmentId);
  }
  return program.assessmentIds.filter((id) => !recorded.has(id));
}
