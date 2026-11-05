import { Injectable, inject, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { todayIso } from '../lib/dates';
import { dueUrgencyCandidates, dueUrgencyKey, pruneDismissed, sanitizePromptDays } from '../lib/due-urgency';
import { ClockService } from './clock.service';
import { SettingsService } from './settings.service';
import { SportaskService } from './sportask.service';
import { TodosService } from './todos.service';
import { ViewService } from './view.service';

/**
 * Asks, after a full sync, whether open tasks due soon should become urgent. The rule is in lib/due-urgency.ts; the
 * prompt is the lazy `due-urgency-modal`, shown while `pendingIds` is not empty. Dismissals are device-local (never
 * synced). Injected by SyncService, so it must never inject SyncService.
 */
@Injectable({ providedIn: 'root' })
export class DueUrgencyService {
  private readonly todos = inject(TodosService);
  private readonly settings = inject(SettingsService);
  private readonly view = inject(ViewService);
  private readonly clock = inject(ClockService);
  private readonly sportask = inject(SportaskService);

  /** Task id + due date -> when it was dismissed. */
  private readonly dismissed = localStorageSignal<Record<string, number>>('productivist.dueUrgencyDismissed', {});
  /** The ids the prompt shows; not empty = the prompt is open. */
  readonly pendingIds = signal<string[]>([]);

  /** Opens the prompt when something qualifies and nothing else is in the way (the next sync tries again). */
  check(): void {
    if (this.pendingIds().length) return;
    const todos = this.todos.todos();
    const pruned = pruneDismissed(this.dismissed(), todos);
    if (Object.keys(pruned).length !== Object.keys(this.dismissed()).length) this.dismissed.set(pruned);
    const days = sanitizePromptDays(this.settings.urgencyPromptDays());
    const found = dueUrgencyCandidates(todos, todayIso(), days, pruned);
    if (!found.length) return;
    if (
      this.view.planningOpen() ||
      this.view.configOpen() ||
      this.view.recurringOpen() ||
      this.clock.alarmModalOpen() ||
      this.sportask.breakOpen() ||
      document.querySelector('[aria-modal="true"]')
    )
      return;
    this.pendingIds.set(found.map((t) => t.id));
  }

  /** "Skip": remembers the task and due date so it is not asked again, and takes it off the prompt. */
  dismiss(ids: readonly string[]): void {
    const gone = new Set(ids);
    const now = Date.now();
    const stamp: Record<string, number> = {};
    for (const todo of this.todos.todos()) if (gone.has(todo.id) && todo.dueDate) stamp[dueUrgencyKey(todo)] = now;
    if (Object.keys(stamp).length) this.dismissed.update((d) => ({ ...d, ...stamp }));
    this.pendingIds.update((list) => list.filter((id) => !gone.has(id)));
  }

  makeUrgent(ids: readonly string[]): void {
    this.todos.updateMany(ids, { urgency: 'high' });
    const gone = new Set(ids);
    this.pendingIds.update((list) => list.filter((id) => !gone.has(id)));
  }

  /** "Not now": dismisses everything still pending. */
  close(): void {
    this.dismiss(this.pendingIds());
  }

  reset(): void {
    this.pendingIds.set([]);
    this.dismissed.set({});
  }
}
