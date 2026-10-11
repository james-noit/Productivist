import type { Priority } from './todo';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';
/** 'schedule' = fixed calendar dates; 'afterCompletion' = `every` × `unit` after the last occurrence was completed. */
export type RecurrenceMode = 'schedule' | 'afterCompletion';

/**
 * A recurring task: a task template plus a rule. When it comes due, the series creates an ordinary task (an
 * occurrence, `Todo.recurrenceId` = this id) that every view already understands. See lib/recurrence.ts for
 * the rules; dates are local calendar days as 'YYYY-MM-DD' (lib/dates.ts).
 */
export interface Recurrence {
  id: string;
  // Template copied into each occurrence.
  title: string;
  description?: string;
  importance: Priority;
  urgency: Priority;
  tags: string[];
  projectId?: string;
  milestoneId?: string;
  pomodorosForTermination?: number;
  // Rule.
  /** 1 to 365. */
  every: number;
  unit: RecurrenceUnit;
  /** Unit 'week' only: 1 = Monday ... 7 = Sunday, ascending. Absent = the start date's weekday. */
  weekdays?: number[];
  mode: RecurrenceMode;
  /** First occurrence. */
  startDate: string;
  /** No occurrences after this day. */
  endDate?: string;
  /** Emitted on the wire only when true. */
  paused?: boolean;
  /** Date of the latest occurrence created (also covers deleted ones, which are never recreated). */
  lastDate?: string;
  order: number;
  createdAt: number;
}

/** The part of a series the editors change. */
export type RecurrenceDraftFields = Omit<Recurrence, 'id' | 'order' | 'createdAt' | 'lastDate' | 'paused'>;

/** The recurrences part of an export file (version 5). */
export interface RecurrenceExport {
  recurrences: Recurrence[];
}
