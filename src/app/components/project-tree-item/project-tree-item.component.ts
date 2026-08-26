import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { MultitaskService } from '../../../services/multitask.service';
import { ProjectFormComponent } from '../project-form/project-form.component';
import { TodoFormComponent } from '../todo-form/todo-form.component';
import { QuadrantCountBadgesComponent } from '../quadrant-count-badges/quadrant-count-badges.component';
import type { Project } from '../../../types/project';
import type { Priority, Todo } from '../../../types/todo';
import type { QuadrantCounts } from '../../../lib/eisenhower';

let nextId = 0;

@Component({
  selector: 'app-project-tree-item',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ProjectFormComponent, TodoFormComponent, QuadrantCountBadgesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-tree-item.component.html',
  styleUrl: './project-tree-item.component.css',
})
export class ProjectTreeItemComponent {
  private readonly projects = inject(ProjectsService);
  readonly todos = inject(TodosService);
  private readonly multitask = inject(MultitaskService);
  private readonly translate = inject(TranslateService);

  readonly project = input.required<Project>();
  readonly multitaskMode = input(false);
  readonly isTaskPickable = input<(todoId: string) => boolean>();
  readonly onPickTask = input<(todoId: string) => void>();
  readonly quadrantCounts = input<QuadrantCounts>();

  readonly tagSuggestionsId = `project-tree-tags-${nextId++}`;

  readonly expanded = signal(false);
  readonly editing = signal(false);
  readonly expandedMilestones = signal<Set<string>>(new Set());
  readonly newMilestoneName = signal('');
  readonly addingTaskMilestoneId = signal<string | null>(null);
  readonly pickingMilestoneId = signal<string | null>(null);
  readonly editingTaskId = signal<string | null>(null);
  readonly editTitle = signal('');
  readonly editImportance = signal<Priority>('medium');
  readonly editUrgency = signal<Priority>('medium');
  readonly editTags = signal('');

  readonly milestones = computed(() => this.projects.milestonesForProject(this.project().id));

  readonly taskCount = computed(
    () => this.todos.todos().filter((todo) => !todo.done && todo.projectId === this.project().id).length,
  );

  milestoneTasks(milestoneId: string): Todo[] {
    return this.todos.sortTasks(this.todos.todos().filter((todo) => !todo.done && todo.milestoneId === milestoneId));
  }

  startTaskEdit(todo: Todo): void {
    this.editingTaskId.set(todo.id);
    this.editTitle.set(todo.title);
    this.editImportance.set(todo.importance);
    this.editUrgency.set(todo.urgency);
    this.editTags.set(todo.tags.join(', '));
  }

  cancelTaskEdit(): void {
    this.editingTaskId.set(null);
  }

  saveTaskEdit(id: string): void {
    const trimmed = this.editTitle().trim();
    if (!trimmed) return;
    const tags = this.editTags()
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    this.todos.updateTodo(id, { title: trimmed, importance: this.editImportance(), urgency: this.editUrgency(), tags });
    this.editingTaskId.set(null);
  }

  toggleMilestone(id: string): void {
    const next = new Set(this.expandedMilestones());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expandedMilestones.set(next);
  }

  saveEdit(data: { icon: string; name: string; description: string; notes: string }): void {
    this.projects.updateProject(this.project().id, data);
    this.editing.set(false);
  }

  deleteProject(): void {
    if (!window.confirm(this.translate.instant('projects.deleteConfirm'))) return;
    this.projects.removeProject(this.project().id);
  }

  addMilestone(): void {
    const trimmed = this.newMilestoneName().trim();
    if (!trimmed) return;
    const milestone = this.projects.addMilestone(this.project().id, trimmed);
    this.expandedMilestones.set(new Set(this.expandedMilestones()).add(milestone.id));
    this.newMilestoneName.set('');
  }

  deleteMilestone(id: string): void {
    if (!window.confirm(this.translate.instant('projects.deleteMilestoneConfirm'))) return;
    this.projects.removeMilestone(id);
  }

  assignExisting(todoId: string, milestoneId: string): void {
    this.todos.assignToMilestone(todoId, this.project().id, milestoneId);
  }

  isPickable(todoId: string): boolean {
    const predicate = this.isTaskPickable();
    return predicate ? predicate(todoId) : !this.multitask.assignedTaskIds().has(todoId);
  }

  pickTask(todoId: string): void {
    const handler = this.onPickTask();
    if (handler) handler(todoId);
    else this.multitask.addCard(todoId);
  }

  toggleAddingTask(milestoneId: string): void {
    this.addingTaskMilestoneId.set(this.addingTaskMilestoneId() === milestoneId ? null : milestoneId);
  }

  togglePicking(milestoneId: string): void {
    this.pickingMilestoneId.set(this.pickingMilestoneId() === milestoneId ? null : milestoneId);
  }
}
