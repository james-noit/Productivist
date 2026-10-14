import { Injectable, computed, signal } from '@angular/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { PROJECTS_SORTS, normalizeQuery, type ProjectsSort, type TaskFilter } from '../../../lib/project-cards';
import type { EisenhowerQuadrant } from '../../../types/eisenhower';

export type ProjectsLayout = 'cards' | 'list';
const SORT_KEY = 'productivist.projectsSortBy';

/**
 * The sort used to live under `productivist.projectsSort` with 'manual' as its (always stored) default, so a new
 * default could never apply. It moved to a new key: a deliberate choice (urgency, due, name) is carried over and the
 * old key is removed; 'manual' was just the untouched default and gives way to 'activity'.
 */
function migrateSort(): void {
  try {
    const old = localStorage.getItem('productivist.projectsSort');
    if (old === null) return;
    localStorage.removeItem('productivist.projectsSort');
    if (localStorage.getItem(SORT_KEY) !== null) return;
    let value: unknown;
    try {
      value = JSON.parse(old);
    } catch {
      return;
    }
    if (value !== 'manual' && PROJECTS_SORTS.includes(value as ProjectsSort)) localStorage.setItem(SORT_KEY, old);
  } catch {
    // Storage unavailable: nothing to carry over.
  }
}
const LAYOUTS: readonly ProjectsLayout[] = ['cards', 'list'];

/**
 * What the Tasks and projects page's pieces share: the search text, the filters of the drawer, the sort, the
 * layout, and the "create something" requests of the floating button. Provided by `ProjectsViewComponent`
 * (`providers`), not at the root, so it lives and dies with the page and stays out of the initial bundle: the
 * dashboard, the filters drawer and the floating button all inject the same instance. Device-local, never synced.
 */
@Injectable()
export class ProjectsPageState {
  // Runs when the class is defined, i.e. before any instance reads its localStorage keys.
  static {
    migrateSort();
  }

  readonly query = signal('');
  /** Quadrants the page is narrowed to (empty = all). */
  readonly quadrants = signal<readonly EisenhowerQuadrant[]>([]);
  /** Due filter (null = any time). */
  readonly due = signal<TaskFilter | null>(null);
  /** Persisted; an unknown stored value (another build wrote it) reads as 'activity' through `activeSort`. */
  readonly sort = localStorageSignal<ProjectsSort>(SORT_KEY, 'activity');
  readonly activeSort = computed<ProjectsSort>(() => (PROJECTS_SORTS.includes(this.sort()) ? this.sort() : 'activity'));
  /** Persisted; an unknown stored value reads as 'cards' through `activeLayout`. */
  readonly layout = localStorageSignal<ProjectsLayout>('productivist.projectsLayout', 'cards');
  readonly activeLayout = computed<ProjectsLayout>(() => (LAYOUTS.includes(this.layout()) ? this.layout() : 'cards'));
  /** Persisted; the Inbox card is shown unless switched off in the drawer. Anything but `false` reads as on. */
  readonly showInbox = localStorageSignal<boolean>('productivist.projectsShowInbox', true);

  readonly filtersOpen = signal(false);
  readonly creatingTask = signal(false);
  readonly creatingProject = signal(false);

  readonly normalized = computed(() => normalizeQuery(this.query()));
  readonly inboxVisible = computed(() => this.showInbox() !== false);
  /** How many drawer filters are on: each chosen quadrant, the due filter and a hidden Inbox. */
  readonly activeCount = computed(() => this.quadrants().length + (this.due() ? 1 : 0) + (this.inboxVisible() ? 0 : 1));
  /** The search or a filter that narrows tasks (a hidden Inbox only hides a card) is on. */
  readonly filtering = computed(() => !!this.normalized() || this.quadrants().length > 0 || this.due() !== null);

  /** The control that opened the filters drawer, where focus goes back to when it closes. */
  filtersOpener: HTMLElement | null = null;
  /** Where focus goes back to when a create dialog closes (the control that asked for it). */
  private opener: HTMLElement | null = null;

  toggleQuadrant(quadrant: EisenhowerQuadrant): void {
    this.quadrants.update((all) => (all.includes(quadrant) ? all.filter((q) => q !== quadrant) : [...all, quadrant]));
  }

  setDue(due: TaskFilter | null): void {
    this.due.set(due);
  }

  /** Drops every drawer filter. The search text and the sort are left alone. */
  clearFilters(): void {
    this.quadrants.set([]);
    this.due.set(null);
    this.showInbox.set(true);
  }

  /** Drops the search text too: what "Clear filters" means in the no-results state. */
  clearSearchAndFilters(): void {
    this.query.set('');
    this.clearFilters();
  }

  openFilters(opener: HTMLElement | null = null): void {
    this.filtersOpener = opener ?? this.activeElement();
    this.filtersOpen.set(true);
  }

  openNewTask(opener: HTMLElement | null = null): void {
    this.opener = opener ?? this.activeElement();
    this.creatingTask.set(true);
  }

  openNewProject(opener: HTMLElement | null = null): void {
    this.opener = opener ?? this.activeElement();
    this.creatingProject.set(true);
  }

  /** Puts focus back on the control that opened a create dialog, once the dialog is gone. */
  restoreFocus(): void {
    const opener = this.opener;
    this.opener = null;
    queueMicrotask(() => {
      if (opener?.isConnected) opener.focus();
    });
  }

  private activeElement(): HTMLElement | null {
    const active = document.activeElement;
    return active instanceof HTMLElement && active !== document.body ? active : null;
  }
}
