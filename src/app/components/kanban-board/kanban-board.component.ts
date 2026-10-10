import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { BOARD_COLUMNS, columnOf, type BoardColumnKey } from '../../../lib/kanban';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { KanbanCardComponent } from '../kanban-card/kanban-card.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import type { Milestone, Project } from '../../../types/project';
import type { Todo } from '../../../types/todo';

type Swimlanes = 'milestones' | 'none';

/** Most recently completed cards shown per Done cell until "Show all" is toggled. */
const DONE_LIMIT = 20;
const NO_MILESTONE_LANE = '__none__';
const FLAT_LANE = '__all__';

interface Lane {
  key: string;
  /** Null for the flat board and for the "No milestone" lane. */
  milestone: Milestone | null;
  columns: Record<BoardColumnKey, Todo[]>;
  /** Cards in the Done cell beyond the cap, hidden until "Show all". */
  hiddenDone: number;
  total: number;
}

interface Board {
  lanes: Lane[];
  totals: Record<BoardColumnKey, number>;
  totalTasks: number;
}

const emptyColumns = (): Record<BoardColumnKey, Todo[]> => ({ todo: [], inProgress: [], review: [], done: [] });

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [FormsModule, TranslatePipe, KanbanCardComponent, TaskDetailModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kanban-board.component.html',
  styleUrl: './kanban-board.component.css',
})
export class KanbanBoardComponent {
  private readonly todosService = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly project = input.required<Project>();

  readonly columns = BOARD_COLUMNS;
  readonly swimlanes = localStorageSignal<Swimlanes>('productivist.kanbanSwimlanes', 'milestones');
  private readonly filters = localStorageSignal<Record<string, string | null>>('productivist.kanbanMilestoneFilter', {});

