import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { createId } from '../core/create-id';
import { todayIso } from '../lib/dates';
import {
  buildOccurrence,
  completionBase,
  nextOccurrence,
  occurrenceId,
  sanitizeRecurrence,
} from '../lib/recurrence';
import { TodosService } from './todos.service';
import type { Recurrence, RecurrenceDraftFields, RecurrenceExport } from '../types/recurrence';
import type { Todo } from '../types/todo';

const DATE_CHECK_MS = 60_000;

/**
 * Recurring tasks: the series store and the thing that turns series into ordinary tasks. All date maths is in
 * lib/recurrence.ts; this service is in the initial bundle, so it only wires signals and writes (the display
 * helpers, `describe` and `nextDateOf`, are in RecurrenceFormatService and ship with the lazy UI).
 * It injects TodosService to add occurrences; TodosService must never inject this (a DI cycle).
 *
 * `materialize()` is idempotent and runs at startup, whenever the tab becomes visible, when the local date
 * changes (`today`, checked every minute), after a sync pull or an import, and from an effect whenever the
 * series change or an occurrence is completed. The effect only schedules a microtask, so it never writes
 * signals while it runs.
 */
@Injectable({ providedIn: 'root' })
export class RecurrenceService {
  private readonly todos = inject(TodosService);

  readonly recurrences = localStorageSignal<Recurrence[]>('productivist.recurrences', []);

  /** The local day "now" is; refreshed every minute and when the tab becomes visible. Tests may set it. */
  readonly today = signal(todayIso());

  readonly byId = computed(() => new Map(this.recurrences().map((r) => [r.id, r])));
  readonly sorted = computed(() => [...this.recurrences()].sort((a, b) => a.order - b.order));
  /** All series, and the ones that are not paused (what the Tasks and projects header shows). */
  readonly count = computed(() => this.recurrences().length);
  readonly activeCount = computed(() => this.recurrences().reduce((n, r) => (r.paused ? n : n + 1), 0));

