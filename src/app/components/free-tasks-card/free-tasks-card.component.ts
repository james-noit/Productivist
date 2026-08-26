import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { QuadrantCountBadgesComponent } from '../quadrant-count-badges/quadrant-count-badges.component';
import { TodoFormComponent } from '../todo-form/todo-form.component';
import { countByQuadrant } from '../../../lib/eisenhower';
import { TaskBadgesComponent } from '../task-badges/task-badges.component';
import { InlineTaskEditorComponent } from '../inline-task-editor/inline-task-editor.component';
import type { Todo } from '../../../types/todo';


@Component({
  selector: 'app-free-tasks-card',
  standalone: true,
  imports: [FormsModule, TranslatePipe, QuadrantCountBadgesComponent, TodoFormComponent, TaskBadgesComponent, InlineTaskEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './free-tasks-card.component.html',
  styleUrl: './free-tasks-card.component.css',
})
export class FreeTasksCardComponent {
  readonly todos = inject(TodosService);


  readonly expanded = signal(false);
  readonly addingTask = signal(false);
  readonly editingTaskId = signal<string | null>(null);

  readonly tasks = computed(() => this.todos.unassignedTodos());
  readonly counts = computed(() => countByQuadrant(this.tasks()));

  startTaskEdit(todo: Todo): void {
    this.editingTaskId.set(todo.id);
  }

  cancelTaskEdit(): void {
    this.editingTaskId.set(null);
  }

}