  readonly search = signal('');
  readonly collapsed = signal<ReadonlySet<string>>(new Set());
  readonly showAllDone = signal(false);
  readonly dragOverKey = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);
  readonly addingMilestone = signal(false);
  readonly newMilestoneName = signal('');
  readonly addingLane = signal<string | null>(null);
  readonly newTaskTitle = signal('');

  readonly milestones = computed(() => {
    const id = this.project().id;
    return this.projects
      .milestones()
      .filter((m) => m.projectId === id)
      .sort((a, b) => a.order - b.order);
  });

  /** The stored filter, ignoring a milestone that no longer exists. */
  readonly milestoneFilter = computed(() => {
    const stored = this.filters()[this.project().id] ?? null;
    return stored && this.milestones().some((m) => m.id === stored) ? stored : null;
  });

  private readonly milestoneNames = computed(() => new Map(this.milestones().map((m) => [m.id, m.name])));

  /** Whole board in one pass over the project's todos; the template only reads it. */
  readonly board = computed<Board>(() => {
    const projectId = this.project().id;
    const milestones = this.milestones();
    const filter = this.milestoneFilter();
    const lanesOn = this.swimlanes() === 'milestones';
    const query = this.search().trim().toLowerCase();
    const showAllDone = this.showAllDone();
    const known = new Set(milestones.map((m) => m.id));

    const lanes: Lane[] = [];
    const byKey = new Map<string, Lane>();
    const addLane = (key: string, milestone: Milestone | null) => {
      const lane: Lane = { key, milestone, columns: emptyColumns(), hiddenDone: 0, total: 0 };
      lanes.push(lane);
      byKey.set(key, lane);
    };
    if (lanesOn) {
      for (const m of milestones) if (!filter || filter === m.id) addLane(m.id, m);
      if (!filter) addLane(NO_MILESTONE_LANE, null);
    } else {
      addLane(FLAT_LANE, null);
    }

    const totals: Record<BoardColumnKey, number> = { todo: 0, inProgress: 0, review: 0, done: 0 };
    let totalTasks = 0;
    for (const todo of this.todosService.todos()) {
      if (todo.projectId !== projectId) continue;
      const milestoneId = todo.milestoneId && known.has(todo.milestoneId) ? todo.milestoneId : null;
      if (filter && milestoneId !== filter) continue;
      if (query && !todo.title.toLowerCase().includes(query) && !todo.tags.some((t) => t.toLowerCase().includes(query))) {
        continue;
      }
      const lane = byKey.get(lanesOn ? (milestoneId ?? NO_MILESTONE_LANE) : FLAT_LANE);
      if (!lane) continue;
      const column = columnOf(todo);
      lane.columns[column].push(todo);
      lane.total++;
      totals[column]++;
      totalTasks++;
    }
    for (const lane of lanes) {
      for (const col of ['todo', 'inProgress', 'review'] as const) lane.columns[col].sort((a, b) => a.order - b.order);
      const done = lane.columns.done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
      if (!showAllDone && done.length > DONE_LIMIT) {
        lane.hiddenDone = done.length - DONE_LIMIT;
        lane.columns.done = done.slice(0, DONE_LIMIT);
      }
    }
    return { lanes, totals, totalTasks };
  });

  readonly hiddenDoneTotal = computed(() => this.board().lanes.reduce((n, l) => n + l.hiddenDone, 0));
  /** Only meaningful while the cap is lifted: whether there is anything to collapse again. */
  readonly doneOverLimit = computed(() => this.showAllDone() && this.board().lanes.some((l) => l.columns.done.length > DONE_LIMIT));

  /** Whether the project has any task at all, ignoring search and filter, for the empty hint. */
  readonly projectHasTasks = computed(() => {
    const id = this.project().id;
    return this.todosService.todos().some((t) => t.projectId === id);
  });

  private readonly todoById = computed(() => new Map(this.todosService.todos().map((t) => [t.id, t])));
  readonly detailTodo = computed(() => {
    const id = this.detailId();
    return id ? (this.todoById().get(id) ?? null) : null;
  });

  /** Milestone names for the flat board's card chips. */
  milestoneNameOf(todo: Todo): string | null {
    if (this.swimlanes() === 'milestones' || !todo.milestoneId) return null;
    return this.milestoneNames().get(todo.milestoneId) ?? null;
  }

  setSwimlanes(value: Swimlanes): void {
    this.swimlanes.set(value);
  }

  setFilter(milestoneId: string | null): void {
    this.filters.update((all) => ({ ...all, [this.project().id]: milestoneId }));
  }

  toggleLane(key: string): void {
    const next = new Set(this.collapsed());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.collapsed.set(next);
  }

  // ---- milestones ----

  startAddMilestone(): void {
    this.addingMilestone.set(true);
    this.focusLater('.kanban-board__milestone-input');
  }

  addMilestone(): void {
    const name = this.newMilestoneName().trim();
    if (name) this.projects.addMilestone(this.project().id, name);
    this.cancelAddMilestone();
  }

  cancelAddMilestone(): void {
    this.newMilestoneName.set('');
    this.addingMilestone.set(false);
  }

  // ---- quick add ----

  startAddTask(laneKey: string): void {
    this.addingLane.set(laneKey);
    this.newTaskTitle.set('');
    this.focusLater('.kanban-board__quick-input');
  }

  addTask(lane: Lane): void {
    const title = this.newTaskTitle().trim();
    if (!title) return;
    // On the flat board a milestone filter doubles as the target for new tasks.
    const milestoneId = lane.milestone?.id ?? (this.swimlanes() === 'none' ? (this.milestoneFilter() ?? undefined) : undefined);
    this.todosService.addTodo({
      title,
      importance: 'medium',
      urgency: 'medium',
      tags: [],
      projectId: this.project().id,
      milestoneId,
    });
    this.newTaskTitle.set('');
  }

  cancelAddTask(): void {
    this.newTaskTitle.set('');
    this.addingLane.set(null);
  }

  // ---- drag & drop ----

  cellKey(lane: Lane, column: BoardColumnKey): string {
    return `${lane.key}|${column}`;
  }

  onCellDragOver(event: DragEvent, lane: Lane, column: BoardColumnKey): void {
    if (!this.todosService.draggedId()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverKey.set(this.cellKey(lane, column));
  }

  onCellDragLeave(event: DragEvent, lane: Lane, column: BoardColumnKey): void {
    const cell = event.currentTarget as HTMLElement;
    if (event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return;
    if (this.dragOverKey() === this.cellKey(lane, column)) this.dragOverKey.set(null);
  }

  onCellDrop(event: DragEvent, lane: Lane, column: BoardColumnKey, beforeId: string | null = null): void {
    const id = this.todosService.draggedId();
    this.dragOverKey.set(null);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    this.todosService.endDrag();
    if (beforeId === id) return;
    this.todosService.moveOnBoard(id, {
      column,
      milestoneId: this.swimlanes() === 'milestones' ? (lane.milestone?.id ?? null) : undefined,
      beforeId,
    });
  }

  // ---- card menu ----

  moveColumn(todo: Todo, column: BoardColumnKey): void {
    this.todosService.moveOnBoard(todo.id, { column });
  }

  moveMilestone(todo: Todo, milestoneId: string | null): void {
    this.todosService.moveOnBoard(todo.id, { column: columnOf(todo), milestoneId });
  }

  private focusLater(selector: string): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus());
  }
}
