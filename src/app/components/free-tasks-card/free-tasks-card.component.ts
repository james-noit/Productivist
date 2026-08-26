import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { QuadrantCountBadgesComponent } from '../quadrant-count-badges/quadrant-count-badges.component';
import { TodoFormComponent } from '../todo-form/todo-form.component';
import { countByQuadrant } from '../../../lib/eisenhower';
import type { Priority, Todo } from '../../../types/todo';

let nextId = 0;

@Component({
  selector: 'app-free-tasks-card',
  standalone: true,
  imports: [FormsModule, TranslatePipe, QuadrantCountBadgesComponent, TodoFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './free-tasks-card.component.html',
  styleUrl: './free-tasks-card.component.css',
})
export class FreeTasksCardComponent {
  readonly todos = inject(TodosService);

  readonly tagSuggestionsId = `free-tasks-tags-${nextId++}`;

  readonly expanded = signal(false);
  readonly addingTask = signal(false);
  readonly editingTaskId = signal<string | null>(null);
  readonly editTitle = signal('');
  readonly editImportance = signal<Priority>('medium');
  readonly editUrgency = signal<Priority>('medium');
  readonly editTags = signal('');

  readonly tasks = computed(() => this.todos.unassignedTodos());
  readonly counts = computed(() => countByQuadrant(this.tasks()));

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
}
