import { ChangeDetectionStrategy, Component, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { MultitaskService } from '../../../services/multitask.service';
import { TodoFormComponent } from '../todo-form/todo-form.component';
import { TodoFiltersComponent } from '../todo-filters/todo-filters.component';
import { CompletedTasksStackComponent } from '../completed-tasks-stack/completed-tasks-stack.component';
import { ProjectsPanelComponent } from '../projects-panel/projects-panel.component';
import { TaskPoolListComponent } from '../task-pool-list/task-pool-list.component';

@Component({
  selector: 'app-multitask-task-drawer',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    TodoFormComponent,
    TodoFiltersComponent,
    CompletedTasksStackComponent,
    ProjectsPanelComponent,
    TaskPoolListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './multitask-task-drawer.component.html',
  styleUrl: './multitask-task-drawer.component.css',
})
export class MultitaskTaskDrawerComponent {
  readonly todos = inject(TodosService);
  readonly multitask = inject(MultitaskService);

  readonly open = signal(false);
  private readonly taskPoolList = viewChild(TaskPoolListComponent);

  readonly isPickable = (todoId: string): boolean => !this.multitask.assignedTaskIds().has(todoId);

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  assignToNewCard(taskId: string): void {
    this.multitask.addCard(taskId);
  }

  constructor() {
    effect(() => {
      if (this.open()) {
        queueMicrotask(() => this.taskPoolList()?.focusSearch());
      }
    });
  }
}
