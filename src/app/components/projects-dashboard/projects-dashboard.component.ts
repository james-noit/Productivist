import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  NEXT_UP_LIMIT,
  normalizeQuery,
  sortCards,
  taskMatches,
  type PageStats,
  type ProjectCardView,
  type ProjectStats,
  type TaskRow,
} from '../../../lib/project-cards';
import { formatIso } from '../../../lib/dates';
import { QUADRANT_BY_KEY } from '../../../lib/eisenhower';
import { ProjectsService } from '../../../services/projects.service';
import { RecurrenceService } from '../../../services/recurrence.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { EditProjectModalComponent } from '../edit-project-modal/edit-project-modal.component';
import { InboxCardComponent } from '../inbox-card/inbox-card.component';
import { ProjectCardComponent } from '../project-card/project-card.component';
import { ProjectRowComponent } from '../project-row/project-row.component';
import { ProjectsFilterDrawerComponent } from '../projects-filter-drawer/projects-filter-drawer.component';
import { ProjectsPageState, type ProjectsLayout } from '../projects-view/projects-page.state';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { EisenhowerQuadrant } from '../../../types/eisenhower';
import type { Project } from '../../../types/project';
import type { Todo } from '../../../types/todo';

/** One removable chip of the active-filter summary. */
interface FilterChip {
  id: string;
  labelKey: string;
  kind: 'quadrant' | 'due' | 'inbox';
  quadrant?: EisenhowerQuadrant;
}

/**
 * The Projects tab of Tasks and projects: a toolbar (search, the Filters button, the Cards | List toggle), the
 * summary of what is filtered, the inbox, and one card or list row per project. `stats` is built once by the page
 * shell (one pass over the todos); everything here derives from it with computeds keyed by project id, so a card
 * never scans the task list itself. The filters, sort and layout live in the page's `ProjectsPageState`, shared with
 * the drawer and the floating button; creating things is the page's job, not this component's.
 */
