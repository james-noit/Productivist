import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { TaskProjectTagComponent } from '../task-project-tag/task-project-tag.component';
import { TaskBadgesComponent } from '../task-badges/task-badges.component';
import type { Todo } from '../../../types/todo';

@Component({
  selector: 'app-todo-item',
  standalone: true,
  imports: [TaskProjectTagComponent, TranslatePipe, TaskBadgesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-item.component.html',
  styleUrl: './todo-item.component.css',
})
export class TodoItemComponent {
  readonly todos = inject(TodosService);

  readonly todo = input.required<Todo>();

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    this.todos.dragOverTodo(this.todo().id, before);
  }
}
