import { diffDays } from './dates';
import type { Todo } from '../types/todo';

/** The values the "ask to mark urgent" setting may take (days; 0 = off). */
export const URGENCY_PROMPT_DAYS = [0, 1, 2, 3, 5, 7, 14] as const;
export const DEFAULT_URGENCY_PROMPT_DAYS = 5;

/** A stored or synced value back to an allowed one (unknown -> the default). */
export function sanitizePromptDays(value: unknown): number {
  return typeof value === 'number' && (URGENCY_PROMPT_DAYS as readonly number[]).includes(value) ? value : DEFAULT_URGENCY_PROMPT_DAYS;
}

/** One dismissal per task and due date: moving the due date asks again. */
export function dueUrgencyKey(todo: Pick<Todo, 'id' | 'dueDate'>): string {
  return `${todo.id}:${todo.dueDate}`;
}

/** Open tasks due within `days` days (overdue included) whose urgency is not high and that were not dismissed. */
export function dueUrgencyCandidates(todos: readonly Todo[], today: string, days: number, dismissed: Readonly<Record<string, number>>): Todo[] {
  if (days <= 0) return [];
  return todos
    .filter((t) => !t.done && !!t.dueDate && t.urgency !== 'high' && diffDays(today, t.dueDate) <= days && !(dueUrgencyKey(t) in dismissed))
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || a.title.localeCompare(b.title));
}

/** Keeps only the dismissals whose task still exists, is open and has that due date. */
export function pruneDismissed(dismissed: Readonly<Record<string, number>>, todos: readonly Todo[]): Record<string, number> {
  const live = new Set(todos.filter((t) => !t.done && t.dueDate).map(dueUrgencyKey));
  const next: Record<string, number> = {};
  for (const key of Object.keys(dismissed)) if (live.has(key)) next[key] = dismissed[key] as number;
  return next;
}
