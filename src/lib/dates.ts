/**
 * Calendar-day helpers. A task's start/due date is a day, not an instant, so it is stored as a local
 * 'YYYY-MM-DD' string. Always parse through `parseIso` (local midnight): `new Date('2026-10-10')` is UTC
 * and lands on the previous day in timezones west of Greenwich.
 */

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Local calendar day of a Date as 'YYYY-MM-DD'. */
export function toIso(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIso(): string {
  return toIso(new Date());
}

/** Local midnight of an ISO day, or null when the string is not a real calendar day. */
export function parseIso(iso: string): Date | null {
  const match = ISO_PATTERN.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  // Rejects 2026-02-31 (which Date would roll over to March) and years below 100 (mapped to 19xx).
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIso(value) !== null;
}

export function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/** Whole days from `a` to `b` (positive when b is later). DST-safe: compares UTC midnights of the local days. */
export function diffDays(a: string, b: string): number {
  const da = parseIso(a);
  const db = parseIso(b);
  if (!da || !db) return 0;
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / DAY_MS);
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const date = parseIso(iso);
  if (!date) return iso;
  return addDays(iso, -((date.getDay() + 6) % 7));
}

export function startOfMonth(iso: string): string {
  const date = parseIso(iso);
  return date ? toIso(new Date(date.getFullYear(), date.getMonth(), 1)) : iso;
}

/** The 42 days (6 weeks, Monday first) that a month grid shows for `month` (0-based) of `year`. */
export function monthGrid(year: number, month: number): string[] {
  const first = toIso(new Date(year, month, 1));
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/**
 * Returns `item` without any startDate/dueDate that is not a valid calendar day, so a hand-edited import
 * file cannot push values the server's CHECK constraint would reject (which would wedge sync).
 */
export function sanitizeDates<T extends { startDate?: unknown; dueDate?: unknown }>(item: T): T {
  const badStart = item.startDate !== undefined && !isIsoDate(item.startDate);
  const badDue = item.dueDate !== undefined && !isIsoDate(item.dueDate);
  if (!badStart && !badDue) return item;
  const copy = { ...item };
  if (badStart) delete copy.startDate;
  if (badDue) delete copy.dueDate;
  return copy;
}

/** Formats an ISO day with a (cached per component) formatter; returns '' for anything unparseable. */
export function formatIso(formatter: Intl.DateTimeFormat, iso: string): string {
  const date = parseIso(iso);
  return date ? formatter.format(date) : '';
}

export type DueState = 'overdue' | 'soon' | 'later' | 'done';

/** How urgent a due date is: overdue when past and still open, soon when within 2 days. */
export function dueState(due: string, done: boolean, today: string = todayIso()): DueState {
  if (done) return 'done';
  const days = diffDays(today, due);
  return days < 0 ? 'overdue' : days <= 2 ? 'soon' : 'later';
}

/** A start/due pair with the earlier day first: if both are set and start is after due, they are swapped. */
export function orderedDates(startDate: string | undefined, dueDate: string | undefined): { startDate?: string; dueDate?: string } {
  if (startDate && dueDate && startDate > dueDate) return { startDate: dueDate, dueDate: startDate };
  return { startDate, dueDate };
}
