import { addDays, diffDays, toIso } from './dates';
import type { Todo } from '../types/todo';

export interface BurnupPoint {
  /** Days since `start`. */
  day: number;
  /** Tasks created up to and including this day. */
  scope: number;
  /** Tasks completed up to and including this day. */
  done: number;
}

export interface Burnup {
  /** ISO day of the first task's creation (or the day before today when everything happened today). */
  start: string;
  /** Days from `start` to the last point (>= 1). */
  span: number;
  points: BurnupPoint[];
}

const DAILY_LIMIT_DAYS = 60;

/**
 * Cumulative scope (tasks created) and completed counts over the life of a set of tasks. Daily points
 * when the span is at most 60 days, weekly (plus the last day) beyond that. Null for no tasks.
 * A done task without `completedAt` (an old import) counts as completed the day it was created.
 */
export function buildBurnup(todos: readonly Pick<Todo, 'createdAt' | 'done' | 'completedAt'>[], today: string): Burnup | null {
  if (!todos.length) return null;
  const created = todos.map((t) => toIso(new Date(t.createdAt)));
  // Only read for done tasks.
  const completed = todos.map((t, i) => (t.done ? toIso(new Date(t.completedAt ?? t.createdAt)) : created[i]));
  let start = created.reduce((a, b) => (b < a ? b : a));
  let end = today;
  for (const iso of created) if (iso > end) end = iso;
  todos.forEach((t, i) => {
    if (t.done && completed[i] > end) end = completed[i];
  });
  if (end === start) start = addDays(start, -1);
  const span = Math.max(1, diffDays(start, end));

  const scopeAdded = new Array<number>(span + 1).fill(0);
  const doneAdded = new Array<number>(span + 1).fill(0);
  created.forEach((iso, i) => {
    scopeAdded[Math.max(0, diffDays(start, iso))]++;
    if (todos[i].done) doneAdded[Math.max(0, diffDays(start, completed[i]))]++;
  });

  const days: number[] = [];
  if (span <= DAILY_LIMIT_DAYS) for (let d = 0; d <= span; d++) days.push(d);
  else {
    for (let d = 0; d < span; d += 7) days.push(d);
    days.push(span);
  }

  const points: BurnupPoint[] = [];
  let scope = 0;
  let done = 0;
  let next = 0;
  for (const day of days) {
    for (; next <= day; next++) {
      scope += scopeAdded[next];
      done += doneAdded[next];
    }
    points.push({ day, scope, done });
  }
  return { start, span, points };
}
