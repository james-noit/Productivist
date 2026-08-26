import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { TodoFormComponent } from '../todo-form/todo-form.component';
import { TodoFiltersComponent } from '../todo-filters/todo-filters.component';
import { TodoItemComponent } from '../todo-item/todo-item.component';
import { CompletedTasksStackComponent } from '../completed-tasks-stack/completed-tasks-stack.component';
import { ProjectsPanelComponent } from '../projects-panel/projects-panel.component';

@Component({
  selector: 'app-todo-list',
  standalone: true,
  imports: [
    TranslatePipe,
    TodoFormComponent,
    TodoFiltersComponent,
    TodoItemComponent,
    CompletedTasksStackComponent,
    ProjectsPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './todo-list.component.html',
  styleUrl: './todo-list.component.css',
})
export class TodoListComponent {
  readonly todos = inject(TodosService);
}