@Component({
  selector: 'app-projects-dashboard',
  standalone: true,
  imports: [
    TranslatePipe,
    EditProjectModalComponent,
    InboxCardComponent,
    ProjectCardComponent,
    ProjectRowComponent,
    ProjectsFilterDrawerComponent,
    TaskDetailModalComponent,
    UiIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-dashboard.component.html',
  styleUrl: './projects-dashboard.component.css',
})
export class ProjectsDashboardComponent {
  readonly stats = input.required<PageStats>();

  readonly state = inject(ProjectsPageState);
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly settings = inject(SettingsService);
  private readonly recurrences = inject(RecurrenceService);

  readonly layouts: readonly { id: ProjectsLayout; icon: 'grid' | 'list'; labelKey: string }[] = [
    { id: 'cards', icon: 'grid', labelKey: 'projects.layout.cards' },
    { id: 'list', icon: 'list', labelKey: 'projects.layout.list' },
  ];

  readonly editingProjectId = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);
  /** The rows of the list layout that are expanded to their next-up tasks. */
  readonly expanded = signal<ReadonlySet<string>>(new Set());

  private readonly today = this.recurrences.today;

  private readonly dateFormat = computed(() => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short' }));

  private toRow(todo: Todo): TaskRow {
    const today = this.today();
    return {
      todo,
      due: todo.dueDate ? formatIso(this.dateFormat(), todo.dueDate) : null,
      overdue: !!todo.dueDate && todo.dueDate < today,
    };
  }

  private toView(project: Project, stats: ProjectStats, tasks: readonly Todo[], matching: boolean): ProjectCardView {
    return {
      project,
      stats,
      nextDue: stats.nextDue ? formatIso(this.dateFormat(), stats.nextDue) : null,
      rows: tasks.map((t) => this.toRow(t)),
      matching,
    };
  }

  /** The cards (or rows) to show, in the chosen sort, with the tasks each one lists. */
  readonly cards = computed<ProjectCardView[]>(() => {
    const { byProject, openByProject } = this.stats();
    const query = this.state.normalized();
    const due = this.state.due();
    const quadrants = this.state.quadrants();
    const filtering = this.state.filtering();
    const today = this.today();
    const cards: ProjectCardView[] = [];
    for (const project of this.projects.sortedProjects()) {
      const stats = byProject.get(project.id);
      if (!stats) continue;
      if (!filtering) {
        cards.push(this.toView(project, stats, stats.nextUp, false));
        continue;
      }
      const hits = (openByProject.get(project.id) ?? []).filter((t) => taskMatches(t, query, due, quadrants, today)).slice(0, NEXT_UP_LIMIT);
      if (hits.length) {
        cards.push(this.toView(project, stats, hits, true));
      } else if (query && !due && !quadrants.length && normalizeQuery(project.name).includes(query)) {
        cards.push(this.toView(project, stats, stats.nextUp, false));
      }
    }
    return sortCards(cards, this.state.activeSort(), this.settings.language());
  });

  /** The inbox rows passing the search and the drawer filters. */
  readonly inboxRows = computed<TaskRow[]>(() => {
    const inbox = this.stats().inbox;
    if (!this.state.filtering()) return inbox.map((t) => this.toRow(t));
    const query = this.state.normalized();
    const due = this.state.due();
    const quadrants = this.state.quadrants();
    const today = this.today();
    return inbox.filter((t) => taskMatches(t, query, due, quadrants, today)).map((t) => this.toRow(t));
  });

  readonly showInbox = computed(() => this.state.inboxVisible() && (!this.state.filtering() || this.inboxRows().length > 0));
  readonly noProjects = computed(() => this.projects.projects().length === 0);
  readonly noResults = computed(
    () => this.state.filtering() && !this.cards().length && !(this.state.inboxVisible() && this.inboxRows().length),
  );
  /** Only the search text is narrowing the page, so the empty state offers "Clear search" rather than "Clear filters". */
  readonly searchOnly = computed(() => !!this.state.normalized() && !this.state.quadrants().length && this.state.due() === null);
  /** Projects plus inbox tasks on screen: the drawer's "Show N results". */
  readonly results = computed(() => this.cards().length + (this.state.inboxVisible() ? this.inboxRows().length : 0));

  /** The drawer filters that are on, as chips that remove themselves. */
  readonly chips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = this.state.quadrants().map((q) => ({ id: `q:${q}`, labelKey: QUADRANT_BY_KEY[q].labelKey, kind: 'quadrant', quadrant: q }));
    const due = this.state.due();
    if (due) chips.push({ id: `due:${due}`, labelKey: due === 'week' ? 'projects.filters.dueWeek' : 'projects.filters.dueOverdue', kind: 'due' });
    if (!this.state.inboxVisible()) chips.push({ id: 'inbox', labelKey: 'projects.filters.inboxHidden', kind: 'inbox' });
    return chips;
  });
  readonly summaryVisible = computed(() => this.chips().length > 0 || this.state.activeSort() !== 'manual');

  readonly editingProject = computed(() => {
    const id = this.editingProjectId();
    return id ? (this.projects.projects().find((p) => p.id === id) ?? null) : null;
  });
  readonly detailTodo = computed(() => {
    const id = this.detailId();
    return id ? (this.todos.todos().find((t) => t.id === id) ?? null) : null;
  });

  removeChip(chip: FilterChip): void {
    if (chip.kind === 'quadrant') this.state.toggleQuadrant(chip.quadrant!);
    else if (chip.kind === 'due') this.state.setDue(null);
    else this.state.showInbox.set(true);
  }

  toggleRow(id: string): void {
    this.expanded.update((all) => {
      const next = new Set(all);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.state.query()) {
      event.preventDefault();
      event.stopPropagation();
      this.state.query.set('');
    }
  }

  saveProject(id: string, data: { icon: string; name: string; description: string; notes: string }): void {
    this.projects.updateProject(id, data);
    this.editingProjectId.set(null);
  }
}
