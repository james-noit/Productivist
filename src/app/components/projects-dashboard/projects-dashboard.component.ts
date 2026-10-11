import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { trapTab } from '../../../lib/focus-trap';
import { QUADRANTS } from '../../../lib/eisenhower';
import {
  PROJECTS_SORTS,
  NEXT_UP_LIMIT,
  normalizeQuery,
  sortCards,
  taskMatches,
  type PageStats,
  type ProjectCardView,
  type ProjectsSort,
  type TaskFilter,
  type TaskRow,
} from '../../../lib/project-cards';
import { formatIso } from '../../../lib/dates';
import { ProjectsService } from '../../../services/projects.service';
import { RecurrenceService } from '../../../services/recurrence.service';
import { SettingsService } from '../../../services/settings.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import { EditProjectModalComponent } from '../edit-project-modal/edit-project-modal.component';
import { InboxCardComponent } from '../inbox-card/inbox-card.component';
import { NewTaskModalComponent } from '../new-task-modal/new-task-modal.component';
import { ProjectCardComponent } from '../project-card/project-card.component';
import { ProjectFormComponent } from '../project-form/project-form.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { Todo } from '../../../types/todo';

/**
 * The Projects tab of Tasks and projects: stat tiles, a toolbar (search, sort, + Task, + Project), the inbox and one
 * card per project. `stats` is built once by the page shell (one pass over the todos); everything here derives from
 * it with computeds keyed by project id, so a card never scans the task list itself.
 */
@Component({
  selector: 'app-projects-dashboard',
  standalone: true,
  imports: [
    TranslatePipe,
    EditProjectModalComponent,
    InboxCardComponent,
    NewTaskModalComponent,
    ProjectCardComponent,
    ProjectFormComponent,
    TaskDetailModalComponent,
    UiIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-dashboard.component.html',
  styleUrl: './projects-dashboard.component.css',
})
export class ProjectsDashboardComponent {
  readonly stats = input.required<PageStats>();

  readonly view = inject(ViewService);
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly settings = inject(SettingsService);
  private readonly recurrences = inject(RecurrenceService);
  private readonly injector = inject(Injector);

  readonly sorts = PROJECTS_SORTS;
  readonly quadrants = QUADRANTS;

  readonly query = signal('');
  readonly filter = signal<TaskFilter | null>(null);
  /** Persisted; an unknown stored value (another build wrote it) reads as 'manual' through `activeSort`. */
  readonly sort = localStorageSignal<ProjectsSort>('productivist.projectsSort', 'manual');
  readonly activeSort = computed<ProjectsSort>(() => (PROJECTS_SORTS.includes(this.sort()) ? this.sort() : 'manual'));

  readonly creatingProject = signal(false);
  readonly creatingTask = signal(false);
  readonly editingProjectId = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);

  private readonly newProjectPanel = viewChild<ElementRef<HTMLElement>>('newProjectPanel');
  private opener: HTMLElement | null = null;

  private readonly today = this.recurrences.today;
  readonly normalized = computed(() => normalizeQuery(this.query()));
  /** A search or a tile filter is narrowing what shows. */
  readonly filtering = computed(() => !!this.normalized() || this.filter() !== null);

  private readonly dateFormat = computed(() => new Intl.DateTimeFormat(this.settings.language(), { day: 'numeric', month: 'short' }));

  readonly tiles = computed(() => {
    const counts = this.stats().quadrants;
    return this.quadrants.map((q) => ({ key: q.key, css: q.cssKey, labelKey: q.labelKey, hintKey: `${q.labelKey}Hint`, count: counts[q.key] }));
  });

  private toRow(todo: Todo): TaskRow {
    const today = this.today();
    return {
      todo,
      due: todo.dueDate ? formatIso(this.dateFormat(), todo.dueDate) : null,
      overdue: !!todo.dueDate && todo.dueDate < today,
    };
  }

  /** The cards to show, in the chosen sort, with the tasks each one lists. */
  readonly cards = computed<ProjectCardView[]>(() => {
    const { byProject, openByProject } = this.stats();
    const query = this.normalized();
    const filter = this.filter();
    const filtering = this.filtering();
    const today = this.today();
    const cards: ProjectCardView[] = [];
    for (const project of this.projects.sortedProjects()) {
      const stats = byProject.get(project.id);
      if (!stats) continue;
      if (!filtering) {
        cards.push({ project, stats, rows: stats.nextUp.map((t) => this.toRow(t)), matching: false });
        continue;
      }
      const hits = (openByProject.get(project.id) ?? []).filter((t) => taskMatches(t, query, filter, today)).slice(0, NEXT_UP_LIMIT);
      if (hits.length) {
        cards.push({ project, stats, rows: hits.map((t) => this.toRow(t)), matching: true });
      } else if (query && !filter && normalizeQuery(project.name).includes(query)) {
        cards.push({ project, stats, rows: stats.nextUp.map((t) => this.toRow(t)), matching: false });
      }
    }
    return sortCards(cards, this.activeSort(), this.settings.language());
  });

  /** The inbox rows passing the search and tile filter. */
  readonly inboxRows = computed<TaskRow[]>(() => {
    const inbox = this.stats().inbox;
    if (!this.filtering()) return inbox.map((t) => this.toRow(t));
    const query = this.normalized();
    const filter = this.filter();
    const today = this.today();
    return inbox.filter((t) => taskMatches(t, query, filter, today)).map((t) => this.toRow(t));
  });

  readonly showInbox = computed(() => !this.filtering() || this.inboxRows().length > 0);
  readonly noProjects = computed(() => this.projects.projects().length === 0);
  readonly noResults = computed(() => this.filtering() && !this.cards().length && !this.inboxRows().length);

  readonly editingProject = computed(() => {
    const id = this.editingProjectId();
    return id ? (this.projects.projects().find((p) => p.id === id) ?? null) : null;
  });
  readonly detailTodo = computed(() => {
    const id = this.detailId();
    return id ? (this.todos.todos().find((t) => t.id === id) ?? null) : null;
  });

  toggleFilter(filter: TaskFilter): void {
    this.filter.update((current) => (current === filter ? null : filter));
  }

  clearFilters(): void {
    this.query.set('');
    this.filter.set(null);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.query()) {
      event.preventDefault();
      event.stopPropagation();
      this.query.set('');
    }
  }

  openNewProject(): void {
    this.opener = document.activeElement as HTMLElement | null;
    this.creatingProject.set(true);
    afterNextRender(() => this.newProjectPanel()?.nativeElement.querySelector<HTMLElement>('input[name="name"]')?.focus(), { injector: this.injector });
  }

  closeNewProject(): void {
    this.creatingProject.set(false);
    const opener = this.opener;
    this.opener = null;
    queueMicrotask(() => opener?.focus());
  }

  createProject(data: { icon: string; name: string; description: string; notes: string }): void {
    this.projects.addProject(data);
    this.closeNewProject();
  }

  onNewProjectKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeNewProject();
      return;
    }
    const panel = this.newProjectPanel()?.nativeElement;
    if (panel) trapTab(event, panel);
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeNewProject();
  }

  saveProject(id: string, data: { icon: string; name: string; description: string; notes: string }): void {
    this.projects.updateProject(id, data);
    this.editingProjectId.set(null);
  }
}
