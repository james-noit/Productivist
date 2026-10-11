import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { QUADRANTS } from '../../../lib/eisenhower';
import { trapTab } from '../../../lib/focus-trap';
import { PROJECTS_SORTS, type PageStats, type ProjectsSort, type TaskFilter } from '../../../lib/project-cards';
import { ViewService } from '../../../services/view.service';
import { ProjectsPageState } from '../projects-view/projects-page.state';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const SCROLL_LOCK_CLASS = 'planning-lab-open';

/**
 * The filters drawer of the Tasks and projects page: an offcanvas dialog from the right with the priority
 * quadrants (multi-select), the due filter, the sort and what to show. Filters apply live, there is no draft: the
 * values live in the page's `ProjectsPageState`, shared with the dashboard and the floating button. Rendered by
 * the dashboard while `state.filtersOpen()`; closing is `state.filtersOpen.set(false)`, which destroys it.
 * Escape closes it (and does not reach the page), Tab is trapped, focus starts on the first control and goes back
 * to the control that opened it, and the page behind does not scroll.
 */
@Component({
  selector: 'app-projects-filter-drawer',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
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

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

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

  constructor() {
    const previouslyFocused = this.state.filtersOpener;
    this.state.filtersOpener = null;
    document.body.classList.add(SCROLL_LOCK_CLASS);
    afterNextRender(() => this.panel().nativeElement.querySelector<HTMLElement>('[data-first]')?.focus());
    inject(DestroyRef).onDestroy(() => {
      document.body.classList.remove(SCROLL_LOCK_CLASS);
      // Closing from inside (Escape, ✕, the scrim) and leaving the tab both end here; the opener may be gone.
      this.state.filtersOpen.set(false);
      queueMicrotask(() => {
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
      });
    });
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

  closeOnScrim(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    trapTab(event, this.panel().nativeElement);
  }
}
