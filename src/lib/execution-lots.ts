import type { ExecutionLot } from '../services/daily-plan.service';

/**
 * The rules for execution lots once the plan is running (Multitask view). Pure and framework-free; the
 * stores (`DailyPlanService` for the lots, `MultitaskService` for the cards that mirror the active lot)
 * apply the results.
 *
 * Invariants: lots before the active one are locked and never change; a task is never in two lots; the
 * active lot is tracked by id across an edit and its index recomputed, so dropping an emptied future lot
 * can never change which lot is active.
 */
export type CarryMode = 'carry' | 'drop';

/** Unfinished = in the active lot, not done, and still on a card (a discarded card means "let go"). */
export function unfinishedInActive(
  lots: readonly ExecutionLot[],
  activeIndex: number,
  isDone: (taskId: string) => boolean,
  onCard: ReadonlySet<string>,
): string[] {
  const lot = lots[activeIndex];
  return lot ? lot.taskIds.filter((id) => !isDone(id) && onCard.has(id)) : [];
}

/**
 * Moves to the next lot.
 * - carry: the unfinished ids leave the active lot and go to the FRONT of the next one (deduplicated).
 * - drop: they leave the plan.
 * The finished lot keeps its remaining ids (done or discarded), or disappears when nothing is left of it.
 * On the last lot this finishes the plan: no lots, active index 0.
 */
export function advanceLots(
  lots: readonly ExecutionLot[],
  activeIndex: number,
  unfinished: readonly string[],
  mode: CarryMode,
): { lots: ExecutionLot[]; activeIndex: number; finished: boolean } {
  const active = lots[activeIndex];
  if (!active) return { lots: [...lots], activeIndex, finished: false };
  if (activeIndex + 1 >= lots.length) return { lots: [], activeIndex: 0, finished: true };

  const leaving = new Set(unfinished);
  const finishedLot: ExecutionLot = { ...active, taskIds: active.taskIds.filter((id) => !leaving.has(id)) };
  const next = lots[activeIndex + 1];
  const nextLot: ExecutionLot =
    mode === 'carry' && leaving.size
      ? { ...next, taskIds: [...unfinished, ...next.taskIds.filter((id) => !leaving.has(id))] }
      : next;

  const result = [...lots.slice(0, activeIndex), ...(finishedLot.taskIds.length ? [finishedLot] : []), nextLot, ...lots.slice(activeIndex + 2)];
  return { lots: result, activeIndex: result.indexOf(nextLot), finished: false };
}

/**
 * Editing while the plan runs: moves a task to an editable lot (the active one or any later one) or to a new
 * last lot. Lots before the active one are locked, as are their tasks. The active lot is kept even when it
 * empties; an emptied later lot disappears. An impossible move returns the same `lots` array.
 */
export function moveTaskInPlan(
  lots: readonly ExecutionLot[],
  activeIndex: number,
  taskId: string,
  target: { lotId: string } | 'newLot',
  newId: () => string,
): { lots: ExecutionLot[]; activeIndex: number } {
  const unchanged = { lots: lots as ExecutionLot[], activeIndex };
  const activeId = lots[activeIndex]?.id;
  const from = lots.findIndex((lot) => lot.taskIds.includes(taskId));
  if (activeId === undefined || from < activeIndex) return unchanged;
  if (target !== 'newLot') {
    const to = lots.findIndex((lot) => lot.id === target.lotId);
    if (to < activeIndex || to === from) return unchanged;
  }

  const stripped = lots.map((lot, i) => (i === from ? { ...lot, taskIds: lot.taskIds.filter((id) => id !== taskId) } : lot));
  const placed =
    target === 'newLot'
      ? [...stripped, { id: newId(), taskIds: [taskId] }]
      : stripped.map((lot) => (lot.id === target.lotId ? { ...lot, taskIds: [...lot.taskIds, taskId] } : lot));
  const next = placed.filter((lot) => lot.taskIds.length > 0 || lot.id === activeId);
  return { lots: next, activeIndex: next.findIndex((lot) => lot.id === activeId) };
}

/** Swaps a lot with its neighbour; only lots after the active one move, and none crosses into the active or past ones. */
export function moveLotInPlan(lots: readonly ExecutionLot[], activeIndex: number, lotId: string, dir: -1 | 1): ExecutionLot[] {
  const index = lots.findIndex((lot) => lot.id === lotId);
  const target = index + dir;
  if (index <= activeIndex || target <= activeIndex || target >= lots.length) return lots as ExecutionLot[];
  const next = [...lots];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
