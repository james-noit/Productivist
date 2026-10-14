import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { buildPageStats } from '../../../lib/project-cards';
import { trapTab } from '../../../lib/focus-trap';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { RecurrenceService } from '../../../services/recurrence.service';
import { TodosService } from '../../../services/todos.service';
import { ProjectActivityService } from '../../../services/project-activity.service';
import { ViewService, type ProjectsTab } from '../../../services/view.service';
import { EisenhowerViewComponent } from '../eisenhower-view/eisenhower-view.component';
import { FabMenuComponent, type FabItem } from '../fab-menu/fab-menu.component';
import { NewTaskModalComponent } from '../new-task-modal/new-task-modal.component';
import { ProjectFormComponent } from '../project-form/project-form.component';
import { ProjectsDashboardComponent } from '../projects-dashboard/projects-dashboard.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import { ProjectsPageState } from './projects-page.state';

const TABS: readonly ProjectsTab[] = ['projects', 'matrix'];

/** The floating "+" menu: New task (N), New project (P) and New recurring task. */
const FAB_ITEMS: readonly FabItem[] = [
  { id: 'task', icon: 'check', labelKey: 'projects.fab.task', shortcut: 'N' },
  { id: 'project', icon: 'folder', labelKey: 'projects.fab.project', shortcut: 'P' },
  { id: 'recurring', icon: 'repeat', labelKey: 'projects.fab.recurring' },
];

/**
 * Tasks and projects: the page header (title, one-line summary, Recurring and Plan my day), the Projects | Eisenhower Matrix
 * tabs, the tab bodies, the floating "+" and the dialogs it opens (New task, New project), so both tabs can create.
 * The summary and the dashboard share one `stats` computed (a single pass over the todos). `ProjectsPageState`
 * (search, filters, sort, layout, create requests) is provided here, for the dashboard, the filters drawer and
 * the floating button to share without a root service.
 */
@Component({
  selector: 'app-projects-view',
  standalone: true,
  // EisenhowerViewComponent is only used inside a @defer block, so it gets its own chunk.
  imports: [
    TranslatePipe,
    ProjectsDashboardComponent,
    EisenhowerViewComponent,
    FabMenuComponent,
    NewTaskModalComponent,
    ProjectFormComponent,
    UiIconComponent,
  ],
  providers: [ProjectsPageState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-view.component.html',
  styleUrl: './projects-view.component.css',
})
export class ProjectsViewComponent {
  readonly view = inject(ViewService);
  readonly state = inject(ProjectsPageState);
  private readonly injector = inject(Injector);
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly flow = inject(FlowService);
  private readonly recurrences = inject(RecurrenceService);
  private readonly activity = inject(ProjectActivityService);

  readonly activeRecurring = this.recurrences.activeCount;
  protected readonly fabItems = FAB_ITEMS;

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
      this.activity.activity(),
    ),
  );
  readonly projectCount = computed(() => this.projects.projects().length);

  private readonly newProjectPanel = viewChild<ElementRef<HTMLElement>>('newProjectPanel');

  constructor() {
    // The name field takes focus once the New project dialog has rendered.
    effect(() => {
      if (this.state.creatingProject()) {
        afterNextRender(() => this.newProjectPanel()?.nativeElement.querySelector<HTMLElement>('input[name="name"]')?.focus(), { injector: this.injector });
      }
    });
  }

  /** The floating button asked for something to be created; the focused control (the button, or whatever had focus for a shortcut) gets focus back afterwards. */
  onFabPick(id: string): void {
    if (id === 'task') this.state.openNewTask();
    else if (id === 'project') this.state.openNewProject();
    else this.view.openRecurring('new');
  }

  closeNewTask(): void {
    this.state.creatingTask.set(false);
    this.state.restoreFocus();
  }

  closeNewProject(): void {
    this.state.creatingProject.set(false);
    this.state.restoreFocus();
  }

  createProject(data: { icon: string; name: string; description: string; notes: string }): void {
    this.projects.addProject(data);
    this.closeNewProject();
  }

  onNewProjectKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeNewProject();
      return;
    }
    const panel = this.newProjectPanel()?.nativeElement;
    if (panel) trapTab(event, panel);
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeNewProject();
  }

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
