import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { addDays, diffDays, dueState, formatIso, isIsoDate, orderedDates, startOfMonth, startOfWeek, todayIso, toIso, type DueState } from '../../../lib/dates';
import { capitalizeFirst, endOfMonth, isoWeek } from '../../../lib/calendar-dates';
import { ProjectsService } from '../../../services/projects.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import { MilestoneDatesModalComponent } from '../milestone-dates-modal/milestone-dates-modal.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import type { Milestone, Project } from '../../../types/project';
import type { Todo } from '../../../types/todo';

type Zoom = 'weeks' | 'months' | 'quarters';

const ZOOMS: readonly Zoom[] = ['weeks', 'months', 'quarters'];
/** Pixel width of one day per zoom level. */
const DAY_PX: Record<Zoom, number> = { weeks: 28, months: 8, quarters: 3 };
const NO_MILESTONE = '__none__';
/** Padding around the dated range, and how far a start-only bar fades out past today, in days. */
const PAD_DAYS = 14;
const MIN_BAR_PX = 6;
/** A bar shows its done/total label only when it is at least this wide. */
const LABEL_MIN_PX = 56;
/** Pointer travel before a press on a bar becomes a drag instead of a click. */
const DRAG_THRESHOLD_PX = 4;

interface HeaderCell {
  key: string;
  left: number;
  width: number;
  /** Month cells: the formatted name. Week cells: empty (see `number`). */
  label: string;
  number: number;
}

interface Bar {
  /** `range` = start to due, `point` = a due-only diamond, `open` = start only, running to today and fading out. */
  kind: 'range' | 'point' | 'open';
  left: number;
  width: number;
  /** Faded extension after an `open` bar. */
  tail: number;
  showLabel: boolean;
}

interface RangeText {
  key: string;
  params: { start?: string; due?: string; date?: string };
}

interface MilestoneLine {
  kind: 'milestone';
  key: string;
  /** Null for the "No milestone" group. */
  milestone: Milestone | null;
  total: number;
  done: number;
  percent: number;
  overdue: boolean;
  bar: Bar | null;
  range: RangeText | null;
  taskCount: number;
  expanded: boolean;
}

interface TaskLine {
  kind: 'task';
  key: string;
  todo: Todo;
  mark: { kind: 'bar' | 'dot'; left: number; width: number } | null;
  range: RangeText | null;
  state: DueState;
}

type Line = MilestoneLine | TaskLine;

interface UnscheduledMilestone {
  milestone: Milestone;
  total: number;
  done: number;
}

interface Layout {
  width: number;
  months: HeaderCell[];
  weeks: HeaderCell[];
  /** x of the today line, or null when today is outside the visible range. */
  todayX: number | null;
  lines: Line[];
  unscheduled: UnscheduledMilestone[];
}

interface Group {
  total: number;
  done: number;
  tasks: Todo[];
}

/**
 * Timeline of a project's milestones (bars from start to due, filled by progress) with each milestone
 * expandable to its dated tasks. One computed lays everything out in pixels; the template only reads it.
 */
