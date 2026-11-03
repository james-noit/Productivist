import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { QUADRANTS } from '../../../lib/eisenhower';
import { PROJECTS_SORTS, type PageStats, type ProjectsSort, type TaskFilter } from '../../../lib/project-cards';
import { ViewService } from '../../../services/view.service';
import { ProjectsService } from '../../../services/projects.service';
import { INBOX_FILTER, ProjectsPageState, TASK_SORTS, type TaskSort } from '../projects-view/projects-page.state';
import { SideDrawerComponent } from '../side-drawer/side-drawer.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * The filters drawer of the Tasks and projects page: an offcanvas dialog from the right with the priority
 * quadrants (multi-select), the due filter, the sort and what to show. Filters apply live, there is no draft: the
 * values live in the page's `ProjectsPageState`, shared with the dashboard and the floating button. Rendered by
 * the dashboard while `state.filtersOpen()`; closing is `state.filtersOpen.set(false)`, which destroys it.
 * The shell (scrim, slide-in, focus trap, Escape, focus start and return, scroll lock) is `side-drawer`.
 */
@Component({
  selector: 'app-projects-filter-drawer',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, SideDrawerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-filter-drawer.component.html',
  styleUrl: './projects-filter-drawer.component.css',
})
export class ProjectsFilterDrawerComponent {
  readonly state = inject(ProjectsPageState);
  private readonly view = inject(ViewService);
  private readonly projects = inject(ProjectsService);

  /** The page's numbers: the quadrant and due counts. */
  readonly stats = input.required<PageStats>();
  /** Projects plus inbox tasks matching right now, for "Show N results". */
  readonly results = input.required<number>();

  /** 'projects' = the Projects tab's filters; 'tasks' = the All tasks tab's (project filter, task sorts, done switch). */
  readonly mode = input<'projects' | 'tasks'>('projects');

  readonly sorts = PROJECTS_SORTS;
  readonly taskSorts = TASK_SORTS;
  readonly showDone = this.view.showDoneTasks;
  readonly dues: readonly { value: TaskFilter | null; labelKey: string }[] = [
    { value: null, labelKey: 'projects.filters.dueAnyShort' },
    { value: 'week', labelKey: 'projects.filters.dueWeekShort' },
    { value: 'overdue', labelKey: 'projects.filters.dueOverdue' },
  ];

  readonly tiles = computed(() => {
    const counts = this.stats().quadrants;
    const chosen = this.state.quadrants();
    return QUADRANTS.map((q) => ({
      key: q.key,
      css: q.cssKey,
      labelKey: q.labelKey,
      hintKey: `${q.labelKey}Hint`,
      count: counts[q.key],
      pressed: chosen.includes(q.key),
    }));
  });

  /** Inbox and every project as a project-filter chip, with the open tasks it holds. */
  readonly projectOptions = computed(() => {
    const { byProject, inbox } = this.stats();
    const chosen = this.state.taskProjects();
    return [
      { id: INBOX_FILTER, name: null as string | null, count: inbox.length, pressed: chosen.includes(INBOX_FILTER) },
      ...this.projects.sortedProjects().map((p) => ({ id: p.id, name: p.name as string | null, count: byProject.get(p.id)?.open ?? 0, pressed: chosen.includes(p.id) })),
    ];
  });

  /** The count beside each due option (null = any time shows none). */
  dueCount(due: TaskFilter | null): number | null {
    const stats = this.stats();
    return due === 'week' ? stats.dueWeek : due === 'overdue' ? stats.overdue : null;
  }

  /** The control that opened the drawer, where focus goes back to when it closes. */
  protected readonly opener: HTMLElement | null = this.takeOpener();

  constructor() {
    // Closing from inside (Escape, the close button, the scrim) and leaving the tab both end here.
    inject(DestroyRef).onDestroy(() => this.state.filtersOpen.set(false));
  }

  private takeOpener(): HTMLElement | null {
    const opener = this.state.filtersOpener;
    this.state.filtersOpener = null;
    return opener;
  }

  close(): void {
    this.state.filtersOpen.set(false);
  }

  setSort(sort: ProjectsSort): void {
    this.state.sort.set(sort);
  }

  setTaskSort(sort: TaskSort): void {
    this.state.taskSort.set(sort);
  }

  openMatrix(): void {
    this.view.openProjectsTab('matrix');
  }
}
