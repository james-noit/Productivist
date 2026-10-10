import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { buildBurnup } from '../../../lib/burnup';
import { addDays, formatIso, todayIso } from '../../../lib/dates';
import { QUADRANTS, classify } from '../../../lib/eisenhower';
import { buildFlowGraph, type Progress } from '../../../lib/flow-graph';
import { HORIZONS } from '../../../lib/flow-rules';
import { columnOf, type BoardColumnKey } from '../../../lib/kanban';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import { MilestoneDatesModalComponent } from '../milestone-dates-modal/milestone-dates-modal.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import type { EisenhowerQuadrant } from '../../../types/eisenhower';
import type { Horizon, ObjectiveStatus } from '../../../types/flow';
import type { Milestone, Project } from '../../../types/project';
import type { Todo } from '../../../types/todo';

const DAY_MS = 86_400_000;

/** Segment order of a milestone's stacked bar, left to right. */
const SEGMENTS: readonly BoardColumnKey[] = ['done', 'review', 'inProgress', 'todo'];

/** Age buckets of open tasks in days: [key, label key, first day, last day (exclusive)]. */
const AGE_BUCKETS: readonly { key: string; labelKey: string; from: number; to: number }[] = [
  { key: 'week', labelKey: 'overview.age.week', from: 0, to: 7 },
  { key: 'month', labelKey: 'overview.age.month', from: 7, to: 30 },
  { key: 'quarter', labelKey: 'overview.age.quarter', from: 30, to: 90 },
  { key: 'older', labelKey: 'overview.age.older', from: 90, to: Infinity },
];

const OLDEST_COUNT = 5;

interface MilestoneRow {
  key: string;
  /** Null for the "No milestone" row. */
  milestone: Milestone | null;
  total: number;
  done: number;
  segments: { column: BoardColumnKey; count: number; percent: number }[];
  due: string | null;
  overdue: boolean;
  counts: Record<BoardColumnKey, number>;
}

interface ObjectiveRow {
  id: string;
  title: string;
  status: ObjectiveStatus;
  progress: Progress;
  /** Formatted target date, null when none. */
  target: string | null;
  overdue: boolean;
}

interface Chart {
  paths: { scope: string; done: string; doneArea: string };
  xTicks: { x: number; label: string }[];
  yTicks: { y: number; value: number }[];
  /** Plot rectangle, for the axes. */
  box: { left: number; right: number; top: number; bottom: number };
  summary: string;
}

const W = 600;
const H = 240;
const MARGIN = { left: 34, right: 12, top: 12, bottom: 26 };

