import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { MultitaskService } from '../../../services/multitask.service';
import { ViewService } from '../../../services/view.service';
import { DailyPlanService, UNASSIGNED_GROUP_ID } from '../../../services/daily-plan.service';
import { DailyPlanProjectItemComponent } from '../daily-plan-project-item/daily-plan-project-item.component';
import { ProjectFormComponent } from '../project-form/project-form.component';
import { ProjectsPanelComponent } from '../projects-panel/projects-panel.component';
import type { Todo } from '../../../types/todo';
import type { Project } from '../../../types/project';

interface Suggestion {
  todo: Todo;
  project?: Project;
  milestoneName?: string;
}

// Shared empty arrays, so an objective with nothing in it doesn't allocate per read.
const EMPTY_TASKS: readonly Todo[] = [];
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
    DailyPlanProjectItemComponent,
    ProjectFormComponent,
    ProjectsPanelComponent,
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
  private readonly translate = inject(TranslateService);

  readonly unassignedGroupId = UNASSIGNED_GROUP_ID;

  readonly steps = STEPS;
  readonly stepIndex = computed(() => {
    switch (this.dailyPlan.stage()) {
      case 'prompt':
        return 0;
      case 'chooseProjects':
        return 1;
      default:
        return 2;
    }
  });

  readonly objectiveDraft = signal('');
  readonly objectivesList = signal<string[]>([]);
  readonly hasAnyObjective = computed(
    () => this.objectivesList().length > 0 || this.objectiveDraft().trim().length > 0,
  );

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

  readonly tasksModalOpen = signal(false);

  closeTasksModalOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.tasksModalOpen.set(false);
  }

  readonly showNewProjectForm = signal(false);

  createProject(data: { icon: string; name: string; description: string; notes: string }): void {
    this.projects.addProject(data);
    this.showNewProjectForm.set(false);
  }

  readonly projectSearch = signal('');
  readonly filteredProjects = computed(() => {
    const term = this.projectSearch().trim().toLowerCase();
    const all = this.projects.sortedProjects();
    return term ? all.filter((p) => p.name.toLowerCase().includes(term)) : all;
  });

  readonly chosenProjects = computed(() => {
    const ids = this.dailyPlan.assignedProjectIds();
    return this.projects.sortedProjects().filter((p) => ids.has(p.id));
  });

  readonly isUnassignedChosen = computed(() => this.dailyPlan.assignedProjectIds().has(UNASSIGNED_GROUP_ID));

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
      return { id, icon: '📥', name: this.translate.instant('planningLab.freeTasks') };
    }
    const project = this.projects.projects().find((p) => p.id === id);
    return { id, icon: project?.icon ?? '📁', name: project?.name ?? '' };
  }

  // --- Tasks step ---

  isProjectSelected(id: string): boolean {
    return this.dailyPlan.assignedProjectIds().has(id);
  }

  /** Same shape as projectsByObjective: one pass over the todos rather than one per read. */
  private readonly tasksByObjective = computed(() => {
    const assignments = this.dailyPlan.assignments();
    const byObjective = new Map<string, Todo[]>();
    for (const todo of this.todos.todos()) {
      if (todo.done) continue;
      const objectiveId = assignments[todo.id];
      if (!objectiveId) continue;
      const bucket = byObjective.get(objectiveId);
      if (bucket) bucket.push(todo);
      else byObjective.set(objectiveId, [todo]);
    }
    return byObjective;
  });

  tasksFor(objectiveId: string): readonly Todo[] {
    return this.tasksByObjective().get(objectiveId) ?? EMPTY_TASKS;
  }

  placeArmedTask(objectiveId: string): void {
    const taskId = this.dailyPlan.draggedTaskId();
    if (!taskId) return;
    this.dailyPlan.assignTask(taskId, objectiveId);
    this.dailyPlan.endDrag();
  }

  confirmStartOver(): void {
    if (!window.confirm(this.translate.instant('planningLab.startOverConfirm'))) return;
    this.dailyPlan.startOver();
    this.projectSearch.set('');
  }

  // --- Move to pomodoro ---

  readonly showOverwriteConfirm = signal(false);

  requestMoveToPomodoro(): void {
    if (this.dailyPlan.committedPlannedTaskIds().length > 0) {
      this.showOverwriteConfirm.set(true);
      return;
    }
    this.goToPomodoro();
  }

  confirmOverwriteAndGo(): void {
    this.showOverwriteConfirm.set(false);
    this.goToPomodoro();
  }

  cancelOverwrite(): void {
    this.showOverwriteConfirm.set(false);
  }

  private goToPomodoro(): void {
    this.dailyPlan.commitPlannedTasks();
    this.multitask.setEnabled(false);
    this.view.setView('pomodoro');
  }

  // --- Grouping into parallel execution lots ---

  startGroupingParallel(): void {
    this.dailyPlan.startGroupingParallel();
  }

  taskById(id: string): Todo | undefined {
    return this.todos.todos().find((t) => t.id === id);
  }

  isArmed(taskId: string): boolean {
    return this.dailyPlan.draggedTaskId() === taskId;
  }

  toggleArmed(taskId: string): void {
    this.dailyPlan.toggleArmed(taskId);
  }

  placeArmedInLot(lotId: string): void {
    const taskId = this.dailyPlan.draggedTaskId();
    if (!taskId) return;
    this.dailyPlan.moveTaskToLot(taskId, lotId);
    this.dailyPlan.endDrag();
  }

  addNewLotWithArmed(): void {
    const taskId = this.dailyPlan.draggedTaskId();
    if (!taskId) return;
    this.dailyPlan.createLotWithTask(taskId);
    this.dailyPlan.endDrag();
  }

  moveLot(lotId: string, direction: -1 | 1): void {
    this.dailyPlan.moveLot(lotId, direction);
  }

  launchMultitask(): void {
    const lots = this.dailyPlan.executionLots();
    if (!lots.length) return;
    for (const taskId of lots[0].taskIds) this.multitask.addCard(taskId);
    this.dailyPlan.setActiveLotIndex(0);
    this.multitask.setEnabled(true);
    this.view.setView('pomodoro');
  }
}