@Component({
  selector: 'app-project-roadmap',
  standalone: true,
  imports: [TranslatePipe, MilestoneDatesModalComponent, TaskDetailModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-roadmap.component.html',
  styleUrl: './project-roadmap.component.css',
})
export class ProjectRoadmapComponent {
  private readonly todosService = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly settings = inject(SettingsService);
  readonly view = inject(ViewService);
  private readonly injector = inject(Injector);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly project = input.required<Project>();

  readonly zooms = ZOOMS;
  private readonly storedZoom = localStorageSignal<Zoom>('productivist.roadmapZoom', 'months');
  /** A stored value from another build must not make the pixel width NaN. */
  readonly zoom = computed<Zoom>(() => (ZOOMS.includes(this.storedZoom()) ? this.storedZoom() : 'months'));

  private readonly dayPx = computed(() => DAY_PX[this.zoom()]);

  /** A bar being dragged: horizontal distance moved in px, and whether it moved enough to count as a drag. */
  readonly drag = signal<{ id: string; startX: number; dx: number; moved: boolean } | null>(null);
  /** Set by a finished drag so the click that follows it does not open the dates editor. */
  private suppressClick = false;

  readonly expanded = signal<ReadonlySet<string>>(new Set());
  readonly datesId = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);

  private readonly formats = computed(() => {
    const lang = this.settings.language();
    return {
      monthLong: new Intl.DateTimeFormat(lang, { month: 'long' }),
      monthLongYear: new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }),
      monthShort: new Intl.DateTimeFormat(lang, { month: 'short' }),
      monthShortYear: new Intl.DateTimeFormat(lang, { month: 'short', year: 'numeric' }),
      day: new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }),
    };
  });

  private readonly milestones = computed(() => {
    const id = this.project().id;
    return this.projects
      .milestones()
      .filter((m) => m.projectId === id)
      .sort((a, b) => a.order - b.order);
  });

  readonly layout = computed<Layout>(() => this.buildLayout());

  private readonly todoById = computed(() => new Map(this.todosService.todos().map((t) => [t.id, t])));
  readonly detailTodo = computed(() => {
    const id = this.detailId();
    return id ? (this.todoById().get(id) ?? null) : null;
  });
  readonly datesMilestone = computed(() => {
    const id = this.datesId();
    return id ? (this.milestones().find((m) => m.id === id) ?? null) : null;
  });

  constructor() {
    // Land on today the first time the grid appears.
    afterNextRender(() => this.scrollToToday('auto'), { injector: this.injector });
  }

  private buildLayout(): Layout {
    const projectId = this.project().id;
    const milestones = this.milestones();
    const zoom = this.zoom();
    const px = DAY_PX[zoom];
    const fmt = this.formats();
    const showDone = this.view.showDoneTasks();
    const expanded = this.expanded();
    const today = todayIso();

    // Group the project's tasks by milestone in one pass; progress counts done tasks even when hidden.
    const groups = new Map<string, Group>([[NO_MILESTONE, { total: 0, done: 0, tasks: [] }]]);
    for (const m of milestones) groups.set(m.id, { total: 0, done: 0, tasks: [] });
    for (const todo of this.todosService.todos()) {
      if (todo.projectId !== projectId) continue;
      const group = groups.get(todo.milestoneId ?? '') ?? groups.get(NO_MILESTONE)!;
      group.total++;
      if (todo.done) group.done++;
      if (!todo.done || showDone) group.tasks.push(todo);
    }

    const scheduled: { milestone: Milestone | null; key: string; start?: string; due?: string; group: Group }[] = [];
    const unscheduled: UnscheduledMilestone[] = [];
    for (const m of milestones) {
      const group = groups.get(m.id)!;
      if (!m.startDate && !m.dueDate) {
        unscheduled.push({ milestone: m, total: group.total, done: group.done });
        continue;
      }
      const { startDate, dueDate } = orderedDates(m.startDate, m.dueDate);
      scheduled.push({ milestone: m, key: m.id, start: startDate, due: dueDate, group });
    }
    const loose = groups.get(NO_MILESTONE)!;
    if (loose.tasks.some((t) => t.startDate || t.dueDate)) scheduled.push({ milestone: null, key: NO_MILESTONE, group: loose });

    // Visible range: every date shown, padded; the current quarter when nothing is dated.
    const span: { min: string | null; max: string | null } = { min: null, max: null };
    const include = (iso: string | undefined) => {
      if (!iso || !isIsoDate(iso)) return;
      if (!span.min || iso < span.min) span.min = iso;
      if (!span.max || iso > span.max) span.max = iso;
    };
    for (const entry of scheduled) {
      include(entry.start);
      include(entry.due);
      // A start-only bar runs to today and fades out after it.
      if (entry.start && !entry.due) include(addDays(entry.start > today ? entry.start : today, PAD_DAYS));
      for (const todo of entry.group.tasks) {
        include(todo.startDate);
        include(todo.dueDate);
      }
    }
    let rangeStart: string;
    let rangeEnd: string;
    if (span.min && span.max) {
      rangeStart = startOfMonth(addDays(span.min, -PAD_DAYS));
      rangeEnd = endOfMonth(addDays(span.max, PAD_DAYS));
    } else {
      const now = new Date();
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      rangeStart = toIso(new Date(now.getFullYear(), quarterStart, 1));
      rangeEnd = toIso(new Date(now.getFullYear(), quarterStart + 3, 0));
    }
    const totalDays = diffDays(rangeStart, rangeEnd) + 1;
    const width = totalDays * px;
    const x = (iso: string) => diffDays(rangeStart, iso) * px;

    // Header cells.
    const months: HeaderCell[] = [];
    for (let cur = rangeStart; cur <= rangeEnd; ) {
      const next = addDays(endOfMonth(cur), 1);
      const january = cur.slice(5, 7) === '01';
      const withYear = !months.length || january;
      const long = zoom !== 'quarters';
      const formatter = long ? (withYear ? fmt.monthLongYear : fmt.monthLong) : withYear ? fmt.monthShortYear : fmt.monthShort;
      months.push({ key: cur, left: x(cur), width: diffDays(cur, next) * px, label: capitalizeFirst(formatIso(formatter, cur), this.settings.language()), number: 0 });
      cur = next;
    }
    const weeks: HeaderCell[] = [];
    if (zoom === 'weeks') {
      for (let cur = startOfWeek(rangeStart); cur <= rangeEnd; ) {
        const next = addDays(cur, 7);
        const left = Math.max(0, diffDays(rangeStart, cur));
        const right = Math.min(totalDays, diffDays(rangeStart, next));
        weeks.push({ key: cur, left: left * px, width: (right - left) * px, label: '', number: isoWeek(cur) });
        cur = next;
      }
    }

    const rangeText = (start: string | undefined, due: string | undefined): RangeText | null => {
      if (start && due) return { key: 'roadmap.range', params: { start: formatIso(fmt.day, start), due: formatIso(fmt.day, due) } };
      if (due) return { key: 'roadmap.dueOn', params: { date: formatIso(fmt.day, due) } };
      if (start) return { key: 'roadmap.startOn', params: { date: formatIso(fmt.day, start) } };
      return null;
    };

    const lines: Line[] = [];
    for (const entry of scheduled) {
      const { milestone, key, start, due, group } = entry;
      let bar: Bar | null = null;
      if (start && due) {
        const w = Math.max((diffDays(start, due) + 1) * px, MIN_BAR_PX);
        bar = { kind: 'range', left: x(start), width: w, tail: 0, showLabel: w >= LABEL_MIN_PX };
      } else if (due) {
        bar = { kind: 'point', left: x(due) + px / 2, width: 0, tail: 0, showLabel: false };
      } else if (start) {
        const end = start > today ? start : today;
        const w = Math.max((diffDays(start, end) + 1) * px, MIN_BAR_PX);
        const left = x(start);
        bar = { kind: 'open', left, width: w, tail: Math.max(0, Math.min(PAD_DAYS * px, width - left - w)), showLabel: w >= LABEL_MIN_PX };
      }
      const isExpanded = expanded.has(key);
      lines.push({
        kind: 'milestone',
        key,
        milestone,
        total: group.total,
        done: group.done,
        percent: group.total ? Math.round((group.done / group.total) * 100) : 0,
        overdue: !!due && due < today && group.done < group.total,
        bar,
        range: rangeText(start, due),
        taskCount: group.tasks.length,
        expanded: isExpanded,
      });
      if (!isExpanded) continue;
      const tasks = [...group.tasks].sort(
        (a, b) => (a.startDate ?? a.dueDate ?? '9999-12-31').localeCompare(b.startDate ?? b.dueDate ?? '9999-12-31') || a.order - b.order,
      );
      for (const todo of tasks) {
        const taskDates = orderedDates(todo.startDate, todo.dueDate);
        let mark: TaskLine['mark'] = null;
        if (taskDates.startDate && taskDates.dueDate) {
          mark = { kind: 'bar', left: x(taskDates.startDate), width: Math.max((diffDays(taskDates.startDate, taskDates.dueDate) + 1) * px, MIN_BAR_PX) };
        } else if (taskDates.dueDate ?? taskDates.startDate) {
          mark = { kind: 'dot', left: x((taskDates.dueDate ?? taskDates.startDate)!) + px / 2, width: 0 };
        }
        lines.push({
          kind: 'task',
          key: `${key}|${todo.id}`,
          todo,
          mark,
          range: rangeText(taskDates.startDate, taskDates.dueDate),
          state: todo.dueDate ? dueState(todo.dueDate, todo.done, today) : todo.done ? 'done' : 'later',
        });
      }
    }

    const inRange = today >= rangeStart && today <= rangeEnd;
    return { width, months, weeks, todayX: inRange ? x(today) + px / 2 : null, lines, unscheduled };
  }

  setZoom(zoom: Zoom): void {
    this.storedZoom.set(zoom);
    // The grid is re-laid out at the new scale; keep today in view.
    afterNextRender(() => this.scrollToToday('auto'), { injector: this.injector });
  }

  // ---- dragging a milestone bar ----

  onBarPointerDown(event: PointerEvent, milestone: Milestone): void {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag.set({ id: milestone.id, startX: event.clientX, dx: 0, moved: false });
  }

  onBarPointerMove(event: PointerEvent): void {
    const drag = this.drag();
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    this.drag.set({ ...drag, dx, moved: drag.moved || Math.abs(dx) > DRAG_THRESHOLD_PX });
  }

  /** Ends a drag: a moved bar shifts all its dates by whole days (snapping to the day grid). */
  onBarPointerUp(milestone: Milestone): void {
    const drag = this.drag();
    this.drag.set(null);
    if (!drag?.moved) return;
    // The click that follows a drag arrives right after pointerup; the timer clears the flag if none does.
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false));
    const days = Math.round(drag.dx / this.dayPx());
    if (!days) return;
    const patch: { startDate?: string; dueDate?: string } = {};
    if (milestone.startDate) patch.startDate = addDays(milestone.startDate, days);
    if (milestone.dueDate) patch.dueDate = addDays(milestone.dueDate, days);
    this.projects.updateMilestone(milestone.id, patch);
  }

  onBarPointerCancel(): void {
    this.drag.set(null);
  }

  /** Live horizontal offset of a bar while it is dragged, snapped to the day grid. */
  dragOffset(milestoneId: string): number | null {
    const drag = this.drag();
    return drag?.id === milestoneId && drag.moved ? Math.round(drag.dx / this.dayPx()) * this.dayPx() : null;
  }

  openDates(milestoneId: string): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    this.datesId.set(milestoneId);
  }

  toggleExpanded(key: string): void {
    const next = new Set(this.expanded());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expanded.set(next);
  }

  toggleShowDone(): void {
    this.view.showDoneTasks.update((on) => !on);
  }

  /** Centres the today line in the visible part of the grid (right of the sticky label column). */
  scrollToToday(behavior: ScrollBehavior = 'smooth'): void {
    const scroller = this.scroller()?.nativeElement;
    const marker = scroller?.querySelector<HTMLElement>('.project-roadmap__today');
    if (!scroller || !marker) return;
    const label = scroller.querySelector<HTMLElement>('.project-roadmap__label');
    const labelWidth = label?.offsetWidth ?? 0;
    const markerX = marker.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    const visible = scroller.clientWidth - labelWidth;
    scroller.scrollTo({ left: Math.max(0, markerX - labelWidth - visible / 2), behavior });
  }
}