@Component({
  selector: 'app-project-overview',
  standalone: true,
  imports: [TranslatePipe, TaskDetailModalComponent, MilestoneDatesModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-overview.component.html',
  styleUrl: './project-overview.component.css',
})
export class ProjectOverviewComponent {
  private readonly todosService = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly settings = inject(SettingsService);
  private readonly flow = inject(FlowService);
  private readonly view = inject(ViewService);

  readonly project = input.required<Project>();

  readonly quadrants = QUADRANTS;
  readonly chartSize = { width: W, height: H };
  readonly detailId = signal<string | null>(null);

  private readonly shortDate = computed(() => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short' }));
  private readonly shortMonthYear = computed(() => new Intl.DateTimeFormat(this.settings.language(), { month: 'short', year: 'numeric' }));

  private readonly projectTodos = computed(() => {
    const id = this.project().id;
    return this.todosService.todos().filter((t) => t.projectId === id);
  });

  /** Every number on the page, from one pass over the project's todos. */
  readonly stats = computed(() => {
    const todos = this.projectTodos();
    const milestones = this.projects
      .milestones()
      .filter((m) => m.projectId === this.project().id)
      .sort((a, b) => a.order - b.order);
    const today = todayIso();
    const now = Date.now();
    const format = this.shortDate();

    const columns: Record<BoardColumnKey, number> = { todo: 0, inProgress: 0, review: 0, done: 0 };
    const quadrantCounts: Record<EisenhowerQuadrant, number> = { doFirst: 0, schedule: 0, delegate: 0, eliminate: 0 };
    const ageCounts = AGE_BUCKETS.map(() => 0);
    const open: Todo[] = [];
    const perMilestone = new Map<string, Record<BoardColumnKey, number>>();
    const emptyCounts = (): Record<BoardColumnKey, number> => ({ todo: 0, inProgress: 0, review: 0, done: 0 });
    for (const m of milestones) perMilestone.set(m.id, emptyCounts());
    const noMilestone = emptyCounts();
    let overdue = 0;

    for (const todo of todos) {
      const column = columnOf(todo);
      columns[column]++;
      const bucket = (todo.milestoneId ? perMilestone.get(todo.milestoneId) : undefined) ?? noMilestone;
      bucket[column]++;
      if (todo.done) continue;
      open.push(todo);
      quadrantCounts[classify(todo)]++;
      const age = Math.max(0, Math.floor((now - todo.createdAt) / DAY_MS));
      ageCounts[AGE_BUCKETS.findIndex((b) => age >= b.from && age < b.to)]++;
      if (todo.dueDate && todo.dueDate < today) overdue++;
    }

    const makeRow = (key: string, milestone: Milestone | null, counts: Record<BoardColumnKey, number>): MilestoneRow => {
      const total = counts.todo + counts.inProgress + counts.review + counts.done;
      const due = milestone?.dueDate ?? null;
      return {
        key,
        milestone,
        total,
        done: counts.done,
        counts,
        segments: SEGMENTS.map((column) => ({ column, count: counts[column], percent: total ? (counts[column] / total) * 100 : 0 })),
        due: due ? formatIso(format, due) : null,
        overdue: !!due && due < today && total > counts.done,
      };
    };
    const rows = milestones.map((m) => makeRow(m.id, m, perMilestone.get(m.id)!));
    if (noMilestone.todo + noMilestone.inProgress + noMilestone.review + noMilestone.done) {
      rows.push(makeRow('__none__', null, noMilestone));
    }

    const openTotal = open.length;
    const maxAge = Math.max(1, ...ageCounts);
    const oldest = open
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, OLDEST_COUNT)
      .map((todo) => ({ todo, days: Math.max(0, Math.floor((now - todo.createdAt) / DAY_MS)) }));

    return {
      total: todos.length,
      open: openTotal,
      columns,
      overdue,
      percent: todos.length ? Math.round((columns.done / todos.length) * 100) : 0,
      rows,
      quadrants: QUADRANTS.map((q) => ({
        key: q.key,
        cssKey: q.cssKey,
        labelKey: q.labelKey,
        count: quadrantCounts[q.key],
        percent: openTotal ? Math.round((quadrantCounts[q.key] / openTotal) * 100) : 0,
      })),
      ages: AGE_BUCKETS.map((b, i) => ({
        key: b.key,
        labelKey: b.labelKey,
        count: ageCounts[i],
        width: (ageCounts[i] / maxAge) * 100,
      })),
      oldest,
      chart: this.buildChart(todos, today, columns.done),
    };
  });

  /** The project's objectives grouped by horizon (shortest first) with the progress rolled up from their linked work. */
  readonly objectiveGroups = computed(() => {
    const projectId = this.project().id;
    const objectives = this.flow.objectivesByProject().get(projectId) ?? [];
    if (!objectives.length) return [];
    const graph = buildFlowGraph({
      projectId,
      objectives,
      links: this.flow.linksByProject().get(projectId) ?? [],
      milestones: this.projects
        .milestones()
        .filter((m) => m.projectId === projectId)
        .sort((a, b) => a.order - b.order),
      todos: this.projectTodos(),
      showDone: true,
    });
    const today = todayIso();
    const format = this.shortDate();
    return HORIZONS.map((horizon: Horizon) => ({
      horizon,
      rows: graph.objectives
        .filter((o) => o.horizon === horizon)
        .map(
          (o): ObjectiveRow => ({
            id: o.id,
            title: o.title,
            status: o.status,
            progress: graph.progress.get(o.id) ?? { done: 0, total: 0, percent: 0 },
            target: o.targetDate ? formatIso(format, o.targetDate) : null,
            overdue: o.status === 'active' && !!o.targetDate && o.targetDate < today,
          }),
        ),
    })).filter((group) => group.rows.length);
  });

  private buildChart(todos: readonly Todo[], today: string, doneCount: number): Chart | null {
    // A flat "completed" line carries no information, so no chart until something is done.
    if (!doneCount) return null;
    const burnup = buildBurnup(todos, today);
    if (!burnup) return null;
    const { points, span, start } = burnup;
    const maxValue = Math.max(1, ...points.map((p) => p.scope));
    const step = Math.ceil(maxValue / 4);
    const yMax = step * Math.ceil(maxValue / step);
    const plotW = W - MARGIN.left - MARGIN.right;
    const plotH = H - MARGIN.top - MARGIN.bottom;
    const x = (day: number) => MARGIN.left + (day / span) * plotW;
    const y = (value: number) => MARGIN.top + (1 - value / yMax) * plotH;
    const line = (pick: (p: (typeof points)[number]) => number) =>
      points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join('');

    const done = line((p) => p.done);
    const last = points[points.length - 1];
    const bottom = (MARGIN.top + plotH).toFixed(1);
    const formatter = span > 330 ? this.shortMonthYear() : this.shortDate();
    const xTicks = [...new Set([0, 1, 2, 3, 4].map((k) => Math.round((k * span) / 4)))].map((day) => ({
      x: x(day),
      label: formatIso(formatter, addDays(start, day)),
    }));
    const yTicks = Array.from({ length: yMax / step + 1 }, (_, i) => ({ y: y(i * step), value: i * step }));
    return {
      paths: {
        scope: line((p) => p.scope),
        done,
        doneArea: `${done}L${x(last.day).toFixed(1)} ${bottom}L${x(0).toFixed(1)} ${bottom}Z`,
      },
      xTicks,
      yTicks,
      box: { left: MARGIN.left, right: W - MARGIN.right, top: MARGIN.top, bottom: MARGIN.top + plotH },
      summary: `${last.done}/${last.scope}`,
    };
  }

  private readonly todoById = computed(() => new Map(this.projectTodos().map((t) => [t.id, t])));
  readonly detailTodo = computed(() => {
    const id = this.detailId();
    return id ? (this.todoById().get(id) ?? null) : null;
  });

  /** Milestone whose dates editor is open. */
  readonly datesId = signal<string | null>(null);
  readonly datesMilestone = computed(() => {
    const id = this.datesId();
    return id ? (this.projects.milestones().find((m) => m.id === id) ?? null) : null;
  });

  openMilestone(row: MilestoneRow): void {
    this.view.openKanbanForMilestone(this.project().id, row.milestone?.id ?? null);
  }

  openFlow(): void {
    this.view.projectPresentation.set('flow');
  }

  openMatrix(): void {
    this.view.projectPresentation.set('matrix');
  }
}
