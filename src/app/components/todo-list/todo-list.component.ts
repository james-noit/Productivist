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
import { planGroups } from '../../../lib/daily-plan-progress';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { Todo } from '../../../types/todo';

interface BacklogGroup {
  key: string;
  /** Objective text; null = "Other planned tasks". */
  title: string | null;
  open: Todo[];
  done: Todo[];
  doneCount: number;
  total: number;
  percent: number;
}

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
    UiIconComponent,
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
   * The tab lives in `ViewService.pomodoroListTab` (device-local). It is kept separate from `todos.viewMode`
   * (shared with multitask-task-drawer's own all/projects tabs) so switching to the plan here can't leave that
   * drawer stuck on a mode it doesn't know how to render.
   */
  readonly tab = this.view.pomodoroListTab;

  /** Groups whose finished tasks are unfolded. */
  readonly doneShown = signal<ReadonlySet<string>>(new Set());

  /** The committed plan by objective, in plan order: open tasks, finished ones folded and the progress. */
  readonly groups = computed<BacklogGroup[]>(() => {
    const byId = new Map(this.todos.todos().map((t) => [t.id, t] as const));
    const doneById = new Map(this.todos.todos().map((t) => [t.id, t.done] as const));
    return planGroups(
      this.dailyPlan.committedPlannedTaskIds(),
      this.dailyPlan.committedObjectives(),
      this.dailyPlan.committedAssignments(),
      doneById,
    ).map((g) => ({
      key: g.objective?.id ?? '',
      title: g.objective?.text ?? null,
      open: g.taskIds.map((id) => byId.get(id)!).filter((t) => !t.done),
      done: g.taskIds.map((id) => byId.get(id)!).filter((t) => t.done),
      doneCount: g.done,
      total: g.total,
      percent: Math.round((g.done / g.total) * 100),
    }));
  });

  readonly hasOpen = computed(() => this.groups().some((g) => g.open.length > 0));

  selectTodoViewMode(mode: 'all' | 'projects'): void {
    this.view.setPomodoroListTab(mode);
    this.todos.setViewMode(mode);
  }

  selectPlan(): void {
    this.view.setPomodoroListTab('plan');
  }

  toggleDone(key: string): void {
    this.doneShown.update((set) => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  openPlanning(): void {
    this.view.openPlanning();
  }
}
