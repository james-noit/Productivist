import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { buildPageStats } from '../../../lib/project-cards';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { RecurrenceService } from '../../../services/recurrence.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService, type ProjectsTab } from '../../../services/view.service';
import { EisenhowerViewComponent } from '../eisenhower-view/eisenhower-view.component';
import { ProjectsDashboardComponent } from '../projects-dashboard/projects-dashboard.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const TABS: readonly ProjectsTab[] = ['projects', 'matrix'];

/**
 * Tasks and projects: the page header (title, one-line summary, Recurring and Plan my day), the Projects | Matrix
 * tabs, and the tab bodies. The summary and the dashboard share one `stats` computed (a single pass over the todos).
 */
@Component({
  selector: 'app-projects-view',
  standalone: true,
  // EisenhowerViewComponent is only used inside a @defer block, so it gets its own chunk.
  imports: [TranslatePipe, ProjectsDashboardComponent, EisenhowerViewComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-view.component.html',
  styleUrl: './projects-view.component.css',
})
export class ProjectsViewComponent {
  readonly view = inject(ViewService);
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly flow = inject(FlowService);
  private readonly recurrences = inject(RecurrenceService);

  readonly activeRecurring = this.recurrences.activeCount;

  /** True once the wizard holds anything worth coming back to, so the button reads "Resume". */
  readonly planInProgress = computed(() => this.dailyPlan.stage() !== 'prompt' || this.dailyPlan.hasAnyObjective());
  readonly planStep = computed(() => this.dailyPlan.stepIndex() + 1);

  /** Everything the page shows about the tasks, built in one pass; the dashboard receives it as an input. */
  readonly stats = computed(() =>
    buildPageStats(
      this.todos.todos(),
      this.projects.sortedProjects(),
      this.projects.milestones(),
      this.flow.objectivesByProject(),
      this.recurrences.today(),
      (list) => this.todos.sortTasks(list),
    ),
  );
  readonly projectCount = computed(() => this.projects.projects().length);

  selectTab(tab: ProjectsTab): void {
    this.view.openProjectsTab(tab);
  }

  /** Left/Right move between the two tabs, wrapping, and take focus with them. */
  onTabKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(this.view.projectsTab()) + step + TABS.length) % TABS.length];
    this.selectTab(next);
    const tablist = event.currentTarget as HTMLElement;
    queueMicrotask(() => tablist.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
  }
}
