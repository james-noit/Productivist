import { Injectable, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import type { EisenhowerQuadrant } from '../types/eisenhower';

export type AppView = 'pomodoro' | 'projects' | 'project' | 'admin';
/** How the project detail view shows its project. A union so later presentations extend it. */
export type ProjectPresentation = 'kanban';
export type ProjectsTab = 'projects' | 'matrix';
export type ConfigSection = 'general' | 'account';

const VIEWS: readonly AppView[] = ['pomodoro', 'projects', 'project', 'admin'];

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

  /** Project shown by the `project` view, and the presentation it uses. Both survive reloads. */
  readonly activeProjectId = localStorageSignal<string | null>('productivist.activeProjectId', null);
  readonly projectPresentation = localStorageSignal<ProjectPresentation>('productivist.projectPresentation', 'kanban');

  /** Open state of the Plan-my-day modal. Not persisted: the wizard's own stage is. */
  readonly planningOpen = signal(false);

  /** Open state of the clock's own settings panel (clock style and sounds). */
  readonly settingsOpen = signal(false);

  /**
   * Configuration modal (language, theme, account). Global like the Plan-my-day modal, so the menu and the
   * header's account chip can open it over any view. `configSection` is the section it opens on.
   */
  readonly configOpen = signal(false);
  readonly configSection = signal<ConfigSection>('general');

  openConfiguration(section: ConfigSection = 'general'): void {
    this.configSection.set(section);
    this.configOpen.set(true);
  }

  closeConfiguration(): void {
    this.configOpen.set(false);
  }

  /** Any navigation closes the plan, which is how the wizard's launch actions close the modal. */
  setView(view: AppView): void {
    this.current.set(view);
    this.planningOpen.set(false);
  }

  openProject(id: string): void {
    this.activeProjectId.set(id);
    this.setView('project');
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
    this.activeProjectId.set(null);
    this.projectsTab.set('projects');
    this.focusQuadrant.set(null);
    this.planningOpen.set(false);
    this.configOpen.set(false);
  }
}
