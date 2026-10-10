import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { dueState, isIsoDate, orderedDates, todayIso, type DueState } from '../../../lib/dates';
import { PRIORITY_RANK } from '../../../lib/eisenhower';
import { BOARD_COLUMNS, columnOf, type BoardColumnKey } from '../../../lib/kanban';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import { PrioritySelectComponent } from '../priority-select/priority-select.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import type { Milestone, Project } from '../../../types/project';
import type { Priority, Todo } from '../../../types/todo';

type Grouping = 'none' | 'milestone' | 'status';
type SortKey = 'title' | 'status' | 'milestone' | 'importance' | 'urgency' | 'start' | 'due' | 'age';
type SortDir = 'asc' | 'desc';
/** Milestone filter value for "tasks without a milestone". */
const NO_MILESTONE = '__none__';
const DAY_MS = 86_400_000;

interface ListColumn {
  key: string;
  labelKey: string;
  /** Set for sortable columns; `defaultDir` is the direction of the first click. */
  sort?: { key: SortKey; defaultDir: SortDir };
}

/**
 * Header cells in display order (the select checkbox and the open button have their own, unnamed cells).
 * Ticket fields (assignee, type, key) slot in here: a column entry, a cell in the template and a sort value.
 */
const COLUMNS: readonly ListColumn[] = [
  { key: 'title', labelKey: 'taskList.columns.title', sort: { key: 'title', defaultDir: 'asc' } },
  { key: 'status', labelKey: 'taskList.columns.status', sort: { key: 'status', defaultDir: 'asc' } },
  { key: 'milestone', labelKey: 'taskList.columns.milestone', sort: { key: 'milestone', defaultDir: 'asc' } },
  { key: 'importance', labelKey: 'todo.importance', sort: { key: 'importance', defaultDir: 'desc' } },
  { key: 'urgency', labelKey: 'todo.urgency', sort: { key: 'urgency', defaultDir: 'desc' } },
  { key: 'start', labelKey: 'taskList.columns.start', sort: { key: 'start', defaultDir: 'asc' } },
  { key: 'due', labelKey: 'taskList.columns.due', sort: { key: 'due', defaultDir: 'asc' } },
  { key: 'tags', labelKey: 'todo.tags' },
  { key: 'age', labelKey: 'taskList.columns.age', sort: { key: 'age', defaultDir: 'desc' } },
];

const STATUS_FILTERS: readonly BoardColumnKey[] = ['todo', 'inProgress', 'review'];
const COLUMN_INDEX: Record<BoardColumnKey, number> = { todo: 0, inProgress: 1, review: 2, done: 3 };

interface Row {
  todo: Todo;
  column: BoardColumnKey;
  ageDays: number;
  due: DueState | null;
}

interface Group {
  key: string;
  /** Translation key or literal name; at most one is set, neither for the ungrouped list. */
  labelKey: string | null;
  name: string | null;
  rows: Row[];
}

