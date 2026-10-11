import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { QUADRANTS } from '../../../lib/eisenhower';
import { PROJECTS_SORTS, type PageStats, type ProjectsSort, type TaskFilter } from '../../../lib/project-cards';
import { ViewService } from '../../../services/view.service';
import { ProjectsPageState } from '../projects-view/projects-page.state';
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

  /** The page's numbers: the quadrant and due counts. */
  readonly stats = input.required<PageStats>();
  /** Projects plus inbox tasks matching right now, for "Show N results". */
  readonly results = input.required<number>();

  readonly sorts = PROJECTS_SORTS;
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

  openMatrix(): void {
    this.view.openProjectsTab('matrix');
  }
}
