import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { sortByPriority } from '../../../lib/eisenhower';
import { ProjectFormComponent } from '../project-form/project-form.component';
import type { Project } from '../../../types/project';
import type { Todo } from '../../../types/todo';

@Component({
  selector: 'app-daily-plan-project-item',
  standalone: true,
  imports: [TranslatePipe, ProjectFormComponent],
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

  milestoneTasks(milestoneId: string): Todo[] {
    return sortByPriority(this.todos.todos().filter((t) => !t.done && t.milestoneId === milestoneId));
  }

  toggleMilestone(id: string): void {
    const next = new Set(this.expandedMilestones());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expandedMilestones.set(next);
  }

  objectiveLabel(taskId: string): string | undefined {
    const objectiveId = this.dailyPlan.assignments()[taskId];
    if (!objectiveId) return undefined;
    return this.dailyPlan.objectives().find((o) => o.id === objectiveId)?.text;
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
