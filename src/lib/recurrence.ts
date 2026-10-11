import { addDays, isIsoDate, parseIso, startOfWeek, toIso } from './dates';
import type { Recurrence, RecurrenceMode, RecurrenceUnit } from '../types/recurrence';
import type { Priority, Todo } from '../types/todo';

/**
 * The rules of recurring tasks, all pure. A series is a task template plus a rule; this file answers "which
 * date is next" and builds the occurrence (an ordinary Todo). Dates are local calendar days ('YYYY-MM-DD',
 * lib/dates.ts); nothing here reads the clock except through the `today` argument.
 *
 * - One open occurrence per series: callers create nothing while one is not done.
 * - 'schedule': the next date is the first scheduled one after `lastDate` (or on/after `startDate`). In the
 *   future it simply waits for its day; if several were missed only the latest is created (no pile-ups).
 * - 'afterCompletion': completion day + every × unit (the start date for the first one).
 * - Month and year steps keep the start date's day of month, clamped to the month (31 Jan, 28/29 Feb, 31 Mar;
 *   29 Feb falls back to 28 Feb in common years). Weekly series with weekdays occur on those weekdays in every
 *   N-th week, counted from the Monday of the start date's week.
 */

export const UNITS: readonly RecurrenceUnit[] = ['day', 'week', 'month', 'year'];
export const MODES: readonly RecurrenceMode[] = ['schedule', 'afterCompletion'];
export const MAX_EVERY = 365;
/** Monday first, as ISO weekdays (1 = Monday ... 7 = Sunday). */
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

export const MAX_STEPS = 1_000_000;
const MAX_TEXT = 1000;
const MAX_DESCRIPTION = 100_000;
const MAX_TAGS = 100;
const MAX_ID = 64;

// ---- calendar arithmetic --------------------------------------------------------------------------------------

