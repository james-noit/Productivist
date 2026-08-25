import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { ProjectsService } from '../../../services/projects.service';
import type { Priority, Todo } from '../../../types/todo';

const ICONS = ['📁', '📌', '🚀', '🎯', '📚', '💼', '🛠️', '🎨', '🧪', '🏗️', '🌱', '🔥'];

@Component({
  selector: 'app-task-detail-modal',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './task-detail-modal.component.html',
  styleUrl: './task-detail-modal.component.css',
})
export class TaskDetailModalComponent {
  readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly translate = inject(TranslateService);

  readonly todo = input.required<Todo>();
  readonly close = output<void>();

  readonly icons = ICONS;

  readonly title = signal('');
  readonly description = signal('');
  readonly importance = signal<Priority>('medium');
  readonly urgency = signal<Priority>('medium');
  readonly tagsInput = signal('');
  readonly pomodorosForTermination = signal('');

  readonly projectRef = signal('');
  readonly milestoneRef = signal('');

  readonly chosenIcon = signal(ICONS[0]);
  readonly projectName = signal('');
  readonly milestoneName = signal('');

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
      this.chosenIcon.set(ICONS[0]);
      this.projectName.set('');
      this.milestoneName.set('');
    });
  }

  readonly selectedProjectId = computed<string | undefined>(() => {
    const ref = this.projectRef();
    if (ref === '__new__') return undefined;
    return ref || undefined;
  });

  readonly showMilestones = computed(() => !!this.selectedProjectId());

  readonly projectSelectOptions = computed(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: '', label: this.translate.instant('eisenhower.createTask.noProject') },
      ...this.projects.sortedProjects().map((p) => ({ value: p.id, label: `${p.icon} ${p.name}` })),
    ];
    opts.push({ value: '__new__', label: this.translate.instant('eisenhower.createTask.newProject') });
    return opts;
  });

  readonly milestoneOptions = computed(() => {
    const projectId = this.selectedProjectId();
    if (!projectId) return [];
    const projectMilestones = this.projects.milestonesForProject(projectId);
    const opts: Array<{ value: string; label: string }> = [
      { value: '', label: this.translate.instant('eisenhower.createTask.noMilestone') },
      ...projectMilestones.map((m) => ({ value: m.id, label: m.name })),
    ];
    opts.push({ value: '__new__', label: this.translate.instant('eisenhower.createTask.newMilestone') });
    return opts;
  });

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

  submitNewProject(): void {
    const name = this.projectName().trim();
    if (!name) return;
    const created = this.projects.addProject({ icon: this.chosenIcon(), name, description: '', notes: '' });
    this.projectName.set('');
    this.projectRef.set(created.id);
    this.milestoneRef.set('');
    this.todos.updateTodo(this.todo().id, { projectId: created.id, milestoneId: undefined });
  }

  submitNewMilestone(): void {
    const name = this.milestoneName().trim();
    const projectId = this.selectedProjectId();
    if (!name || !projectId) return;
    const created = this.projects.addMilestone(projectId, name);
    this.milestoneName.set('');
    this.milestoneRef.set(created.id);
    this.todos.updateTodo(this.todo().id, { projectId, milestoneId: created.id });
  }

  remove(): void {
    this.todos.removeTodo(this.todo().id);
    this.close.emit();
  }
}
