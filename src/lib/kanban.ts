import type { TaskStatus, Todo } from '../types/todo';

export type BoardColumnKey = 'todo' | 'inProgress' | 'review' | 'done';

export interface BoardColumn {
  key: BoardColumnKey;
  labelKey: string;
}

/** The one table of board columns, in display order (mirrors QUADRANTS in eisenhower.ts). */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { key: 'todo', labelKey: 'kanban.columns.todo' },
  { key: 'inProgress', labelKey: 'kanban.columns.inProgress' },
  { key: 'review', labelKey: 'kanban.columns.review' },
  { key: 'done', labelKey: 'kanban.columns.done' },
];

/** Column a todo sits in: `done` wins, otherwise its status (absent = To do). */
export function columnOf(todo: Pick<Todo, 'done' | 'status'>): BoardColumnKey {
  return todo.done ? 'done' : (todo.status ?? 'todo');
}

/** The status a non-done column stores; Done keeps whatever status the todo had. */
export function statusOf(column: BoardColumnKey): TaskStatus | undefined {
  return column === 'done' ? undefined : column;
}

/**
 * New `order` values after moving `movedId` before `beforeId` (or to the end when null) inside a slice
 * of the list. The slice reuses its own existing order values, sorted, so todos outside it keep theirs.
 * `sliceIds` is the slice in its current display order and may or may not contain `movedId`.
 */
export function reorderSlice(
  sliceIds: readonly string[],
  movedId: string,
  beforeId: string | null,
  orderOf: (id: string) => number,
): Map<string, number> {
  const ids = sliceIds.filter((id) => id !== movedId);
  const at = beforeId === null ? -1 : ids.indexOf(beforeId);
  if (at === -1) ids.push(movedId);
  else ids.splice(at, 0, movedId);
  const orders = ids.map(orderOf);
  // The moved card may come from another slice; its old order is already in `orders`, so just sort.
  orders.sort((a, b) => a - b);
  // Duplicate order values would leave the new sequence ambiguous; spread them out.
  for (let i = 1; i < orders.length; i++) {
    if (orders[i] <= orders[i - 1]) orders[i] = orders[i - 1] + 0.001;
  }
  return new Map(ids.map((id, i) => [id, orders[i]]));
}
