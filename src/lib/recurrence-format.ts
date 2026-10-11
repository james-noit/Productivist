import { addDays, todayIso } from './dates';
import { MAX_STEPS, WEEKDAYS, completionBase, firstIndexAfter, nextOccurrence, occurrenceDate, weekdaySet } from './recurrence';
import type { Recurrence } from '../types/recurrence';
import type { Todo } from '../types/todo';

/**
 * The display side of recurring tasks: rule summaries, weekday names, the next date and the editor's preview.
 * Kept apart from lib/recurrence.ts (which RecurrenceService and the initial bundle use to create occurrences)
 * so these helpers only ship with the lazy UI that shows them.
 */

/**
 * The date the series will produce next, for display: null when it is over, or in 'afterCompletion' mode while
 * an occurrence is open (it depends on when that one is completed). In 'schedule' mode with an open occurrence
 * this is the date after it.
 */
export function nextDate(rec: Recurrence, todos: readonly Todo[], today: string = todayIso()): string | null {
  const mine = todos.filter((t) => t.recurrenceId === rec.id);
  const open = mine.some((t) => !t.done);
  if (rec.mode === 'afterCompletion') {
    if (open) return null;
    return nextOccurrence(rec, today, completionBase(mine, rec.lastDate))?.date ?? null;
  }
  if (!open) return nextOccurrence(rec, today)?.date ?? null;
  const date = occurrenceDate(rec, rec.lastDate ? firstIndexAfter(rec, rec.lastDate) : 0);
  return rec.endDate && date > rec.endDate ? null : date;
}

/** The next `count` scheduled dates from `today` on ('schedule' mode; empty for afterCompletion), for the editor. */
export function previewDates(rec: Recurrence, count: number, today: string = todayIso()): string[] {
  if (rec.mode !== 'schedule') return [];
  const after = rec.lastDate && rec.lastDate >= today ? rec.lastDate : addDays(today, -1);
  const dates: string[] = [];
  for (let k = firstIndexAfter(rec, after); dates.length < count && k <= MAX_STEPS; k++) {
    const date = occurrenceDate(rec, k);
    if (rec.endDate && date > rec.endDate) break;
    dates.push(date);
  }
  return dates;
}

// ---- describing a rule ------------------------------------------------------------------------------------------

/** `(key, params) => text`: the app's translate function, injected so this file stays framework-free. */
export type Translator = (key: string, params?: Record<string, string | number>) => string;

/** Names of the seven weekdays (Monday first) in `locale`. */
export function weekdayNames(locale: string, style: 'long' | 'short' | 'narrow' = 'short'): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: style });
  // 1 Jan 2024 is a Monday.
  return WEEKDAYS.map((d) => format.format(new Date(2024, 0, d)));
}

/**
 * "Every week on Mon, Thu", "Every 3 days", "Every month, after each completion". Needs the keys
 * `recurrence.rule.every.<unit>`, `.everyN.<unit>`, `.onDays` and `.afterCompletion`.
 */
export function describeRule(
  rec: Pick<Recurrence, 'every' | 'unit' | 'weekdays' | 'mode' | 'startDate'>,
  locale: string,
  t: Translator,
): string {
  let text = rec.every === 1 ? t(`recurrence.rule.every.${rec.unit}`) : t(`recurrence.rule.everyN.${rec.unit}`, { n: rec.every });
  if (rec.mode === 'afterCompletion') return t('recurrence.rule.afterCompletion', { rule: text });
  if (rec.unit === 'week' && rec.weekdays?.length) {
    const names = weekdayNames(locale);
    text = t('recurrence.rule.onDays', { rule: text, days: weekdaySet(rec).map((d) => names[d - 1]).join(', ') });
  }
  return text;
}

