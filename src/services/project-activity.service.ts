import { Injectable } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';

/** How many interactions are kept per project, and how close two of them may be before they count as one. */
const KEEP = 30;
const COALESCE_MS = 60_000;

/**
 * A tiny device-local log of when each project was last interacted with (opened, a task or milestone added,
 * edited, completed or removed, a focus session finished on one of its tasks): the last 30 epoch-ms timestamps per
 * project, touches less than a minute apart counted once. It is not synced, because interactions are a per-device
 * habit; the task data that does sync feeds the other half of the score (`activityScore` in `lib/project-cards.ts`).
 * No dependencies, so any store can inject it without a cycle.
 */
@Injectable({ providedIn: 'root' })
export class ProjectActivityService {
  readonly activity = localStorageSignal<Record<string, number[]>>('productivist.projectActivity', {});

  touch(projectId: string | undefined): void {
    if (projectId) this.touchMany([projectId]);
  }

  /** Touches each distinct project once, in a single write. */
  touchMany(projectIds: Iterable<string | undefined>): void {
    const ids = new Set<string>();
    for (const id of projectIds) if (id) ids.add(id);
    if (!ids.size) return;
    const now = Date.now();
    const log = this.activity();
    let next: Record<string, number[]> | null = null;
    for (const id of ids) {
      const times = Array.isArray(log[id]) ? log[id] : [];
      const last = times[times.length - 1];
      if (last !== undefined && now - last < COALESCE_MS) continue;
      next ??= { ...log };
      next[id] = [...times, now].slice(-KEEP);
    }
    if (next) this.activity.set(next);
  }

  forget(projectId: string): void {
    if (!(projectId in this.activity())) return;
    this.activity.update(({ [projectId]: _dropped, ...rest }) => rest);
  }

  reset(): void {
    this.activity.set({});
  }
}
