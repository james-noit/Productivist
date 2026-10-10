import { Injectable, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import type { EisenhowerQuadrant } from '../types/eisenhower';

export type AppView = 'pomodoro' | 'projects' | 'admin';
export type ProjectsTab = 'projects' | 'matrix';

const VIEWS: readonly AppView[] = ['pomodoro', 'projects', 'admin'];

/**
 * The Planning lab and Eisenhower views were folded into Projects. A stored value naming either
 * would otherwise fall through to the Pomodoro branch of the view chain, so map it to its new
 * home before the signals read localStorage. Runs once, from ViewService's static block.
 */
function migrateLegacyView(): void {
  try {
    const raw = localStorage.getItem('productivist.activeView');
    if (raw !== null) {
      let stored: unknown;
      try {
        stored = JSON.parse(raw);
      } catch {
        stored = null;
      }
      if (stored === 'eisenhower') {
        localStorage.setItem('productivist.projectsTab', JSON.stringify('matrix'));
        localStorage.setItem('productivist.activeView', JSON.stringify('projects'));
      } else if (!VIEWS.includes(stored as AppView)) {
        localStorage.setItem('productivist.activeView', JSON.stringify('projects'));
      }
    }
    localStorage.removeItem('productivist.planningLabTab');
  } catch {
    // Storage disabled — the signals fall back to their defaults.
  }
}

@Injectable({ providedIn: 'root' })
export class ViewService {
  // Runs when the class is defined, i.e. before any instance reads its localStorage keys.
  static {
    migrateLegacyView();
  }

  readonly current = localStorageSignal<AppView>('productivist.activeView', 'projects');

  /**
   * Live here rather than on the components that render them because other views link to them:
   * the summary-strip badges open the Matrix tab and the Pomodoro view's empty Daily backlog
   * opens the Plan-my-day modal. While they were component state, that link had to write the
   * localStorage key directly, which left the in-memory signal stale for the rest of the session
   * if the target had already been rendered once.
   */
  readonly projectsTab = localStorageSignal<ProjectsTab>('productivist.projectsTab', 'projects');

  /**
   * A quadrant the Matrix tab should scroll to and flash when it mounts, set by the Projects tab's
   * summary badges. EisenhowerViewComponent clears it once consumed.
   */
  readonly focusQuadrant = signal<EisenhowerQuadrant | null>(null);

  /** Open state of the Plan-my-day modal. Not persisted: the wizard's own stage is. */
  readonly planningOpen = signal(false);

  /**
   * Open state of the clock's Settings panel. Shared so the header's account chip can open it from any
   * view: the panel is rendered by the Pomodoro and Multitask views only.
   */
  readonly settingsOpen = signal(false);

  openSettings(): void {
    if (this.current() !== 'pomodoro') this.current.set('pomodoro');
    this.settingsOpen.set(true);
  }

  /** Any navigation closes the plan, which is how the wizard's launch actions close the modal. */
  setView(view: AppView): void {
    this.current.set(view);
    this.planningOpen.set(false);
  }

  openPlanning(): void {
    this.planningOpen.set(true);
  }

  closePlanning(): void {
    this.planningOpen.set(false);
  }

  openProjectsTab(tab: ProjectsTab, focus: EisenhowerQuadrant | null = null): void {
    this.projectsTab.set(tab);
    this.focusQuadrant.set(tab === 'matrix' ? focus : null);
    this.current.set('projects');
  }

  reset(): void {
    this.current.set('projects');
    this.projectsTab.set('projects');
    this.focusQuadrant.set(null);
    this.planningOpen.set(false);
  }
}
