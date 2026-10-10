import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { addDays, diffDays, dueState, formatIso, monthGrid, parseIso, startOfMonth, startOfWeek, todayIso, toIso, type DueState } from '../../../lib/dates';
import { capitalizeFirst } from '../../../lib/calendar-dates';
import { ProjectsService } from '../../../services/projects.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import { MilestoneDatesModalComponent } from '../milestone-dates-modal/milestone-dates-modal.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import type { Milestone, Project } from '../../../types/project';
import type { Todo } from '../../../types/todo';

type Mode = 'month' | 'week';

const MODES: readonly Mode[] = ['month', 'week'];
/** Tasks listed in a month cell before "+N more". */
const MONTH_CELL_LIMIT = 3;

interface Cell {
  iso: string;
  /** Day of the month, for the cell header. */
  day: number;
  inRange: boolean;
  today: boolean;
  /** Every task due this day. */
  tasks: Todo[];
  /** The part of `tasks` the cell lists; the rest sits behind "+N more". */
  shown: Todo[];
  more: number;
  milestones: Milestone[];
}

/**
 * A project's tasks on a month or week grid by due date. Tasks are scheduled by dragging them onto a day
 * (native HTML5 drag & drop, like the Kanban board) or, for keyboard and touch, through the chip's own
 * date field. The Unscheduled panel lists open tasks without a due date.
 */
