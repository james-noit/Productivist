import type { DailyObjective } from '../services/daily-plan.service';

/** One objective's slice of the committed plan (`objective` null = tasks with no, or a vanished, objective). */
export interface PlanGroup {
  objective: DailyObjective | null;
  /** Existing tasks, in plan order. */
  taskIds: string[];
  done: number;
  total: number;
}

/**
 * The committed plan grouped by objective, in the objectives' order, then the tasks without a valid objective.
 * `done` maps an existing task id to its completion; ids missing from it (deleted tasks) are left out.
 */
export function planGroups(
  order: readonly string[],
  objectives: readonly DailyObjective[],
  assignments: Readonly<Record<string, string>>,
  done: ReadonlyMap<string, boolean>,
): PlanGroup[] {
  const groups = new Map<string, PlanGroup>(
    objectives.map((objective) => [objective.id, { objective, taskIds: [], done: 0, total: 0 }] as const),
  );
  const other: PlanGroup = { objective: null, taskIds: [], done: 0, total: 0 };
  for (const id of order) {
    const isDone = done.get(id);
    if (isDone === undefined) continue;
    const group = groups.get(assignments[id]) ?? other;
    group.taskIds.push(id);
    group.total++;
    if (isDone) group.done++;
  }
  const result = [...groups.values()].filter((g) => g.total > 0);
  if (other.total > 0) result.push(other);
  return result;
}

/** The first open task after `afterId` in plan order, wrapping around to the first open one; null when none is open. */
export function nextOpenTask(order: readonly string[], done: ReadonlyMap<string, boolean>, afterId: string | null): string | null {
  const open = (id: string) => done.get(id) === false;
  const at = afterId ? order.indexOf(afterId) : -1;
  for (let i = at + 1; i < order.length; i++) if (open(order[i])) return order[i];
  return order.find(open) ?? null;
}
