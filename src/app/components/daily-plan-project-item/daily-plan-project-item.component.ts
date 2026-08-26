import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { sortByPriority } from '../../../lib/eisenhower';
import { ProjectFormComponent } from '../project-form/project-form.component';
import type { Project } from '../../../types/project';
import type { Todo } from '../../../types/todo';

// Shared empty array so an empty milestone doesn't allocate a fresh one per read.
const EMPTY_TASKS: readonly Todo[] = [];

@Component({
  selector: 'app-daily-plan-project-item',
  standalone: true,
  imports: [TranslatePipe, ProjectFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-plan-project-item.component.html',
  styleUrl: './daily-plan-project-item.component.css',
})
export class DailyPlanProjectItemComponent {
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly translate = inject(TranslateService);
  readonly dailyPlan = inject(DailyPlanService);

  readonly project = input.required<Project | null>();

  readonly expanded = signal(false);
  readonly editing = signal(false);
  readonly expandedMilestones = signal<Set<string>>(new Set());

  readonly milestones = computed(() => {
    const project = this.project();
    return project ? this.projects.milestonesForProject(project.id) : [];
  });

  readonly directTasks = computed(() => {
    const project = this.project();
    return sortByPriority(
      this.todos
        .todos()
        .filter((t) => !t.done && !t.milestoneId && (project ? t.projectId === project.id : !t.projectId)),
    );
  });

  readonly taskCount = computed(() => {
    const project = this.project();
    return this.todos.todos().filter((t) => !t.done && (project ? t.projectId === project.id : !t.projectId))
      .length;
  });

  /** See project-tree-item: one pass over the todos instead of one per template read. */
  private readonly tasksByMilestone = computed(() => {
    const byMilestone = new Map<string, Todo[]>();
    for (const todo of this.todos.todos()) {
      if (todo.done || !todo.milestoneId) continue;
      const bucket = byMilestone.get(todo.milestoneId);
      if (bucket) bucket.push(todo);
      else byMilestone.set(todo.milestoneId, [todo]);
    }
    for (const [id, list] of byMilestone) byMilestone.set(id, sortByPriority(list));
    return byMilestone;
  });

  milestoneTasks(milestoneId: string): readonly Todo[] {
    return this.tasksByMilestone().get(milestoneId) ?? EMPTY_TASKS;
  }

  toggleMilestone(id: string): void {
    const next = new Set(this.expandedMilestones());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expandedMilestones.set(next);
  }

  /**
   * taskId -> the text of the objective it is assigned to. Built once per data change; the
   * template reads it once per task per render and previously did a linear scan of the
   * objectives for each of those reads.
   */
  private readonly objectiveLabels = computed(() => {
    const textById = new Map(this.dailyPlan.objectives().map((o) => [o.id, o.text]));
    const labels = new Map<string, string>();
    for (const [taskId, objectiveId] of Object.entries(this.dailyPlan.assignments())) {
      const text = textById.get(objectiveId);
      if (text !== undefined) labels.set(taskId, text);
    }
    return labels;
  });

  objectiveLabel(taskId: string): string | undefined {
    return this.objectiveLabels().get(taskId);
  }

  isArmed(taskId: string): boolean {
    return this.dailyPlan.draggedTaskId() === taskId;
  }

  onTaskClick(taskId: string): void {
    this.dailyPlan.toggleArmed(taskId);
  }

  onDragStart(taskId: string): void {
    this.dailyPlan.startDrag(taskId);
  }

  onDragEnd(): void {
    this.dailyPlan.endDrag();
  }

  saveEdit(data: { icon: string; name: string; description: string; notes: string }): void {
    const project = this.project();
    if (!project) return;
    this.projects.updateProject(project.id, data);
    this.editing.set(false);
  }

  deleteProject(): void {
    const project = this.project();
    if (!project) return;
    if (!window.confirm(this.translate.instant('projects.deleteConfirm'))) return;
    this.projects.removeProject(project.id);
  }
}