@Component({
  selector: 'app-project-calendar',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, TranslatePipe, MilestoneDatesModalComponent, TaskDetailModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-calendar.component.html',
  styleUrl: './project-calendar.component.css',
})
export class ProjectCalendarComponent {
  private readonly todosService = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly settings = inject(SettingsService);
  readonly view = inject(ViewService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly project = input.required<Project>();

  readonly modes = MODES;
  readonly draggedId = this.todosService.draggedId;
  readonly unscheduledKey = '__unscheduled__';
  private readonly storedMode = localStorageSignal<Mode>('productivist.calendarMode', 'month');
  readonly mode = computed<Mode>(() => (MODES.includes(this.storedMode()) ? this.storedMode() : 'month'));

  /** Any day inside the month (or week) on screen. */
  readonly anchor = signal(todayIso());
  readonly detailId = signal<string | null>(null);
  readonly datesId = signal<string | null>(null);
  /** Day whose full task list is open in the "+N more" popover. */
  readonly expandedDay = signal<string | null>(null);
  /** Task whose date field (the chip's ⋯ menu) is open. */
  readonly dateMenuId = signal<string | null>(null);
  readonly dragOverIso = signal<string | null>(null);
  readonly addingIso = signal<string | null>(null);
  readonly newTitle = signal('');

  private readonly formats = computed(() => {
    const lang = this.settings.language();
    return {
      monthYear: new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }),
      range: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }),
      weekday: new Intl.DateTimeFormat(lang, { weekday: 'short' }),
      day: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' }),
    };
  });

  /** Heading of the visible period. */
  readonly title = computed(() => {
    const anchor = this.anchor();
    const fmt = this.formats();
    if (this.mode() === 'month') return capitalizeFirst(formatIso(fmt.monthYear, anchor), this.settings.language());
    const first = startOfWeek(anchor);
    const a = parseIso(first);
    const b = parseIso(addDays(first, 6));
    return a && b ? fmt.range.formatRange(a, b) : '';
  });

  readonly weekdays = computed(() => {
    const first = startOfWeek(this.anchor());
    const fmt = this.formats().weekday;
    return Array.from({ length: 7 }, (_, i) => formatIso(fmt, addDays(first, i)));
  });

  private readonly projectTodos = computed(() => {
    const id = this.project().id;
    return this.todosService.todos().filter((t) => t.projectId === id);
  });

  private readonly milestones = computed(() => {
    const id = this.project().id;
    return this.projects.milestones().filter((m) => m.projectId === id);
  });

  /** The visible cells, with each day's tasks grouped in a single pass over the project's todos. */
  readonly cells = computed<Cell[]>(() => {
    const anchor = this.anchor();
    const month = this.mode() === 'month';
    const parsed = parseIso(anchor);
    const days = month && parsed
      ? monthGrid(parsed.getFullYear(), parsed.getMonth())
      : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    const first = days[0];
    const last = days[days.length - 1];
    const showDone = this.view.showDoneTasks();
    const monthStart = startOfMonth(anchor);

    const tasksByDay = new Map<string, Todo[]>();
    for (const todo of this.projectTodos()) {
      const due = todo.dueDate;
      if (!due || due < first || due > last || (todo.done && !showDone)) continue;
      const list = tasksByDay.get(due);
      if (list) list.push(todo);
      else tasksByDay.set(due, [todo]);
    }
    const milestonesByDay = new Map<string, Milestone[]>();
    for (const milestone of this.milestones()) {
      const due = milestone.dueDate;
      if (!due || due < first || due > last) continue;
      const list = milestonesByDay.get(due);
      if (list) list.push(milestone);
      else milestonesByDay.set(due, [milestone]);
    }

    const today = todayIso();
    return days.map((iso) => {
      const tasks = (tasksByDay.get(iso) ?? []).sort((a, b) => a.order - b.order);
      const limit = month ? MONTH_CELL_LIMIT : tasks.length;
      return {
        iso,
        day: Number(iso.slice(8, 10)),
        inRange: !month || startOfMonth(iso) === monthStart,
        today: iso === today,
        tasks,
        shown: tasks.slice(0, limit),
        more: Math.max(0, tasks.length - limit),
        milestones: milestonesByDay.get(iso) ?? [],
      };
    });
  });

  /** Open tasks that no day claims yet. */
  readonly unscheduled = computed(() =>
    this.projectTodos()
      .filter((t) => !t.done && !t.dueDate)
      .sort((a, b) => a.order - b.order),
  );

  private readonly todoById = computed(() => new Map(this.todosService.todos().map((t) => [t.id, t])));
  readonly detailTodo = computed(() => {
    const id = this.detailId();
    return id ? (this.todoById().get(id) ?? null) : null;
  });
  readonly datesMilestone = computed(() => {
    const id = this.datesId();
    return id ? (this.milestones().find((m) => m.id === id) ?? null) : null;
  });
  readonly expandedCell = computed(() => {
    const iso = this.expandedDay();
    return iso ? (this.cells().find((c) => c.iso === iso) ?? null) : null;
  });

  // ---- navigation ----

  setMode(mode: Mode): void {
    this.storedMode.set(mode);
    this.expandedDay.set(null);
  }

  step(direction: 1 | -1): void {
    const anchor = this.anchor();
    this.expandedDay.set(null);
    if (this.mode() === 'week') {
      this.anchor.set(addDays(anchor, 7 * direction));
      return;
    }
    const date = parseIso(anchor);
    if (date) this.anchor.set(toIso(new Date(date.getFullYear(), date.getMonth() + direction, 1)));
  }

  goToday(): void {
    this.anchor.set(todayIso());
    this.expandedDay.set(null);
  }

  toggleShowDone(): void {
    this.view.showDoneTasks.update((on) => !on);
  }

  // ---- chips ----

  /** Urgency of a chip's due date, for its colour. */
  chipState(todo: Todo): DueState | 'none' {
    return todo.dueDate ? dueState(todo.dueDate, todo.done) : 'none';
  }

  dayLabel(iso: string): string {
    return formatIso(this.formats().day, iso);
  }

  toggleMore(iso: string): void {
    this.expandedDay.update((open) => (open === iso ? null : iso));
  }

  closePopover(event: Event): void {
    // Without this the project view's own Escape handler would also leave the project.
    event.preventDefault();
    this.expandedDay.set(null);
  }

  toggleDateMenu(todo: Todo, event: Event): void {
    event.stopPropagation();
    this.dateMenuId.update((open) => (open === todo.id ? null : todo.id));
  }

  closeDateMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.dateMenuId.set(null);
  }

  /** Closes the date menu when focus leaves its chip. */
  onChipFocusOut(event: FocusEvent, chip: HTMLElement): void {
    if (event.relatedTarget instanceof Node && chip.contains(event.relatedTarget)) return;
    this.dateMenuId.set(null);
  }

  onDateInput(todo: Todo, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dateMenuId.set(null);
    if (value) this.setDue(todo, value);
    else this.todosService.updateTodo(todo.id, { dueDate: undefined });
  }

  clearDate(todo: Todo): void {
    this.dateMenuId.set(null);
    this.todosService.updateTodo(todo.id, { dueDate: undefined });
  }

  /** Sets a due day. A start date moves with it (keeping the span), or is pulled back when there was no due date. */
  private setDue(todo: Todo, iso: string): void {
    if (todo.dueDate === iso) return;
    const patch: { dueDate: string; startDate?: string } = { dueDate: iso };
    if (todo.startDate) {
      patch.startDate = todo.dueDate ? addDays(todo.startDate, diffDays(todo.dueDate, iso)) : todo.startDate > iso ? iso : todo.startDate;
    }
    this.todosService.updateTodo(todo.id, patch);
  }

  // ---- drag & drop ----

  onChipDragStart(event: DragEvent, todo: Todo): void {
    this.dateMenuId.set(null);
    // Firefox starts no drag without data.
    event.dataTransfer?.setData('text/plain', todo.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.todosService.startDrag(todo.id);
  }

  onChipDragEnd(): void {
    this.todosService.endDrag();
    this.dragOverIso.set(null);
  }

  /** `key` is a day's ISO date, or `unscheduledKey` for the side panel. */
  onDragOver(event: DragEvent, key: string): void {
    if (!this.todosService.draggedId()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverIso.set(key);
  }

  onDragLeave(event: DragEvent, key: string): void {
    const target = event.currentTarget as HTMLElement;
    if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
    if (this.dragOverIso() === key) this.dragOverIso.set(null);
  }

  onDropOnDay(event: DragEvent, iso: string): void {
    const todo = this.takeDragged(event);
    if (todo) this.setDue(todo, iso);
  }

  onDropOnUnscheduled(event: DragEvent): void {
    const todo = this.takeDragged(event);
    if (todo?.dueDate) this.todosService.updateTodo(todo.id, { dueDate: undefined });
  }

  private takeDragged(event: DragEvent): Todo | null {
    const id = this.todosService.draggedId();
    this.dragOverIso.set(null);
    if (!id) return null;
    event.preventDefault();
    event.stopPropagation();
    this.todosService.endDrag();
    return this.todoById().get(id) ?? null;
  }

  // ---- quick add ----

  startAdd(iso: string): void {
    this.addingIso.set(iso);
    this.newTitle.set('');
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.project-calendar__add-input')?.focus());
  }

  addTask(iso: string): void {
    const title = this.newTitle().trim();
    if (!title) return;
    this.todosService.addTodo({ title, importance: 'medium', urgency: 'medium', tags: [], projectId: this.project().id, dueDate: iso });
    this.newTitle.set('');
  }

  cancelAdd(event?: Event): void {
    event?.preventDefault();
    this.newTitle.set('');
    this.addingIso.set(null);
  }
}
