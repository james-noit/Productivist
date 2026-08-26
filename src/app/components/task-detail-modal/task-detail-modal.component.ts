import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { ProjectsService } from '../../../services/projects.service';
import {
  ProjectMilestonePickerComponent,
  NEW_REF,
  type NewProjectInput,
} from '../project-milestone-picker/project-milestone-picker.component';
import type { Priority, Todo } from '../../../types/todo';


@Component({
  selector: 'app-task-detail-modal',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ProjectMilestonePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-detail-modal.component.html',
  styleUrl: './task-detail-modal.component.css',
})
export class TaskDetailModalComponent {
  readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);

  readonly todo = input.required<Todo>();
  readonly close = output<void>();

  private readonly picker = viewChild(ProjectMilestonePickerComponent);


  readonly title = signal('');
  readonly description = signal('');
  readonly importance = signal<Priority>('medium');
  readonly urgency = signal<Priority>('medium');
  readonly tagsInput = signal('');
  readonly pomodorosForTermination = signal('');

  readonly projectRef = signal('');

  /** Mirrors the picker's own derivation; used by the commit handlers below. */
  private readonly selectedProjectId = computed(() => {
    const ref = this.projectRef();
    return ref === NEW_REF ? undefined : ref || undefined;
  });
  readonly milestoneRef = signal('');


  constructor() {
    effect(() => {
      const todo = this.todo();
      this.title.set(todo.title);
      this.description.set(todo.description ?? '');
      this.importance.set(todo.importance);
      this.urgency.set(todo.urgency);
      this.tagsInput.set(todo.tags.join(', '));
      this.pomodorosForTermination.set(todo.pomodorosForTermination?.toString() ?? '');
      this.projectRef.set(todo.projectId ?? '');
      this.milestoneRef.set(todo.milestoneId ?? '');
      this.picker()?.resetDrafts();
    });
  }





  commitTitle(): void {
    const trimmed = this.title().trim();
    if (!trimmed || trimmed === this.todo().title) {
      this.title.set(this.todo().title);
      return;
    }
    this.todos.updateTodo(this.todo().id, { title: trimmed });
  }

  commitImportance(): void {
    this.todos.updateTodo(this.todo().id, { importance: this.importance() });
  }

  commitUrgency(): void {
    this.todos.updateTodo(this.todo().id, { urgency: this.urgency() });
  }

  commitTags(): void {
    const tags = this.tagsInput()
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    this.todos.updateTodo(this.todo().id, { tags });
  }

  commitDescription(): void {
    this.todos.updateTodo(this.todo().id, { description: this.description().trim() || undefined });
  }

  commitPomodorosForTermination(): void {
    const parsed = parseInt(this.pomodorosForTermination(), 10);
    this.todos.updateTodo(this.todo().id, {
      pomodorosForTermination: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
    });
  }

  onProjectSelect(): void {
    if (this.projectRef() === '__new__') {
      return;
    }
    const projectId = this.projectRef() || undefined;
    if (projectId === this.todo().projectId) return;
    this.milestoneRef.set('');
    this.todos.updateTodo(this.todo().id, { projectId, milestoneId: undefined });
  }

  onMilestoneSelect(): void {
    if (this.milestoneRef() === '__new__') {
      return;
    }
    const projectId = this.selectedProjectId();
    if (!projectId) return;
    const milestoneId = this.milestoneRef() || undefined;
    if (milestoneId === this.todo().milestoneId && projectId === this.todo().projectId) return;
    this.todos.updateTodo(this.todo().id, { projectId, milestoneId });
  }

  submitNewProject(input: NewProjectInput): void {
    const created = this.projects.addProject({ ...input, description: '', notes: '' });
    this.projectRef.set(created.id);
    this.milestoneRef.set('');
    this.todos.updateTodo(this.todo().id, { projectId: created.id, milestoneId: undefined });
  }

  submitNewMilestone(name: string): void {
    const projectId = this.selectedProjectId();
    if (!projectId) return;
    const created = this.projects.addMilestone(projectId, name);
    this.milestoneRef.set(created.id);
    this.todos.updateTodo(this.todo().id, { projectId, milestoneId: created.id });
  }

  remove(): void {
    this.todos.removeTodo(this.todo().id);
    this.close.emit();
  }
}
