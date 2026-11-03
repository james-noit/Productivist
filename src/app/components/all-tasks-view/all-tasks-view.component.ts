import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatIso } from '../../../lib/dates';
import { QUADRANT_BY_KEY, comparePriority } from '../../../lib/eisenhower';
import { objectivesServing } from '../../../lib/flow-graph';
import { normalizeQuery, taskMatches, type PageStats } from '../../../lib/project-cards';
import { FlowService } from '../../../services/flow.service';
import { ProjectsService } from '../../../services/projects.service';
import { RecurrenceService } from '../../../services/recurrence.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import { IconComponent } from '../icon/icon.component';
import { KebabMenuComponent } from '../kebab-menu/kebab-menu.component';
import { ObjectiveChipComponent } from '../objective-chip/objective-chip.component';
import { ProjectsFilterDrawerComponent } from '../projects-filter-drawer/projects-filter-drawer.component';
import { INBOX_FILTER, ProjectsPageState, TASK_DENSITIES, type TaskDensity } from '../projects-view/projects-page.state';
import { TaskBadgesComponent } from '../task-badges/task-badges.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { EisenhowerQuadrant } from '../../../types/eisenhower';
import type { Todo } from '../../../types/todo';

/** Rows rendered before "Show more", and how many each click adds. */
const PAGE_SIZE = 200;

/** One task as a row shows it; everything the template needs is already formatted. */
interface TaskItem {
  kind: 'row';
  todo: Todo;
  projectId: string | null;
  projectName: string | null;
  projectIcon: string | null;
  milestone: string | null;
  due: string | null;
  overdue: boolean;
  start: string | null;
  firstLine: string | null;
  statusKey: string | null;
  served: readonly string[];
}

/** A project heading, shown only while the sort is "project". */
interface GroupItem {
  kind: 'group';
  key: string;
  projectId: string | null;
  name: string | null;
  icon: string | null;
  count: number;
}

type Entry = TaskItem | GroupItem;

interface FilterChip {
  id: string;
  label: string | null;
  labelKey: string | null;
  kind: 'quadrant' | 'due' | 'project' | 'done';
  value?: string;
}

/**
 * The All tasks tab of Tasks and projects: every task whatever its project (Inbox included) as one list in three
 * densities (minimal, compact, extended). The search, the priority quadrants and the due filter are the page's
 * `ProjectsPageState`, shared with the Projects tab; the density, the sort and the project filter are its own
 * (device-local); "show done" is the shared `ViewService.showDoneTasks`. Everything the rows show is built once in
 * the `view` computed (the template calls no methods); at most `PAGE_SIZE` rows are rendered until "Show more".
 * `stats` is the page's single pass, used for the drawer's counts.
 */
