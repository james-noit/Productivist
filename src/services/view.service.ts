import { Injectable, inject, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { ProjectActivityService } from './project-activity.service';
import type { EisenhowerQuadrant } from '../types/eisenhower';
import type { ForgeKind } from '../types/forge';

export type AppView = 'pomodoro' | 'projects' | 'project' | 'admin';
/** How the project detail view shows its project. A union so later presentations extend it. */
export type ProjectPresentation = 'overview' | 'kanban' | 'list' | 'matrix' | 'roadmap' | 'calendar' | 'flow';
export type ProjectsTab = 'projects' | 'matrix';
export type ConfigSection = 'general' | 'integrations' | 'account';

const VIEWS: readonly AppView[] = ['pomodoro', 'projects', 'project', 'admin'];
const PRESENTATIONS: readonly ProjectPresentation[] = ['overview', 'kanban', 'list', 'matrix', 'roadmap', 'calendar', 'flow'];

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
    // An unknown stored presentation (a newer or older build wrote it) would render an empty project view.
    const presentation = localStorage.getItem('productivist.projectPresentation');
    if (presentation !== null) {
      let stored: unknown;
      try {
        stored = JSON.parse(presentation);
      } catch {
        stored = null;
      }
      if (!PRESENTATIONS.includes(stored as ProjectPresentation)) {
        localStorage.setItem('productivist.projectPresentation', JSON.stringify('kanban'));
      }
    }
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

  private readonly activity = inject(ProjectActivityService);

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

  /**
   * Whether the Kanban, List and Calendar presentations show completed tasks. Hidden by default so a
   * long-running project does not drown in finished work. Device-local, like the rest of the view state.
   */
  readonly showDoneTasks = localStorageSignal<boolean>('productivist.showDoneTasks', false);

  /**
   * The Kanban board's milestone filter, per project id (null = all). Lives here rather than in the board
   * because the Overview opens the board already filtered, and two signals on one key would go stale.
   */
  readonly kanbanMilestoneFilter = localStorageSignal<Record<string, string | null>>('productivist.kanbanMilestoneFilter', {});

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
  /** A Git host the Integrations section should open its "Add account" form on (a linked project's "Connect…"); read once. */
  readonly forgePrefill = signal<{ kind: ForgeKind; host: string } | null>(null);

  /**
   * Recurring-tasks modal. Global like the Configuration modal, so the Tasks and projects header, the menu and
   * Task Details' "Edit series" can open it over any view. `recurringSeriesId` is the series to select
   * (null = the list; 'new' starts a new one).
   */
  readonly recurringOpen = signal(false);
  readonly recurringSeriesId = signal<string | null>(null);
  /** The project the modal starts filtered to (a project's header opens it that way); null = every series. */
  readonly recurringProjectFilter = signal<string | null>(null);

  openRecurring(seriesId: string | null = null, opts?: { projectId?: string }): void {
    this.recurringSeriesId.set(seriesId);
    this.recurringProjectFilter.set(opts?.projectId ?? null);
    this.recurringOpen.set(true);
  }

  closeRecurring(): void {
    this.recurringOpen.set(false);
    this.recurringSeriesId.set(null);
    this.recurringProjectFilter.set(null);
  }

  openConfiguration(section: ConfigSection = 'general', forge?: { kind: ForgeKind; host: string }): void {
    this.configSection.set(section);
    this.forgePrefill.set(forge ?? null);
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
    this.activity.touch(id);
    this.activeProjectId.set(id);
    this.setView('project');
  }

  /** Opens the Kanban presentation of the active project, narrowed to one milestone (null = all). */
  openKanbanForMilestone(projectId: string, milestoneId: string | null): void {
    this.kanbanMilestoneFilter.update((all) => ({ ...all, [projectId]: milestoneId }));
    this.projectPresentation.set('kanban');
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
    this.showDoneTasks.set(false);
    this.projectsTab.set('projects');
    this.focusQuadrant.set(null);
    this.planningOpen.set(false);
    this.configOpen.set(false);
    this.closeRecurring();
  }
}
