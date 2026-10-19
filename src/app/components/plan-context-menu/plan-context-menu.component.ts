import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { TodosService } from '../../../services/todos.service';
import type { Todo } from '../../../types/todo';
import { ContextMenuComponent } from '../context-menu/context-menu.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

export type PlanContextKind = 'row' | 'suggestion' | 'objective';

/** The slice of an objective's card the menu needs (`ObjectiveCard` of the step satisfies it). */
export interface PlanContextCard {
  id: string;
  text: string;
  rows: { todo: Todo }[];
  suggestions: Todo[];
}

type Page = 'main' | 'moveTo' | 'planIn' | 'clear';

/**
 * The context menus of Plan my day step 3 (inside `context-menu`): a planned row (open, reorder, move to another
 * objective, mark done, remove), a suggestion (plan it here or in another objective, open) and an objective card
 * (add tasks, new task, add all suggestions, change projects, clear). Reordering, removing and completing go straight
 * to `DailyPlanService` / `TodosService`; what needs the step (the picker, Task Details, the inline new-task field,
 * linking the project when planning) comes out through the outputs, and `settled` says where focus should land.
 */
@Component({
  selector: 'app-plan-context-menu',
  standalone: true,
  imports: [TranslatePipe, ContextMenuComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-context-menu.component.html',
  styles: `
    :host,
    .plctx {
      display: contents;
    }

    .plctx__name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .plctx__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* aria-disabled, not disabled: a disabled button cannot take focus and would stop the arrow keys. */
    .menu-item[aria-disabled='true'] {
      opacity: 0.45;
      cursor: default;
    }

    .plctx__flip {
      transform: scaleX(-1);
    }
  `,
})
export class PlanContextMenuComponent {
  private readonly dailyPlan = inject(DailyPlanService);
  private readonly todos = inject(TodosService);

  readonly x = input.required<number>();
  readonly y = input.required<number>();
  readonly kind = input.required<PlanContextKind>();
  /** The task for a row or a suggestion. */
  readonly taskId = input<string | null>(null);
  /** The objective for a suggestion or an objective card (a row's is found from the task). */
  readonly objectiveId = input<string | null>(null);
  readonly cards = input.required<readonly PlanContextCard[]>();
  readonly returnFocus = input<HTMLElement | null>(null);
  readonly dismissed = output<void>();

  readonly openTask = output<string>();
  readonly addTasks = output<string>();
  readonly newTask = output<string>();
  readonly addAll = output<string>();
  readonly changeProjects = output<void>();
  readonly planTask = output<{ taskId: string; objectiveId: string }>();
  /** Something was done to the plan: focus goes to the task's title if it is still there, else to the objective's Add tasks. */
  readonly settled = output<{ taskId: string | null; objectiveId: string }>();

  readonly page = signal<Page>('main');

  /** What was pressed: the task, its card and its place in the card's list (rows only). */
  readonly subject = computed(() => {
    const cards = this.cards();
    const taskId = this.taskId();
    if (this.kind() === 'row') {
      for (const card of cards) {
        const index = card.rows.findIndex((row) => row.todo.id === taskId);
        if (index !== -1) return { card, todo: card.rows[index].todo, index, last: card.rows.length - 1 };
      }
      return null;
    }
    const card = cards.find((c) => c.id === this.objectiveId());
    if (!card) return null;
    if (this.kind() === 'suggestion') {
      const todo = card.suggestions.find((t) => t.id === taskId) ?? this.todos.todos().find((t) => t.id === taskId);
      return todo ? { card, todo, index: -1, last: -1 } : null;
    }
    return { card, todo: null, index: -1, last: -1 };
  });

  /** The other objectives (a row's "Move to objective"). */
  readonly others = computed(() => {
    const own = this.subject()?.card.id;
    return this.cards().filter((c) => c.id !== own);
  });

  goTo(page: Page, menu: { focusFirst(): void }): void {
    this.page.set(page);
    menu.focusFirst();
  }

  /** Escape on a second page goes back to the first instead of closing the menu. */
  onPageEscape(event: Event, menu: { focusFirst(): void }): void {
    if (this.page() === 'main') return;
    event.stopPropagation();
    this.goTo('main', menu);
  }

  // Every action closes the menu without moving focus; the step puts it where it belongs afterwards.

  open(todoId: string, menu: { close(): void }): void {
    menu.close();
    this.openTask.emit(todoId);
  }

  /** Move within the card: `to` is the row index the task should land before (past the end = last). */
  reorder(to: 'up' | 'down' | 'top', menu: { close(): void }): void {
    const s = this.subject();
    if (!s?.todo || s.index < 0) return;
    const rows = s.card.rows;
    if (to !== 'down' ? s.index === 0 : s.index === s.last) return;
    menu.close();
    const before = to === 'up' ? rows[s.index - 1].todo.id : to === 'top' ? rows[0].todo.id : (rows[s.index + 2]?.todo.id ?? null);
    this.dailyPlan.moveTask(s.todo.id, s.card.id, before);
    this.settled.emit({ taskId: s.todo.id, objectiveId: s.card.id });
  }

  moveToObjective(todoId: string, objectiveId: string, menu: { close(): void }): void {
    menu.close();
    this.dailyPlan.moveTask(todoId, objectiveId, null);
    this.settled.emit({ taskId: todoId, objectiveId });
  }

  markDone(todoId: string, objectiveId: string, menu: { close(): void }): void {
    menu.close();
    this.todos.toggleDone(todoId);
    this.settled.emit({ taskId: null, objectiveId });
  }

  remove(todoId: string, objectiveId: string, menu: { close(): void }): void {
    menu.close();
    this.dailyPlan.unassignTask(todoId);
    this.settled.emit({ taskId: null, objectiveId });
  }

  plan(todoId: string, objectiveId: string, menu: { close(): void }): void {
    menu.close();
    this.planTask.emit({ taskId: todoId, objectiveId });
  }

  clear(card: PlanContextCard, menu: { close(): void }): void {
    menu.close();
    for (const row of card.rows) this.dailyPlan.unassignTask(row.todo.id);
    this.settled.emit({ taskId: null, objectiveId: card.id });
  }

  add(objectiveId: string, menu: { close(): void }): void {
    menu.close();
    this.addTasks.emit(objectiveId);
  }

  create(objectiveId: string, menu: { close(): void }): void {
    menu.close();
    this.newTask.emit(objectiveId);
  }

  planAll(objectiveId: string, menu: { close(): void }): void {
    menu.close();
    this.addAll.emit(objectiveId);
  }

  projects(menu: { close(): void }): void {
    menu.close();
    this.changeProjects.emit();
  }
}
