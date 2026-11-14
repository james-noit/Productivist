import { environment } from '../environments/environment';
import { addDays } from './dates';

/**
 * "Add to calendar" for one task with a due date, and the URLs of the calendar subscription feed. Lazy only (Task
 * Details and Configuration > Integrations). Every event is all day on the due date: a due date is a day, not an instant.
 * Google and Outlook open a prefilled event on their site (the user saves it there, so the app never learns the event and
 * cannot update it later: that is what the subscription is for); Proton Calendar has neither an API nor such a link, so it
 * gets an .ics file to import. The UID is the one the backend's feed writes (`IcsWriter.uid`).
 */
export type CalendarProvider = 'google' | 'outlook' | 'proton';

export const CALENDAR_PROVIDERS: readonly { id: CalendarProvider; name: string }[] = [
  { id: 'google', name: 'Google Calendar' },
  { id: 'outlook', name: 'Outlook' },
  { id: 'proton', name: 'Proton Calendar' },
];

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  /** 'YYYY-MM-DD'. */
  date: string;
  /** "Project › Milestone", or ''. */
  place: string;
}

const compact = (iso: string): string => iso.replaceAll('-', '');
const nextDay = (iso: string): string => addDays(iso, 1);

function details(e: CalendarEvent): string {
  const description = e.description.trim();
  return [e.place, description].filter(Boolean).join('\n\n');
}

export function googleEventUrl(e: CalendarEvent): string {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${compact(e.date)}/${compact(nextDay(e.date))}` });
  const d = details(e);
  if (d) q.set('details', d);
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function outlookEventUrl(e: CalendarEvent): string {
  const q = new URLSearchParams({ rru: 'addevent', allday: 'true', startdt: e.date, enddt: nextDay(e.date), subject: e.title });
  const d = details(e);
  if (d) q.set('body', d);
  return `https://outlook.live.com/calendar/0/action/compose?${q}`;
}

/** RFC 5545 TEXT escaping, control characters dropped (same as the backend). */
function text(value: string): string {
  return value
    .replace(/[\\;,]/g, (c) => '\\' + c)
    .replace(/\r?\n/g, '\\n')
    .replace(/[\u0000-\u001f\u007f]/g, '');
}

/** Folds a content line at 75 octets, never inside a character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  let out = '';
  let octets = 0;
  for (const ch of line) {
    const width = encoder.encode(ch).length;
    if (octets + width > 75) {
      out += '\r\n ';
      octets = 1;
    }
    out += ch;
    octets += width;
  }
  return out + '\r\n';
}

export function eventIcs(e: CalendarEvent, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const d = details(e);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Productivist//Tasks//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${text(`todo-${e.id}@productivist`)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(e.date)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`,
    `SUMMARY:${text(e.title)}`,
    ...(d ? [`DESCRIPTION:${text(d)}`] : []),
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(fold)
    .join('');
}

/** Saves the event as an .ics file (named after the task) for Proton Calendar's import. */
export function downloadIcs(e: CalendarEvent): void {
  const blob = new Blob([eventIcs(e)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${e.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'task'}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The public feed URL. The calendars fetch it from their servers, so it must be absolute. */
export function feedUrl(token: string): string {
  const base = environment.apiUrl || location.origin;
  return `${base}/api/calendar/ics/${encodeURIComponent(token)}.ics`;
}

export function googleSubscribeUrl(feed: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}`;
}

export function outlookSubscribeUrl(feed: string): string {
  return `https://outlook.live.com/calendar/0/addfromweb?${new URLSearchParams({ url: feed, name: 'Productivist' })}`;
}