/** ISO weekday of a day: 1 = Monday ... 7 = Sunday. */
export function weekdayOf(iso: string): number {
  const date = parseIso(iso);
  return date ? ((date.getDay() + 6) % 7) + 1 : 1;
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** `months` months after `iso`, keeping its day of month and clamping to the target month's length. */
export function addMonthsClamped(iso: string, months: number): string {
  const date = parseIso(iso);
  if (!date) return iso;
  const total = date.getFullYear() * 12 + date.getMonth() + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  return toIso(new Date(year, month, Math.min(date.getDate(), daysInMonth(year, month))));
}

/** `n` units after `iso` (afterCompletion mode). */
export function addUnits(iso: string, n: number, unit: RecurrenceUnit): string {
  switch (unit) {
    case 'day':
      return addDays(iso, n);
    case 'week':
      return addDays(iso, n * 7);
    case 'month':
      return addMonthsClamped(iso, n);
    case 'year':
      return addMonthsClamped(iso, n * 12);
  }
}

/** The weekdays a weekly series occurs on, ascending; the start date's weekday when none are set. */
export function weekdaySet(rec: Pick<Recurrence, 'unit' | 'weekdays' | 'startDate'>): number[] {
  if (rec.unit === 'week' && rec.weekdays?.length) {
    const days = [...new Set(rec.weekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
    if (days.length) return days;
  }
  return [weekdayOf(rec.startDate)];
}

/** The k-th (0-based) scheduled date of a series in 'schedule' mode, increasing with k. */
export function occurrenceDate(rec: Recurrence, k: number): string {
  const { startDate, every, unit } = rec;
  switch (unit) {
    case 'day':
      return addDays(startDate, k * every);
    case 'week': {
      const days = weekdaySet(rec);
      // Weekdays of the first week that fall before the start date are not occurrences.
      const skipped = days.filter((d) => d < weekdayOf(startDate)).length;
      const index = k + skipped;
      return addDays(startOfWeek(startDate), Math.floor(index / days.length) * every * 7 + days[index % days.length] - 1);
    }
    case 'month':
      return addMonthsClamped(startDate, k * every);
    case 'year':
      return addMonthsClamped(startDate, k * every * 12);
  }
}

/** The smallest k whose scheduled date is strictly after `iso`. */
export function firstIndexAfter(rec: Recurrence, iso: string): number {
  if (occurrenceDate(rec, 0) > iso) return 0;
  let lo = 0;
  let hi = 1;
  while (occurrenceDate(rec, hi) <= iso) {
    lo = hi;
    hi *= 2;
    if (hi > MAX_STEPS) return hi;
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (occurrenceDate(rec, mid) <= iso) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ---- which occurrence comes next -------------------------------------------------------------------------------

export interface PlannedOccurrence {
  date: string;
  /** True when the date is today or earlier: the occurrence is created now. Otherwise it waits for its day. */
  due: boolean;
}

/** The deterministic id of a series' occurrence on a day, so two devices creating it produce one row. */
export function occurrenceId(seriesId: string, date: string): string {
  return `r-${seriesId}-${date.replace(/-/g, '')}`;
}

/**
 * The occurrence a series wants next, assuming it has no open occurrence (the caller checks). `baseDay` is only
 * used by 'afterCompletion': the day the previous occurrence was completed (defaults to `lastDate`, e.g. when
 * that occurrence was deleted). Null when the series is over (past `endDate`). Ignores `paused`.
 */
export function nextOccurrence(rec: Recurrence, today: string, baseDay?: string): PlannedOccurrence | null {
  if (rec.mode === 'afterCompletion') {
    const date = rec.lastDate ? addUnits(baseDay ?? rec.lastDate, rec.every, rec.unit) : rec.startDate;
    if (rec.endDate && date > rec.endDate) return null;
    return { date, due: date <= today };
  }
  const first = occurrenceDate(rec, rec.lastDate ? firstIndexAfter(rec, rec.lastDate) : 0);
  if (rec.endDate && first > rec.endDate) return null;
  if (first > today) return { date: first, due: false };
  // Several dates may have passed: only the latest one on or before today (and the end date) is created.
  let k = firstIndexAfter(rec, today) - 1;
  if (rec.endDate) k = Math.min(k, firstIndexAfter(rec, rec.endDate) - 1);
  return { date: occurrenceDate(rec, k), due: true };
}

/**
 * The base day for 'afterCompletion': the local day the most recently completed occurrence was completed.
 * Undefined when there is none, or when a later occurrence (the one `lastDate` names) was created and then
 * deleted: the caller then counts from `lastDate`, so a deleted occurrence is not recreated.
 */
export function completionBase(occurrences: readonly Todo[], lastDate?: string): string | undefined {
  let latest: Todo | undefined;
  for (const todo of occurrences) {
    if (todo.done && todo.completedAt && (!latest || todo.completedAt > (latest.completedAt ?? 0))) latest = todo;
  }
  if (!latest?.completedAt) return undefined;
  if (lastDate && latest.dueDate && latest.dueDate < lastDate) return undefined;
  return toIso(new Date(latest.completedAt));
}

/** The occurrence todo for `date`: the template, `startDate = dueDate = date`, no status. */
export function buildOccurrence(rec: Recurrence, date: string, order: number, now: number): Todo {
  return {
    id: occurrenceId(rec.id, date),
    title: rec.title,
    importance: rec.importance,
    urgency: rec.urgency,
    tags: [...rec.tags],
    done: false,
    order,
    createdAt: now,
    ...(rec.description ? { description: rec.description } : {}),
    ...(rec.projectId ? { projectId: rec.projectId } : {}),
    ...(rec.projectId && rec.milestoneId ? { milestoneId: rec.milestoneId } : {}),
    ...(rec.pomodorosForTermination ? { pomodorosForTermination: rec.pomodorosForTermination } : {}),
    startDate: date,
    dueDate: date,
    recurrenceId: rec.id,
  };
}

// ---- cleaning untrusted rows --------------------------------------------------------------------------------------

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const text = (value: unknown, max: number): string | undefined => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);
const priority = (value: unknown): Priority => (value === 'low' || value === 'high' ? value : 'medium');

/**
 * A series from an import file or any other untrusted source, or null when it is unusable (no id or title).
 * Out-of-range `every` is clamped, an unknown unit or mode falls back to week / schedule, bad dates are
 * dropped (a missing or bad start date becomes `fallbackStart`) and weekdays are kept only for weekly series,
 * unique, 1 to 7 and ascending. Mirrors what the backend accepts, so an import cannot wedge sync.
 */
export function sanitizeRecurrence(raw: unknown, index: number, fallbackStart: string, now: number = Date.now()): Recurrence | null {
  if (!isObject(raw)) return null;
  const id = text(raw['id'], MAX_ID + 1);
  const title = text(raw['title'], MAX_TEXT);
  if (!id || id.length > MAX_ID || !title) return null;

  const unit = UNITS.find((u) => u === raw['unit']) ?? 'week';
  const mode = MODES.find((m) => m === raw['mode']) ?? 'schedule';
  const every = Math.min(MAX_EVERY, Math.max(1, Math.round(finite(raw['every']) ?? 1)));
  const startDate = isIsoDate(raw['startDate']) ? raw['startDate'] : fallbackStart;
  const description = text(raw['description'], MAX_DESCRIPTION);
  const tags = (Array.isArray(raw['tags']) ? raw['tags'] : [])
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => tag.trim().slice(0, 100))
    .slice(0, MAX_TAGS);
  const projectId = text(raw['projectId'], MAX_ID);
  const milestoneId = projectId ? text(raw['milestoneId'], MAX_ID) : undefined;
  const pomodoros = finite(raw['pomodorosForTermination']);
  const weekdays =
    unit === 'week' && Array.isArray(raw['weekdays'])
      ? [...new Set(raw['weekdays'].filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b)
      : [];

  return {
    id,
    title,
    importance: priority(raw['importance']),
    urgency: priority(raw['urgency']),
    tags,
    every,
    unit,
    mode,
    startDate,
    order: finite(raw['order']) ?? index,
    createdAt: finite(raw['createdAt']) ?? now,
    ...(description ? { description } : {}),
    ...(projectId ? { projectId } : {}),
    ...(milestoneId ? { milestoneId } : {}),
    ...(pomodoros !== undefined && pomodoros >= 1 ? { pomodorosForTermination: Math.round(pomodoros) } : {}),
    ...(weekdays.length ? { weekdays } : {}),
    ...(isIsoDate(raw['endDate']) ? { endDate: raw['endDate'] } : {}),
    ...(raw['paused'] === true ? { paused: true } : {}),
    ...(isIsoDate(raw['lastDate']) ? { lastDate: raw['lastDate'] } : {}),
  };
}
