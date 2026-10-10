import { Injectable, computed, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { createId } from '../core/create-id';
import { comparePriority } from '../lib/eisenhower';
import { sanitizeDates } from '../lib/dates';
import { columnOf, reorderSlice, statusOf, type BoardColumnKey } from '../lib/kanban';
import type { Priority, TaskStatus, Todo, TodoExport } from '../types/todo';

export interface TodoFilters {
  importance: Priority | 'all';
  urgency: Priority | 'all';
  tag: string | 'all';
}

export type TodoViewMode = 'all' | 'projects';

/** The fields `updateTodo`/`updateMany` may change. Completion goes through `toggleDone`/`updateMany({ done })`. */
export type TodoPatch = Partial<
  Pick<
    Todo,
    | 'title'
    | 'description'
    | 'importance'
    | 'urgency'
    | 'tags'
    | 'projectId'
    | 'milestoneId'
    | 'pomodorosForTermination'
    | 'status'
    | 'startDate'
    | 'dueDate'
  >
>;



@Injectable({ providedIn: 'root' })
export class TodosService {
  readonly todos = localStorageSignal<Todo[]>('productivist.todos', []);
  readonly filters = localStorageSignal<TodoFilters>('productivist.todoFilters', {
    importance: 'all',
    urgency: 'all',
    tag: 'all',
  });
  readonly viewMode = localStorageSignal<TodoViewMode>('productivist.todoViewMode', 'all');
  readonly hasCustomOrder = localStorageSignal<boolean>('productivist.todosCustomOrder', false);
  readonly draggedId = signal<string | null>(null);
  readonly currentTaskId = localStorageSignal<string | null>('productivist.currentTaskId', null);

  readonly allTags = computed(() => {
    const tags = new Set<string>();
    for (const todo of this.todos()) {
      for (const tag of todo.tags) tags.add(tag);
    }
    return Array.from(tags).sort();
  });

  readonly filteredTodos = computed(() => {
    const filters = this.filters();
    return this.sortTasks(
      this.todos()
        .filter((todo) => !todo.done)
        .filter((todo) => filters.importance === 'all' || todo.importance === filters.importance)
        .filter((todo) => filters.urgency === 'all' || todo.urgency === filters.urgency)
        .filter((todo) => filters.tag === 'all' || todo.tags.includes(filters.tag)),
    );
  });

  readonly completedTodos = computed(() => {
    return this.todos()
      .filter((todo) => todo.done)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  });

  readonly unassignedTodos = computed(() => {
    return this.sortTasks(this.todos().filter((todo) => !todo.done && !todo.projectId));
  });

  readonly currentTask = computed(() => {
    const id = this.currentTaskId();
    if (!id) return null;
    return this.todos().find((t) => t.id === id && !t.done) ?? null;
  });

  sortTasks(list: Todo[]): Todo[] {
    const sorted = [...list];
    if (this.hasCustomOrder()) {
      return sorted.sort((a, b) => a.order - b.order);
    }
    // Same importance-then-urgency ordering as lib/eisenhower's sortByPriority, with the
    // stored order as the final tiebreak so equal-priority tasks keep a stable position.
    return sorted.sort((a, b) => comparePriority(a, b) || a.order - b.order);
  }

  setCurrentTask(id: string | null): void {
    this.currentTaskId.set(id);
  }

  addTodo(input: {
    title: string;
    description?: string;
    importance: Priority;
    urgency: Priority;
    tags: string[];
    projectId?: string;
    milestoneId?: string;
    pomodorosForTermination?: number;
    status?: TaskStatus;
    startDate?: string;
    dueDate?: string;
  }): void {
    const maxOrder = this.todos().reduce((max, t) => Math.max(max, t.order), -1);
    const todo: Todo = {
      id: createId(),
      title: input.title,
      description: input.description,
      importance: input.importance,
      urgency: input.urgency,
      tags: input.tags,
      done: false,
      order: maxOrder + 1,
      createdAt: Date.now(),
      projectId: input.projectId,
      milestoneId: input.milestoneId,
      pomodorosForTermination: input.pomodorosForTermination,
      ...(input.status ? { status: input.status } : {}),
      ...(input.startDate ? { startDate: input.startDate } : {}),
      ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    };
    this.todos.update((list) => [...list, todo]);
  }

  private patchTodo(id: string, patch: Partial<Todo>): void {
    this.todos.update((list) => list.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo)));
  }

  assignToMilestone(todoId: string, projectId: string, milestoneId: string): void {
    this.patchTodo(todoId, { projectId, milestoneId });
  }

  unassignFromProject(todoId: string): void {
    this.patchTodo(todoId, { projectId: undefined, milestoneId: undefined });
  }

  clearProjectRefs(projectId: string): void {
    this.todos.update((list) =>
      list.map((todo) =>
        todo.projectId === projectId ? { ...todo, projectId: undefined, milestoneId: undefined } : todo,
      ),
    );
  }

  clearMilestoneRefs(milestoneId: string): void {
    this.todos.update((list) =>
      list.map((todo) => (todo.milestoneId === milestoneId ? { ...todo, milestoneId: undefined } : todo)),
    );
  }

  setViewMode(mode: TodoViewMode): void {
    this.viewMode.set(mode);
  }

  removeTodo(id: string): void {
    this.todos.update((list) => list.filter((todo) => todo.id !== id));
    if (this.currentTaskId() === id) this.currentTaskId.set(null);
  }

  updateTodo(id: string, patch: TodoPatch): void {
    this.patchTodo(id, patch);
  }

  /**
   * Applies one patch to several todos in a single write (the List's bulk actions). `done` is handled
   * like `toggleDone`: completing stamps `completedAt`, un-completing clears it.
   */
  updateMany(ids: readonly string[], patch: TodoPatch & { done?: boolean }): void {
    if (!ids.length) return;
    const selected = new Set(ids);
    const { done, ...rest } = patch;
    const now = Date.now();
    this.todos.update((list) =>
      list.map((todo) => {
        if (!selected.has(todo.id)) return todo;
        const next: Todo = { ...todo, ...rest };
        if (done !== undefined && done !== todo.done) {
          next.done = done;
          next.completedAt = done ? now : undefined;
        }
        return next;
      }),
    );
    const current = this.currentTaskId();
    if (done && current && selected.has(current)) this.currentTaskId.set(null);
  }

  removeMany(ids: readonly string[]): void {
    if (!ids.length) return;
    const selected = new Set(ids);
    this.todos.update((list) => list.filter((todo) => !selected.has(todo.id)));
    const current = this.currentTaskId();
    if (current && selected.has(current)) this.currentTaskId.set(null);
  }

  toggleDone(id: string): void {
    const todo = this.todos().find((t) => t.id === id);
    if (!todo) return;
    const done = !todo.done;
    this.patchTodo(id, { done, completedAt: done ? Date.now() : undefined });
    if (done && this.currentTaskId() === id) this.currentTaskId.set(null);
  }

  /**
   * Moves a card on a project board: sets done/completedAt/status from the target column, optionally
   * its milestone (`null` clears it) and places it before `beforeId` (end of the column when null).
   * Only the target column slice (same project, same lane when `milestoneId` is given) gets new
   * `order` values. One write, so one sync diff.
   */
  moveOnBoard(
    id: string,
    target: { column: BoardColumnKey; milestoneId?: string | null; beforeId?: string | null },
  ): void {
    const list = this.todos();
    const moved = list.find((t) => t.id === id);
    if (!moved) return;
    const now = Date.now();
    const toDone = target.column === 'done';
    const wasDone = moved.done;
    const status = statusOf(target.column);
    const patch: Partial<Todo> = {};
    if (toDone) {
      if (!wasDone) {
        patch.done = true;
        patch.completedAt = now;
      }
    } else {
      patch.done = false;
      patch.completedAt = undefined;
      // A task kept at 'todo' stores no status, so its wire form stays unchanged.
      patch.status = status === 'todo' ? undefined : status;
    }
    const milestoneId = target.milestoneId === undefined ? moved.milestoneId : (target.milestoneId ?? undefined);
    if (target.milestoneId !== undefined) patch.milestoneId = milestoneId;

    let orders: Map<string, number> | null = null;
    // The Done column is sorted by completion time, so its order values mean nothing.
    if (!toDone) {
      const slice = list
        .filter(
          (t) =>
            t.id !== id &&
            t.projectId === moved.projectId &&
            columnOf(t) === target.column &&
            (target.milestoneId === undefined || t.milestoneId === milestoneId),
        )
        .sort((a, b) => a.order - b.order)
        .map((t) => t.id);
      const orderById = new Map(list.map((t) => [t.id, t.order]));
      orders = reorderSlice(slice, id, target.beforeId ?? null, (x) => orderById.get(x) ?? 0);
    }

    this.todos.update((all) =>
      all.map((t) => {
        if (t.id === id) {
          const next = { ...t, ...patch };
          if (orders?.has(id)) next.order = orders.get(id)!;
          return next;
        }
        const order = orders?.get(t.id);
        return order !== undefined && order !== t.order ? { ...t, order } : t;
      }),
    );
    if (toDone && this.currentTaskId() === id) this.currentTaskId.set(null);
  }

  reorderTodoBefore(draggedTodoId: string, targetTodoId: string, before: boolean): void {
    if (draggedTodoId === targetTodoId) return;
    const list = this.todos();
    const sorted = this.sortTasks(list.filter((t) => !t.done));
    const fromIndex = sorted.findIndex((t) => t.id === draggedTodoId);
    const targetIndex = sorted.findIndex((t) => t.id === targetTodoId);
    if (fromIndex === -1 || targetIndex === -1) return;
    let insertIndex = before ? targetIndex : targetIndex + 1;
    if (insertIndex > fromIndex) insertIndex -= 1;
    if (insertIndex === fromIndex) return;
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(insertIndex, 0, moved);
    const orderById = new Map(sorted.map((todo, index) => [todo.id, index]));
    this.todos.set(
      list.map((todo) => (orderById.has(todo.id) ? { ...todo, order: orderById.get(todo.id)! } : todo)),
    );
    this.hasCustomOrder.set(true);
  }

  startDrag(id: string): void {
    this.draggedId.set(id);
  }

  dragOverTodo(targetId: string, before: boolean): void {
    const draggedId = this.draggedId();
    if (draggedId) this.reorderTodoBefore(draggedId, targetId, before);
  }

  endDrag(): void {
    this.draggedId.set(null);
  }

  setFilters(next: Partial<TodoFilters>): void {
    this.filters.update((current) => ({ ...current, ...next }));
  }

  exportTodos(): TodoExport {
    return { version: 1, todos: this.todos() };
  }

  importTodos(data: TodoExport): void {
    if (!data || data.version !== 1 || !Array.isArray(data.todos)) {
      throw new Error('Invalid Productivist to-do file');
    }
    this.todos.set(data.todos.map(sanitizeDates));
  }

  reset(): void {
    this.todos.set([]);
    this.filters.set({ importance: 'all', urgency: 'all', tag: 'all' });
    this.currentTaskId.set(null);
    this.viewMode.set('all');
    this.hasCustomOrder.set(false);
  }
}
