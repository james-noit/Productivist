import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { MultitaskService } from '../../../services/multitask.service';
import { ViewService } from '../../../services/view.service';
import { DailyPlanService, UNASSIGNED_GROUP_ID } from '../../../services/daily-plan.service';
import { DailyPlanProjectItemComponent } from '../daily-plan-project-item/daily-plan-project-item.component';
import type { Todo } from '../../../types/todo';
import type { Project } from '../../../types/project';

type SuggestionMode = 'productive' | 'dreaming';

interface Suggestion {
  todo: Todo;
  project?: Project;
  milestoneName?: string;
}

interface Star {
  left: number;
  top: number;
  delay: number;
  duration: number;
  size: number;
}

const STAR_COUNT = 26;

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

@Component({
  selector: 'app-daily-backlog-view',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DailyPlanProjectItemComponent],
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

  readonly objectiveDraft = signal('');
  readonly objectivesList = signal<string[]>([]);
  readonly hasAnyObjective = computed(
    () => this.objectivesList().length > 0 || this.objectiveDraft().trim().length > 0,
  );

  readonly suggestionMode = signal<SuggestionMode>('productive');
  readonly stars: Star[] = Array.from({ length: STAR_COUNT }, (_, i) => ({
    left: pseudoRandom(i * 3.1) * 100,
    top: pseudoRandom(i * 7.7) * 100,
    delay: pseudoRandom(i * 13.3) * 4,
    duration: 2.2 + pseudoRandom(i * 5.5) * 3,
    size: 1 + pseudoRandom(i * 11.1) * 2,
  }));

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

  readonly dreamingSuggestions = computed<Suggestion[]>(() => {
    const active = this.activeTodos();
    const aspirational = active.filter((t) => t.importance === 'high' && t.urgency !== 'high');
    const pool = aspirational.length ? aspirational : active;
    return pool.slice(0, 8).map((t) => this.toSuggestion(t));
  });

  dreamChipStyle(index: number): { delay: number; duration: number } {
    return { delay: pseudoRandom(index * 17.3) * 3, duration: 3.2 + pseudoRandom(index * 23.9) * 2.4 };
  }

  addSuggestionAsObjective(text: string): void {
    this.objectivesList.update((list) => [...list, text]);
  }

  readonly projectSearch = signal('');
  readonly filteredProjects = computed(() => {
    const term = this.projectSearch().trim().toLowerCase();
    const all = this.projects.sortedProjects();
    return term ? all.filter((p) => p.name.toLowerCase().includes(term)) : all;
  });

  readonly chosenProjects = computed(() => {
    const ids = new Set(this.dailyPlan.selectedProjectIds());
    return this.projects.sortedProjects().filter((p) => ids.has(p.id));
  });

  readonly isUnassignedChosen = computed(() =>
    this.dailyPlan.selectedProjectIds().includes(UNASSIGNED_GROUP_ID),
  );

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

  isProjectSelected(id: string): boolean {
    return this.dailyPlan.selectedProjectIds().includes(id);
  }

  tasksFor(objectiveId: string): Todo[] {
    const assignments = this.dailyPlan.assignments();
    return this.todos.todos().filter((t) => !t.done && assignments[t.id] === objectiveId);
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