@Component({
  selector: 'app-all-tasks-view',
  standalone: true,
  imports: [
    TranslatePipe,
    IconComponent,
    KebabMenuComponent,
    ObjectiveChipComponent,
    ProjectsFilterDrawerComponent,
    TaskBadgesComponent,
    TaskDetailModalComponent,
    UiIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './all-tasks-view.component.html',
  styleUrl: './all-tasks-view.component.css',
})
export class AllTasksViewComponent {
  readonly stats = input.required<PageStats>();

  readonly state = inject(ProjectsPageState);
  private readonly viewService = inject(ViewService);
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly flow = inject(FlowService);
  private readonly settings = inject(SettingsService);
  private readonly recurrences = inject(RecurrenceService);
  private readonly injector = inject(Injector);

  private readonly keepButton = viewChild<ElementRef<HTMLElement>>('keepButton');

  readonly densities: readonly { id: TaskDensity; icon: 'minus' | 'list' | 'grid'; labelKey: string }[] = [
    { id: 'minimal', icon: 'minus', labelKey: 'projects.tasks.density.minimal' },
    { id: 'compact', icon: 'list', labelKey: 'projects.tasks.density.compact' },
    { id: 'extended', icon: 'grid', labelKey: 'projects.tasks.density.extended' },
  ];
  protected readonly allDensities = TASK_DENSITIES;

  readonly detailId = signal<string | null>(null);
  /** The row whose menu shows the project list, and the row asking to confirm a delete. */
  readonly movingId = signal<string | null>(null);
  readonly confirmId = signal<string | null>(null);
  /** Back to one page whenever the search, a filter or the sort changes. */
  readonly limit = linkedSignal({
    source: () => [this.state.normalized(), this.state.due(), this.state.quadrants(), this.state.taskProjects(), this.state.activeTaskSort(), this.viewService.showDoneTasks()],
    computation: () => PAGE_SIZE,
  });

  private readonly today = this.recurrences.today;
  private readonly dateFormat = computed(() => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short' }));
  private readonly projectById = computed(() => new Map(this.projects.projects().map((p) => [p.id, p])));
  private readonly milestoneById = computed(() => new Map(this.projects.milestones().map((m) => [m.id, m.name])));

  /** Task id -> titles of the objectives it serves; built only while the extended density shows them. */
  private readonly servedBy = computed(() => {
    const out = new Map<string, readonly string[]>();
    if (this.state.activeTaskDensity() !== 'extended') return out;
    const objectives = this.flow.objectivesByProject();
    const links = this.flow.linksByProject();
    const milestones = this.projects.milestones();
    const todos = this.todos.todos();
    for (const [projectId, list] of objectives) {
      const projectLinks = links.get(projectId) ?? [];
      if (!projectLinks.length) continue;
      const map = objectivesServing({
        projectId,
        objectives: list,
        links: projectLinks,
        milestones: milestones.filter((m) => m.projectId === projectId),
        todos: todos.filter((t) => t.projectId === projectId),
      });
      for (const [id, titles] of map) out.set(id, titles);
    }
    return out;
  });

  /** The tasks passing the search, the shared filters, the project filter and the done switch, in the chosen sort. */
  private readonly sorted = computed<Todo[]>(() => {
    const query = this.state.normalized();
    const due = this.state.due();
    const quadrants = this.state.quadrants();
    const chosen = this.state.taskProjects();
    const showDone = this.viewService.showDoneTasks();
    const today = this.today();
    const byId = this.projectById();
    const hits = this.todos.todos().filter((t) => {
      if (t.done && !showDone) return false;
      if (chosen.length && !chosen.includes(t.projectId && byId.has(t.projectId) ? t.projectId : INBOX_FILTER)) return false;
      if (!taskMatches(t, '', due, quadrants, today)) return false;
      if (!query) return true;
      const project = t.projectId ? byId.get(t.projectId) : undefined;
      return (
        normalizeQuery(t.title).includes(query) ||
        t.tags.some((tag) => normalizeQuery(tag).includes(query)) ||
        (!!project && normalizeQuery(project.name).includes(query))
      );
    });
    const sort = this.state.activeTaskSort();
    const byDue = (a: Todo, b: Todo) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31');
    switch (sort) {
      case 'priority':
        return hits.sort((a, b) => comparePriority(a, b) || byDue(a, b) || a.order - b.order);
      case 'due':
        return hits.sort((a, b) => byDue(a, b) || comparePriority(a, b) || a.order - b.order);
      case 'title': {
        const collator = new Intl.Collator(this.settings.language(), { sensitivity: 'base', numeric: true });
        return hits.sort((a, b) => collator.compare(a.title, b.title));
      }
      case 'created':
        return hits.sort((a, b) => b.createdAt - a.createdAt);
      case 'project': {
        const rank = new Map(this.projects.sortedProjects().map((p, i) => [p.id, i + 1]));
        const rankOf = (t: Todo) => (t.projectId ? (rank.get(t.projectId) ?? 0) : 0);
        return this.todos.sortTasks(hits).sort((a, b) => rankOf(a) - rankOf(b));
      }
      default:
        return this.todos.sortTasks(hits);
    }
  });

  readonly total = computed(() => this.sorted().length);

  /** What the list renders: the first `limit` tasks as rows, with project headings when sorted by project. */
  readonly view = computed(() => {
    const sorted = this.sorted();
    const shown = sorted.slice(0, this.limit());
    const byId = this.projectById();
    const milestones = this.milestoneById();
    const served = this.servedBy();
    const format = this.dateFormat();
    const today = this.today();
    const grouped = this.state.activeTaskSort() === 'project';
    const counts = new Map<string, number>();
    if (grouped) {
      for (const t of sorted) {
        const key = t.projectId && byId.has(t.projectId) ? t.projectId : INBOX_FILTER;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const entries: Entry[] = [];
    let current: string | null = null;
    for (const todo of shown) {
      const project = todo.projectId ? byId.get(todo.projectId) : undefined;
      const key = project ? project.id : INBOX_FILTER;
      if (grouped && key !== current) {
        current = key;
        entries.push({ kind: 'group', key, projectId: project?.id ?? null, name: project?.name ?? null, icon: project?.icon ?? null, count: counts.get(key) ?? 0 });
      }
      entries.push({
        kind: 'row',
        todo,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        projectIcon: project?.icon ?? null,
        milestone: todo.milestoneId ? (milestones.get(todo.milestoneId) ?? null) : null,
        due: todo.dueDate ? formatIso(format, todo.dueDate) : null,
        overdue: !todo.done && !!todo.dueDate && todo.dueDate < today,
        start: todo.startDate ? formatIso(format, todo.startDate) : null,
        firstLine: todo.description ? (todo.description.split('\n').find((l) => l.trim()) ?? null) : null,
        statusKey: todo.status === 'inProgress' || todo.status === 'review' ? `kanban.columns.${todo.status}` : null,
        served: served.get(todo.id) ?? [],
      });
    }
    return { entries, hidden: Math.max(0, sorted.length - shown.length) };
  });

  readonly noTasks = computed(() => this.todos.todos().length === 0);
  readonly narrowing = computed(() => !!this.state.normalized() || this.state.taskFilterCount() > 0);

  readonly chips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = this.state.quadrants().map((q) => ({ id: `q:${q}`, label: null, labelKey: QUADRANT_BY_KEY[q].labelKey, kind: 'quadrant', value: q }));
    const due = this.state.due();
    if (due) chips.push({ id: `due:${due}`, label: null, labelKey: due === 'week' ? 'projects.filters.dueWeek' : 'projects.filters.dueOverdue', kind: 'due' });
    const byId = this.projectById();
    for (const id of this.state.taskProjects()) {
      chips.push({ id: `p:${id}`, label: byId.get(id)?.name ?? null, labelKey: id === INBOX_FILTER ? 'projects.inbox.title' : null, kind: 'project', value: id });
    }
    if (this.viewService.showDoneTasks()) chips.push({ id: 'done', label: null, labelKey: 'projects.tasks.doneShown', kind: 'done' });
    return chips.filter((c) => c.label !== null || c.labelKey !== null);
  });
  readonly summaryVisible = computed(() => this.chips().length > 0 || this.state.activeTaskSort() !== 'priority');

  readonly movableProjects = this.projects.sortedProjects;

  readonly detailTodo = computed(() => {
    const id = this.detailId();
    return id ? (this.todos.todos().find((t) => t.id === id) ?? null) : null;
  });

  removeChip(chip: FilterChip): void {
    if (chip.kind === 'quadrant') this.state.toggleQuadrant(chip.value as EisenhowerQuadrant);
    else if (chip.kind === 'due') this.state.setDue(null);
    else if (chip.kind === 'project') this.state.toggleTaskProject(chip.value!);
    else this.viewService.showDoneTasks.set(false);
  }

  complete(id: string): void {
    this.todos.toggleDone(id);
  }

  openProject(id: string): void {
    this.viewService.openProject(id);
  }

  moveTo(todoId: string, projectId: string): void {
    this.todos.updateTodo(todoId, { projectId, milestoneId: undefined });
  }

  askDelete(todoId: string): void {
    this.confirmId.set(todoId);
    afterNextRender(() => this.keepButton()?.nativeElement.focus(), { injector: this.injector });
  }

  deleteTask(todoId: string): void {
    this.confirmId.set(null);
    this.todos.removeTodo(todoId);
  }

  showMore(): void {
    this.limit.update((n) => n + PAGE_SIZE);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.state.query()) {
      event.preventDefault();
      event.stopPropagation();
      this.state.query.set('');
    }
  }
}
