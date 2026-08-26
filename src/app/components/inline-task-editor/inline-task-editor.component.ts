import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { TodosService } from '../../../services/todos.service';
import { PrioritySelectComponent } from '../priority-select/priority-select.component';
import type { Priority, Todo } from '../../../types/todo';

let nextId = 0;

/**
 * The compact "edit this task in place" form — title, importance, urgency and tags.
 * free-tasks-card and project-tree-item each carried an identical copy of this form, its
 * four edit signals and its start/cancel/save trio; they now just decide when to show it.
 */
@Component({
  selector: 'app-inline-task-editor',
  standalone: true,
  imports: [FormsModule, TranslatePipe, PrioritySelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inline-task-editor.component.html',
  styleUrl: './inline-task-editor.component.css',
})
export class InlineTaskEditorComponent {
  readonly todos = inject(TodosService);

  readonly todo = input.required<Todo>();
  readonly done = output<void>();

  readonly tagSuggestionsId = `inline-task-tags-${nextId++}`;

  readonly title = signal('');
  readonly importance = signal<Priority>('medium');
  readonly urgency = signal<Priority>('medium');
  readonly tags = signal('');

  constructor() {
    // Re-seed whenever the editor is pointed at a different task.
    effect(() => {
      const todo = this.todo();
      this.title.set(todo.title);
      this.importance.set(todo.importance);
      this.urgency.set(todo.urgency);
      this.tags.set(todo.tags.join(', '));
    });
  }

  save(): void {
    const trimmed = this.title().trim();
    if (!trimmed) return;
    const tags = this.tags()
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    this.todos.updateTodo(this.todo().id, {
      title: trimmed,
      importance: this.importance(),
      urgency: this.urgency(),
      tags,
    });
    this.done.emit();
  }

  cancel(): void {
    this.done.emit();
  }
}
