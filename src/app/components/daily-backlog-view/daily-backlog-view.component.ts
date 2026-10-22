import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { MultitaskService } from '../../../services/multitask.service';
import { ViewService } from '../../../services/view.service';
import { DailyPlanService, UNASSIGNED_GROUP_ID } from '../../../services/daily-plan.service';
import { SportaskService } from '../../../services/sportask.service';
import { nextOpenTask } from '../../../lib/daily-plan-progress';
import { activateArmed } from '../../../lib/sportask/session-ops';
import { ProjectFormComponent } from '../project-form/project-form.component';
import { PlanObjectivesStepComponent } from '../plan-objectives-step/plan-objectives-step.component';
import { TaskBadgesComponent } from '../task-badges/task-badges.component';
import { IconComponent } from '../icon/icon.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import { LotEditorComponent, type LotTarget } from '../lot-editor/lot-editor.component';
import type { Todo } from '../../../types/todo';
import type { Project } from '../../../types/project';

interface Suggestion {
  todo: Todo;
  project?: Project;
  milestoneName?: string;
}

// Shared empty array, so an objective with nothing in it doesn't allocate per read.
const EMPTY_PROJECTS: readonly { id: string; icon: string; name: string }[] = [];

interface PlanStep {
  key: string;
  labelKey: string;
}

const STEPS: PlanStep[] = [
  { key: 'objectives', labelKey: 'planningLab.stepObjectives' },
  { key: 'projects', labelKey: 'planningLab.stepProjects' },
  { key: 'tasks', labelKey: 'planningLab.stepTasks' },
];

@Component({
  selector: 'app-daily-backlog-view',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    ProjectFormComponent,
    PlanObjectivesStepComponent,
    IconComponent,
    UiIconComponent,
    LotEditorComponent,
    TaskBadgesComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-backlog-view.component.html',
  styleUrl: './daily-backlog-view.component.css',
})
export class DailyBacklogViewComponent {
  readonly dailyPlan = inject(DailyPlanService);
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly multitask = inject(MultitaskService);
  private readonly view = inject(ViewService);
  private readonly sportask = inject(SportaskService);
  private readonly translate = inject(TranslateService);

  readonly unassignedGroupId = UNASSIGNED_GROUP_ID;

  readonly steps = STEPS;
  readonly stepIndex = this.dailyPlan.stepIndex;

  // Held by DailyPlanService so they survive the Plan-my-day modal being closed and reopened.
  readonly objectiveDraft = this.dailyPlan.objectiveDraft;
  readonly objectivesList = this.dailyPlan.objectivesList;
  readonly hasAnyObjective = this.dailyPlan.hasAnyObjective;

  private readonly activeTodos = computed(() => this.todos.todos().filter((t) => !t.done));

  private toSuggestion(todo: Todo): Suggestion {
    return {
      todo,
      project: todo.projectId ? this.projects.projects().find((p) => p.id === todo.projectId) : undefined,
      milestoneName: todo.milestoneId
        ? this.projects.milestones().find((m) => m.id === todo.milestoneId)?.name
        : undefined,
    };
  }

  readonly productiveSuggestions = computed<Suggestion[]>(() => {
    const active = this.activeTodos();
    const doFirst = active.filter((t) => t.importance === 'high' && t.urgency === 'high');
    const pool = doFirst.length ? doFirst : active.filter((t) => t.importance === 'high' || t.urgency === 'high');
    return pool.slice(0, 6).map((t) => this.toSuggestion(t));
  });

  addSuggestionAsObjective(text: string): void {
    this.objectivesList.update((list) => [...list, text]);
  }

