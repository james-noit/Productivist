import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { ViewService } from '../../../services/view.service';
import { TodoFormComponent } from '../todo-form/todo-form.component';
import { TodoFiltersComponent } from '../todo-filters/todo-filters.component';
import { TodoItemComponent } from '../todo-item/todo-item.component';
import { CompletedTasksStackComponent } from '../completed-tasks-stack/completed-tasks-stack.component';
import { ProjectsPanelComponent } from '../projects-panel/projects-panel.component';
import type { Todo } from '../../../types/todo';

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
  readonly dailyPlan = inject(DailyPlanService);
  private readonly view = inject(ViewService);

  /**
   * Kept separate from `todos.viewMode` (shared with multitask-task-drawer's own
   * all/projects tabs) so switching to Daily backlog here can't leave that drawer
   * stuck on a mode it doesn't know how to render.
   */
  readonly showDailyBacklog = signal(false);

  readonly plannedTasks = computed(() => {
    // In the order the plan committed them (the planning step's execution order), not the task list's.
    const byId = new Map(this.todos.todos().map((t) => [t.id, t] as const));
    const planned: Todo[] = [];
    for (const id of this.dailyPlan.committedPlannedTaskIds()) {
      const todo = byId.get(id);
      if (todo && !todo.done) planned.push(todo);
    }
    return planned;
  });

  selectTodoViewMode(mode: 'all' | 'projects'): void {
    this.showDailyBacklog.set(false);
    this.todos.setViewMode(mode);
  }

  openPlanning(): void {
    this.view.openPlanning();
  }
}