@Component({
  selector: 'app-project-task-list',
  standalone: true,
  imports: [FormsModule, TranslatePipe, PrioritySelectComponent, TaskDetailModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-task-list.component.html',
  styleUrl: './project-task-list.component.css',
})
export class ProjectTaskListComponent {
  private readonly todosService = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly translate = inject(TranslateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly view = inject(ViewService);

  readonly project = input.required<Project>();

  readonly tableColumns = COLUMNS;
  readonly statusFilters = STATUS_FILTERS;
  readonly boardColumns = BOARD_COLUMNS;
  readonly noMilestone = NO_MILESTONE;

  // Filters are device-local component state; only the grouping is remembered.
  readonly search = signal('');
  readonly statusFilter = signal<BoardColumnKey | 'all'>('all');
  readonly milestoneFilter = signal<string>('all');
  readonly grouping = localStorageSignal<Grouping>('productivist.listGrouping', 'none');
  readonly sort = signal<{ key: SortKey; dir: SortDir } | null>(null);

  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly detailId = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly draftTitle = signal('');
  readonly adding = signal(false);
  readonly newTitle = signal('');

  readonly milestones = computed<Milestone[]>(() => {
    const id = this.project().id;
    return this.projects
      .milestones()
      .filter((m) => m.projectId === id)
      .sort((a, b) => a.order - b.order);
  });

  private readonly milestoneById = computed(() => new Map(this.milestones().map((m) => [m.id, m])));

  /** Filtered, sorted and grouped rows: everything the table renders. */
  readonly groups = computed<Group[]>(() => {
    const projectId = this.project().id;
    const query = this.search().trim().toLowerCase();
    const statusFilter = this.statusFilter();
    const milestoneFilter = this.milestoneFilter();
    const showDone = this.view.showDoneTasks();
    const milestones = this.milestoneById();
    const today = todayIso();
    const now = Date.now();

    const rows: Row[] = [];
    for (const todo of this.todosService.todos()) {
      if (todo.projectId !== projectId) continue;
      const column = columnOf(todo);
      if (column === 'done' && !showDone) continue;
      if (statusFilter !== 'all' && column !== statusFilter) continue;
      const milestoneId = todo.milestoneId && milestones.has(todo.milestoneId) ? todo.milestoneId : null;
      if (milestoneFilter === NO_MILESTONE ? milestoneId !== null : milestoneFilter !== 'all' && milestoneId !== milestoneFilter) continue;
      if (query && !todo.title.toLowerCase().includes(query) && !todo.tags.some((t) => t.toLowerCase().includes(query))) continue;
      rows.push({
        todo,
        column,
        ageDays: Math.max(0, Math.floor((now - todo.createdAt) / DAY_MS)),
        due: todo.dueDate ? dueState(todo.dueDate, todo.done, today) : null,
      });
    }

    rows.sort(this.comparator(this.sort(), milestones));

    const grouping = this.grouping();
    if (grouping === 'none') return [{ key: 'all', labelKey: null, name: null, rows }];
    const buckets = new Map<string, Group>();
    if (grouping === 'status') {
      for (const col of BOARD_COLUMNS) buckets.set(col.key, { key: col.key, labelKey: col.labelKey, name: null, rows: [] });
      for (const row of rows) buckets.get(row.column)!.rows.push(row);
    } else {
      for (const m of this.milestones()) buckets.set(m.id, { key: m.id, labelKey: null, name: m.name, rows: [] });
      buckets.set(NO_MILESTONE, { key: NO_MILESTONE, labelKey: 'kanban.noMilestone', name: null, rows: [] });
      for (const row of rows) {
        const id = row.todo.milestoneId && milestones.has(row.todo.milestoneId) ? row.todo.milestoneId : NO_MILESTONE;
        buckets.get(id)!.rows.push(row);
      }
    }
    return [...buckets.values()].filter((g) => g.rows.length);
  });

  private readonly visibleIds = computed(() => this.groups().flatMap((g) => g.rows.map((r) => r.todo.id)));
  readonly visibleCount = computed(() => this.visibleIds().length);
  readonly selectedIds = computed(() => this.visibleIds().filter((id) => this.selection().has(id)));
  readonly selectedCount = computed(() => this.selectedIds().length);
  readonly allSelected = computed(() => this.visibleCount() > 0 && this.selectedCount() === this.visibleCount());
  readonly someSelected = computed(() => this.selectedCount() > 0 && !this.allSelected());

  /** Whether the project has any task at all, ignoring filters, for the empty hint. */
  readonly projectHasTasks = computed(() => {
    const id = this.project().id;
    return this.todosService.todos().some((t) => t.projectId === id);
  });

  private readonly todoById = computed(() => new Map(this.todosService.todos().map((t) => [t.id, t])));
  readonly detailTodo = computed(() => {
    const id = this.detailId();
    return id ? (this.todoById().get(id) ?? null) : null;
  });

  constructor() {
    // Selection only keeps rows that are still visible (a filter, a delete or a sync can remove them).
    effect(() => {
      const visible = new Set(this.visibleIds());
      const current = untracked(this.selection);
      if ([...current].some((id) => !visible.has(id))) this.selection.set(new Set([...current].filter((id) => visible.has(id))));
    });
  }

  // ---- sorting ----

  sortState(key: SortKey): 'ascending' | 'descending' | 'none' {
    const sort = this.sort();
    return sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  sortIcon(column: ListColumn): string {
    const state = column.sort ? this.sortState(column.sort.key) : 'none';
    return state === 'ascending' ? '▲' : state === 'descending' ? '▼' : '';
  }

  toggleSort(column: ListColumn): void {
    if (!column.sort) return;
    const { key, defaultDir } = column.sort;
    const current = this.sort();
    if (current?.key !== key) this.sort.set({ key, dir: defaultDir });
    else if (current.dir === defaultDir) this.sort.set({ key, dir: defaultDir === 'asc' ? 'desc' : 'asc' });
    else this.sort.set(null);
  }

  private comparator(sort: { key: SortKey; dir: SortDir } | null, milestones: ReadonlyMap<string, Milestone>) {
    if (!sort) {
      // Kanban order: by column, then board order (the Done column by completion time, newest first).
      return (a: Row, b: Row): number =>
        COLUMN_INDEX[a.column] - COLUMN_INDEX[b.column] ||
        (a.column === 'done' ? (b.todo.completedAt ?? 0) - (a.todo.completedAt ?? 0) : a.todo.order - b.todo.order);
    }
    const sign = sort.dir === 'asc' ? 1 : -1;
    const milestoneRank = (row: Row): number => {
      const m = row.todo.milestoneId ? milestones.get(row.todo.milestoneId) : undefined;
      return m ? m.order : Number.POSITIVE_INFINITY;
    };
    const fallback = (a: Row, b: Row): number => a.todo.order - b.todo.order;
    // Empty dates sort last whichever way the column is sorted.
    const byDate = (a: string | undefined, b: string | undefined): number | null => {
      if (!a && !b) return null;
      if (!a) return 1;
      if (!b) return -1;
      return a < b ? -sign : a > b ? sign : null;
    };
    return (a: Row, b: Row): number => {
      let result: number | null = 0;
      switch (sort.key) {
        case 'title':
          result = sign * a.todo.title.localeCompare(b.todo.title);
          break;
        case 'status':
          result = sign * (COLUMN_INDEX[a.column] - COLUMN_INDEX[b.column]);
          break;
        case 'milestone': {
          const [x, y] = [milestoneRank(a), milestoneRank(b)];
          result = x === y ? 0 : x === Number.POSITIVE_INFINITY ? 1 : y === Number.POSITIVE_INFINITY ? -1 : sign * (x - y);
          break;
        }
        // Priority ranks run high = 0, so the default (descending) puts high first by flipping the sign.
        case 'importance':
          result = sign * (PRIORITY_RANK[b.todo.importance] - PRIORITY_RANK[a.todo.importance]);
          break;
        case 'urgency':
          result = sign * (PRIORITY_RANK[b.todo.urgency] - PRIORITY_RANK[a.todo.urgency]);
          break;
        case 'start':
          result = byDate(a.todo.startDate, b.todo.startDate);
          break;
        case 'due':
          result = byDate(a.todo.dueDate, b.todo.dueDate);
          break;
        case 'age':
          result = sign * (a.ageDays - b.ageDays);
          break;
      }
      return result || fallback(a, b);
    };
  }

  // ---- filters ----

  setGrouping(value: Grouping): void {
    this.grouping.set(value);
  }

  toggleShowDone(): void {
    this.view.showDoneTasks.update((on) => !on);
  }

  // ---- selection ----

  isSelected(id: string): boolean {
    return this.selection().has(id);
  }

  toggleSelect(id: string): void {
    const next = new Set(this.selection());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selection.set(next);
  }

  toggleSelectAll(): void {
    this.selection.set(this.allSelected() ? new Set() : new Set(this.visibleIds()));
  }

  clearSelection(): void {
    this.selection.set(new Set());
  }

  // ---- inline edit ----

  startEditTitle(todo: Todo): void {
    this.draftTitle.set(todo.title);
    this.editingId.set(todo.id);
    this.focusLater('.task-list__title-input');
  }

  onDraftInput(event: Event): void {
    this.draftTitle.set((event.target as HTMLInputElement).value);
  }

  commitTitle(todo: Todo): void {
    // A blur after Enter or Escape arrives with editingId already cleared.
    if (this.editingId() !== todo.id) return;
    this.editingId.set(null);
    const title = this.draftTitle().trim();
    if (title && title !== todo.title) this.todosService.updateTodo(todo.id, { title });
  }

  cancelEditTitle(): void {
    this.editingId.set(null);
  }

  setStatus(todo: Todo, event: Event): void {
    const column = (event.target as HTMLSelectElement).value as BoardColumnKey;
    this.todosService.moveOnBoard(todo.id, { column });
  }

  setMilestone(todo: Todo, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.todosService.updateTodo(todo.id, { milestoneId: value || undefined });
  }

  setPriority(todo: Todo, field: 'importance' | 'urgency', value: Priority): void {
    if (todo[field] !== value) this.todosService.updateTodo(todo.id, { [field]: value });
  }

  setDate(todo: Todo, field: 'startDate' | 'dueDate', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const next = isIsoDate(value) ? value : undefined;
    const dates = orderedDates(field === 'startDate' ? next : todo.startDate, field === 'dueDate' ? next : todo.dueDate);
    this.todosService.updateTodo(todo.id, dates);
  }

  setTags(todo: Todo, event: Event): void {
    const tags = (event.target as HTMLInputElement).value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    this.todosService.updateTodo(todo.id, { tags });
  }

  // ---- quick add ----

  startAdd(): void {
    this.adding.set(true);
    this.newTitle.set('');
    this.focusLater('.task-list__add-input');
  }

  addTask(): void {
    const title = this.newTitle().trim();
    if (!title) return;
    const filter = this.milestoneFilter();
    this.todosService.addTodo({
      title,
      importance: 'medium',
      urgency: 'medium',
      tags: [],
      projectId: this.project().id,
      // A specific milestone filter doubles as the target for new tasks, like the Kanban's flat board.
      milestoneId: filter !== 'all' && filter !== NO_MILESTONE && this.milestoneById().has(filter) ? filter : undefined,
    });
    this.newTitle.set('');
  }

  cancelAdd(): void {
    this.adding.set(false);
    this.newTitle.set('');
  }

  // ---- bulk actions ----

  /** Selects reset to their placeholder after applying, so the same choice can be made again. */
  bulkStatus(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const column = select.value as BoardColumnKey;
    select.value = '';
    if (!column) return;
    for (const id of this.selectedIds()) this.todosService.moveOnBoard(id, { column });
  }

  bulkMilestone(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    select.value = '';
    if (!value) return;
    this.todosService.updateMany(this.selectedIds(), { milestoneId: value === NO_MILESTONE ? undefined : value });
  }

  bulkPriority(field: 'importance' | 'urgency', event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value as Priority | '';
    select.value = '';
    if (value) this.todosService.updateMany(this.selectedIds(), { [field]: value });
  }

  bulkDueDate(event: Event): void {
    const input = event.target as HTMLInputElement;
    const ids = this.selectedIds();
    // Keep start <= due on every row; updateMany applies one patch, so rows with a later start move it too.
    const due = isIsoDate(input.value) ? input.value : undefined;
    for (const id of ids) {
      const todo = this.todoById().get(id);
      if (todo) this.todosService.updateTodo(id, orderedDates(todo.startDate, due));
    }
    input.value = '';
  }

  bulkDone(): void {
    this.todosService.updateMany(this.selectedIds(), { done: true });
  }

  bulkDelete(): void {
    const ids = this.selectedIds();
    if (!ids.length) return;
    if (!window.confirm(this.translate.instant('taskList.bulk.deleteConfirm', { count: ids.length }))) return;
    this.todosService.removeMany(ids);
    this.clearSelection();
  }

  private focusLater(selector: string): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus());
  }
}