  /**
   * Escape closes the wizard's own modals, topmost first. PlanningLabModalComponent leaves Escape
   * alone while any nested overlay exists, so this is what keeps it from also closing the plan.
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showOverwriteConfirm()) this.cancelOverwrite();
  }

  readonly showNewProjectForm = signal(false);

  createProject(data: { icon: string; name: string; description: string; notes: string }): void {
    this.projects.addProject(data);
    this.showNewProjectForm.set(false);
  }

  readonly projectSearch = signal('');

  constructor() {
    // Back on step 1 (e.g. after Start over in the modal header): forget the project search too.
    effect(() => {
      if (this.dailyPlan.stage() === 'prompt') this.projectSearch.set('');
    });
  }
  readonly filteredProjects = computed(() => {
    const term = this.projectSearch().trim().toLowerCase();
    const all = this.projects.sortedProjects();
    return term ? all.filter((p) => p.name.toLowerCase().includes(term)) : all;
  });

  addObjective(): void {
    const trimmed = this.objectiveDraft().trim();
    if (!trimmed) return;
    this.objectivesList.update((list) => [...list, trimmed]);
    this.objectiveDraft.set('');
  }

  removeObjective(index: number): void {
    this.objectivesList.update((list) => list.filter((_, i) => i !== index));
  }

  chooseFromProjects(): void {
    const pending = this.objectiveDraft().trim();
    const objectives = pending ? [...this.objectivesList(), pending] : this.objectivesList();
    this.dailyPlan.startPlanning(objectives);
    this.objectivesList.set([]);
    this.objectiveDraft.set('');
  }

  goBackToObjectives(): void {
    this.objectivesList.set(this.dailyPlan.objectives().map((o) => o.text));
    this.objectiveDraft.set('');
    this.dailyPlan.backToPrompt();
  }

  // --- Projects step: arm a project, then place it into one or more objective baskets ---

  isProjectArmed(projectId: string): boolean {
    return this.dailyPlan.draggedProjectId() === projectId;
  }

  toggleArmedProject(projectId: string): void {
    this.dailyPlan.toggleArmedProject(projectId);
  }

  projectObjectiveCount(projectId: string): number {
    return Object.values(this.dailyPlan.projectAssignments()).filter((ids) => ids.includes(projectId)).length;
  }

  placeArmedProject(objectiveId: string): void {
    const projectId = this.dailyPlan.draggedProjectId();
    if (!projectId) return;
    this.dailyPlan.assignProjectToObjective(projectId, objectiveId);
    this.dailyPlan.endDragProject();
  }

  /**
   * objectiveId -> the projects assigned to it, resolved for display. The template reads
   * this twice per objective (emptiness check + the loop); building it inline meant
   * re-resolving every project name on every change detection pass.
   */
  private readonly projectsByObjective = computed(() => {
    const byObjective = new Map<string, { id: string; icon: string; name: string }[]>();
    for (const [objectiveId, ids] of Object.entries(this.dailyPlan.projectAssignments())) {
      byObjective.set(objectiveId, ids.map((id) => this.projectDisplay(id)));
    }
    return byObjective;
  });

  projectsInObjective(objectiveId: string): readonly { id: string; icon: string; name: string }[] {
    return this.projectsByObjective().get(objectiveId) ?? EMPTY_PROJECTS;
  }

  private projectDisplay(id: string): { id: string; icon: string; name: string } {
    if (id === UNASSIGNED_GROUP_ID) {
      return { id, icon: 'inbox', name: this.translate.instant('planningLab.freeTasks') };
    }
    const project = this.projects.projects().find((p) => p.id === id);
    return { id, icon: project?.icon ?? 'folder', name: project?.name ?? '' };
  }

  // --- Move to pomodoro ---

  readonly showOverwriteConfirm = signal(false);
  private pendingLaunch: 'pomodoro' | 'multitask' | null = null;

  requestMoveToPomodoro(): void {
    if (this.dailyPlan.committedPlannedTaskIds().length > 0) {
      this.pendingLaunch = 'pomodoro';
      this.showOverwriteConfirm.set(true);
      return;
    }
    this.goToPomodoro();
  }

  confirmOverwriteAndGo(): void {
    this.showOverwriteConfirm.set(false);
    if (this.pendingLaunch === 'multitask') this.doLaunchMultitask();
    else this.goToPomodoro();
    this.pendingLaunch = null;
  }

  cancelOverwrite(): void {
    this.showOverwriteConfirm.set(false);
    this.pendingLaunch = null;
  }

  private goToPomodoro(): void {
    this.dailyPlan.commitPlannedTasks();
    this.multitask.setEnabled(false);
    this.view.setPomodoroListTab('plan');
    // Open on the plan: unless the current task is already part of it, start from its first open task.
    const committed = this.dailyPlan.committedPlannedTaskIds();
    const currentId = this.todos.currentTaskId();
    if (!currentId || !committed.includes(currentId)) {
      const done = new Map(this.todos.todos().map((t) => [t.id, t.done] as const));
      const first = nextOpenTask(committed, done, null);
      if (first) this.todos.setCurrentTask(first);
    }
    this.view.setView('pomodoro');
    activateArmed(this.sportask, 'planner');
  }

  // --- Grouping into parallel execution lots ---

  startGroupingParallel(): void {
    this.dailyPlan.startGroupingParallel();
  }

  /** id -> title of every task; the lot editor looks tasks up in it. */
  readonly titles = computed(() => new Map(this.todos.todos().map((t) => [t.id, t.title] as const)));
  readonly doneIds = computed(() => new Set(this.todos.todos().filter((t) => t.done).map((t) => t.id)));

  moveTask(event: { taskId: string; target: LotTarget }): void {
    if (event.target === 'newLot') this.dailyPlan.createLotWithTask(event.taskId);
    else this.dailyPlan.moveTaskToLot(event.taskId, event.target.lotId);
  }

  launchMultitask(): void {
    if (!this.dailyPlan.executionLots().length) return;
    if (this.dailyPlan.committedPlannedTaskIds().length > 0) {
      this.pendingLaunch = 'multitask';
      this.showOverwriteConfirm.set(true);
      return;
    }
    this.doLaunchMultitask();
  }

  private doLaunchMultitask(): void {
    const lots = this.dailyPlan.executionLots();
    if (!lots.length) return;
    this.dailyPlan.commitPlannedTasks();
    for (const taskId of lots[0].taskIds) this.multitask.addCard(taskId);
    this.dailyPlan.setActiveLotIndex(0);
    this.multitask.setEnabled(true);
    this.view.setView('pomodoro');
    activateArmed(this.sportask, 'planner');
  }
}