  /** Series id → its occurrences (the todos that carry its id). */
  readonly occurrencesBySeries = computed(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of this.todos.todos()) {
      if (!todo.recurrenceId) continue;
      const list = map.get(todo.recurrenceId);
      if (list) list.push(todo);
      else map.set(todo.recurrenceId, [todo]);
    }
    return map;
  });

  /** Series ids that have an open occurrence, as one string: it changes exactly when one is created or finished. */
  private readonly openKey = computed(() => {
    const ids: string[] = [];
    for (const [id, list] of this.occurrencesBySeries()) if (list.some((t) => !t.done)) ids.push(id);
    return ids.sort().join('|');
  });

  private materializePending = false;

  constructor() {
    effect(() => {
      this.recurrences();
      this.openKey();
      this.today();
      untracked(() => this.scheduleMaterialize());
    });

    if (typeof document !== 'undefined') {
      setInterval(() => this.refreshToday(), DATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        this.refreshToday();
        this.materialize();
      });
    }
  }

  // ---- writing ------------------------------------------------------------------------------------------------

  /**
   * Creates a series. `lastDate` marks the occurrence that already exists (a task turned into a series), so
   * the series does not create another for that period; link that task with `updateTodo(id, { recurrenceId })`
   * in the same tick, before the scheduled materialize runs.
   */
  create(fields: RecurrenceDraftFields, lastDate?: string): Recurrence {
    const order = this.recurrences().reduce((max, r) => Math.max(max, r.order), -1) + 1;
    const rec: Recurrence = { ...fields, id: createId(), order, createdAt: Date.now(), ...(lastDate ? { lastDate } : {}) };
    this.recurrences.update((list) => [...list, rec]);
    this.scheduleMaterialize();
    return rec;
  }

  /** Replaces the editable fields. With `updateOpen`, the open occurrence gets the new template as well. */
  update(id: string, fields: RecurrenceDraftFields, updateOpen = false): void {
    this.recurrences.update((list) => list.map((r) => (r.id === id ? { ...fields, id, order: r.order, createdAt: r.createdAt, ...keep(r) } : r)));
    if (updateOpen) {
      const open = (this.occurrencesBySeries().get(id) ?? []).filter((t) => !t.done).map((t) => t.id);
      this.todos.updateMany(open, {
        title: fields.title,
        description: fields.description,
        importance: fields.importance,
        urgency: fields.urgency,
        tags: [...fields.tags],
        projectId: fields.projectId,
        milestoneId: fields.projectId ? fields.milestoneId : undefined,
        pomodorosForTermination: fields.pomodorosForTermination,
      });
    }
    this.scheduleMaterialize();
  }

  pause(id: string): void {
    this.recurrences.update((list) => list.map((r) => (r.id === id ? { ...r, paused: true } : r)));
  }

  resume(id: string): void {
    this.recurrences.update((list) =>
      list.map((r) => {
        if (r.id !== id) return r;
        const { paused: _paused, ...rest } = r;
        return rest;
      }),
    );
    this.scheduleMaterialize();
  }

  /**
   * Deletes a series. Its open occurrence stays unless `deleteOpen`; leftover occurrences keep a dangling
   * `recurrenceId`, which every view ignores once the series is gone.
   */
  remove(id: string, deleteOpen = false): void {
    if (deleteOpen) {
      this.todos.removeMany((this.occurrencesBySeries().get(id) ?? []).filter((t) => !t.done).map((t) => t.id));
    }
    this.recurrences.update((list) => list.filter((r) => r.id !== id));
  }

  /** Cascade of `ProjectsService.removeProject`: a series loses the project (and milestone) like todos do. */
  clearProjectRefs(projectId: string): void {
    this.recurrences.update((list) =>
      list.some((r) => r.projectId === projectId)
        ? list.map((r) => (r.projectId === projectId ? withoutRefs(r, true) : r))
        : list,
    );
  }

  /** Cascade of `ProjectsService.removeMilestone`. */
  clearMilestoneRefs(milestoneIds: ReadonlySet<string>): void {
    if (!milestoneIds.size) return;
    this.recurrences.update((list) =>
      list.some((r) => r.milestoneId && milestoneIds.has(r.milestoneId))
        ? list.map((r) => (r.milestoneId && milestoneIds.has(r.milestoneId) ? withoutRefs(r, false) : r))
        : list,
    );
  }

  /** Drops references to projects and milestones that no longer exist (after a pull or an import). */
  sweep(projectIds: ReadonlySet<string>, milestoneProjects: ReadonlyMap<string, string>): void {
    const stale = (r: Recurrence) =>
      (r.projectId !== undefined && !projectIds.has(r.projectId)) ||
      (r.milestoneId !== undefined && milestoneProjects.get(r.milestoneId) !== r.projectId);
    if (!this.recurrences().some(stale)) return;
    this.recurrences.update((list) =>
      list.map((r) => {
        if (!stale(r)) return r;
        const projectGone = r.projectId !== undefined && !projectIds.has(r.projectId);
        return withoutRefs(r, projectGone);
      }),
    );
  }

  // ---- materializing ------------------------------------------------------------------------------------------

  private refreshToday(): void {
    const now = todayIso();
    if (now !== this.today()) this.today.set(now);
  }

  /** Coalesces triggers into one `materialize()` after the current task, so callers never write mid-effect. */
  scheduleMaterialize(): void {
    if (this.materializePending) return;
    this.materializePending = true;
    queueMicrotask(() => {
      this.materializePending = false;
      this.materialize();
    });
  }

  /**
   * Creates the occurrence each active series is due for: none while one is still open, only the latest missed
   * date, and never one `lastDate` already covers (a deleted occurrence stays deleted). Idempotent; one write
   * per store.
   */
  materialize(): void {
    const recs = this.recurrences();
    if (!recs.length) return;
    const today = this.today();
    const occurrences = this.occurrencesBySeries();
    const created: Todo[] = [];
    const advanced = new Map<string, string>();
    const now = Date.now();
    for (const rec of recs) {
      if (rec.paused) continue;
      const mine = occurrences.get(rec.id) ?? [];
      if (mine.some((t) => !t.done)) continue;
      const plan = nextOccurrence(rec, today, rec.mode === 'afterCompletion' ? completionBase(mine, rec.lastDate) : undefined);
      if (!plan?.due) continue;
      advanced.set(rec.id, plan.date);
      // Order is assigned by insertTodos. A done occurrence with this id can exist (lastDate was behind).
      if (!mine.some((t) => t.id === occurrenceId(rec.id, plan.date))) created.push(buildOccurrence(rec, plan.date, 0, now));
    }
    if (!advanced.size) return;
    this.todos.insertTodos(created);
    this.recurrences.update((list) => list.map((r) => (advanced.has(r.id) ? { ...r, lastDate: advanced.get(r.id) } : r)));
  }

  // ---- export / import / reset --------------------------------------------------------------------------------

  exportRecurrences(): RecurrenceExport {
    return { recurrences: this.recurrences() };
  }

  /**
   * Replaces the series with an export's. Malformed rows are skipped, `every`, `unit`, `mode`, dates and
   * weekdays are sanitized (see `sanitizeRecurrence`), duplicate ids keep the first. Missing means none.
   */
  importRecurrences(data: Partial<RecurrenceExport> | null | undefined): void {
    const raw: unknown[] = Array.isArray(data?.recurrences) ? data.recurrences : [];
    const fallbackStart = todayIso();
    const seen = new Set<string>();
    const list: Recurrence[] = [];
    raw.forEach((row, index) => {
      const rec = sanitizeRecurrence(row, index, fallbackStart);
      if (!rec || seen.has(rec.id)) return;
      seen.add(rec.id);
      list.push(rec);
    });
    this.recurrences.set(list);
    this.scheduleMaterialize();
  }

  reset(): void {
    this.recurrences.set([]);
  }
}

/** What an edit must not lose: the progress markers. */
function keep(rec: Recurrence): Pick<Recurrence, 'lastDate' | 'paused'> {
  return { ...(rec.lastDate ? { lastDate: rec.lastDate } : {}), ...(rec.paused ? { paused: true as const } : {}) };
}

function withoutRefs(rec: Recurrence, project: boolean): Recurrence {
  const { milestoneId: _milestone, projectId: _project, ...rest } = rec;
  return project ? rest : { ...rest, ...(rec.projectId ? { projectId: rec.projectId } : {}) };
}
