/**
 * Helpers only the Roadmap and Calendar headers need. Kept out of `dates.ts` because that module is
 * shared with eager code, and anything in it lands in the initial bundle.
 */
import { addDays, diffDays, parseIso, toIso } from './dates';

/** Last day of the month containing `iso`. */
export function endOfMonth(iso: string): string {
  const date = parseIso(iso);
  return date ? toIso(new Date(date.getFullYear(), date.getMonth() + 1, 0)) : iso;
}

/** ISO 8601 week number (1-53); weeks start on Monday and week 1 holds the year's first Thursday. */
export function isoWeek(iso: string): number {
  const date = parseIso(iso);
  if (!date) return 0;
  const thursday = addDays(iso, 3 - ((date.getDay() + 6) % 7));
  const year = parseIso(thursday)!.getFullYear();
  return Math.floor(diffDays(`${String(year).padStart(4, '0')}-01-01`, thursday) / 7) + 1;
}

/** Upper-cases the first letter of a formatted name, since Intl returns Spanish months in lower case. */
export function capitalizeFirst(text: string, locale?: string): string {
  return text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;
}
