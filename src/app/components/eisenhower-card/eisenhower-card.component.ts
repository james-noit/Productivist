import { Component, inject, input, output } from '@angular/core';
import { TodosService } from '../../../services/todos.service';
import { TaskProjectTagComponent } from '../task-project-tag/task-project-tag.component';
import type { Todo } from '../../../types/todo';
import type { EisenhowerViewMode } from '../../../types/eisenhower';

@Component({
  selector: 'app-eisenhower-card',
  standalone: true,
  imports: [TaskProjectTagComponent],
  templateUrl: './eisenhower-card.component.html',
  styleUrl: './eisenhower-card.component.css',
})
export class EisenhowerCardComponent {
  readonly todos = inject(TodosService);

  readonly todo = input.required<Todo>();
  readonly viewMode = input.required<EisenhowerViewMode>();
  readonly open = output<string>();
}
