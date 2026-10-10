import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { TodosService } from '../../../services/todos.service';
import { ProjectsService } from '../../../services/projects.service';
import { ViewService } from '../../../services/view.service';
import { EisenhowerCardComponent } from '../eisenhower-card/eisenhower-card.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { NewTaskModalComponent } from '../new-task-modal/new-task-modal.component';
import { IconComponent } from '../icon/icon.component';
import { QUADRANTS, QUADRANT_BY_KEY, classify, type QuadrantDef } from '../../../lib/eisenhower';
import type { Todo } from '../../../types/todo';
import type { EisenhowerQuadrant, EisenhowerViewMode } from '../../../types/eisenhower';

interface QuadrantSection extends QuadrantDef {
  todos: Todo[];
  groups: ProjectGroup[];
}

interface ProjectGroup {
  key: string;
  name: string;
  icon?: string;
  todos: Todo[];
}

@Component({
  selector: 'app-eisenhower-view',
  standalone: true,
  imports: [TranslatePipe, EisenhowerCardComponent, TaskDetailModalComponent, NewTaskModalComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './eisenhower-view.component.html',
  styleUrl: './eisenhower-view.component.css',
})
export class EisenhowerViewComponent {
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly translate = inject(TranslateService);
  private readonly view = inject(ViewService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // The Projects tab's summary badges ask for a quadrant to be brought into view. The matrix is
    // always freshly mounted when they do, so consuming the request once after first render is enough.
    afterNextRender(() => {
      const key = this.view.focusQuadrant();
      if (!key) return;
      this.view.focusQuadrant.set(null);
      const section = this.host.nativeElement.querySelector<HTMLElement>(`[data-quadrant="${key}"]`);
      if (!section) return;
      section.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      section.classList.add('eisenhower-quadrant--flash');
      section.addEventListener('animationend', () => section.classList.remove('eisenhower-quadrant--flash'), { once: true });
    });
  }

  /** Limits the matrix to one project (the project detail's Matrix presentation); null shows every task. */
  readonly projectId = input<string | null>(null);

  readonly viewMode = localStorageSignal<EisenhowerViewMode>('productivist.eisenhowerViewMode', 'detailed');

  readonly activeTodos = computed(() => {
    const projectId = this.projectId();
    return this.todos.sortTasks(this.todos.todos().filter((todo) => !todo.done && (!projectId || todo.projectId === projectId)));
  });

  /**
   * Every quadrant with its tasks already split and grouped by project. The template used
   * to call `groupByProject(listFor(q.key))` inline, which rebuilt a Map and one array per
   * project for all four quadrants on every change detection pass. Inside a single project the
   * compact and minimal modes group by milestone instead, since every task has the same project.
   */
  readonly quadrants = computed<QuadrantSection[]>(() => {
    const byQuadrant: Record<EisenhowerQuadrant, Todo[]> = { doFirst: [], schedule: [], delegate: [], eliminate: [] };
    for (const todo of this.activeTodos()) byQuadrant[classify(todo)].push(todo);
    const byMilestone = !!this.projectId();
    return QUADRANTS.map((def) => ({
      ...def,
      todos: byQuadrant[def.key],
      groups: byMilestone ? this.groupByMilestone(byQuadrant[def.key]) : this.groupByProject(byQuadrant[def.key]),
    }));
  });

  /** Groups in milestone order, with tasks that have no (or a deleted) milestone last. */
  private groupByMilestone(list: Todo[]): ProjectGroup[] {
    const milestones = new Map(this.projects.milestones().map((m) => [m.id, m]));
    const groups = new Map<string, ProjectGroup & { order: number }>();
    for (const todo of list) {
      const milestone = todo.milestoneId ? milestones.get(todo.milestoneId) : undefined;
      const key = milestone ? milestone.id : '__none__';
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: milestone ? milestone.name : this.translate.instant('kanban.noMilestone'),
          order: milestone ? milestone.order : Number.POSITIVE_INFINITY,
          todos: [],
        });
      }
      groups.get(key)!.todos.push(todo);
    }
    return Array.from(groups.values()).sort((a, b) => (a.order === b.order ? 0 : a.order < b.order ? -1 : 1));
  }

  private groupByProject(list: Todo[]): ProjectGroup[] {
    const groups = new Map<string, ProjectGroup>();
    for (const todo of list) {
      const key = todo.projectId ?? '__none__';
      if (!groups.has(key)) {
        const project = todo.projectId ? this.projects.projects().find((p) => p.id === todo.projectId) : undefined;
        groups.set(key, {
          key,
          name: project ? project.name : this.translate.instant('eisenhower.noProject'),
          icon: project?.icon,
          todos: [],
        });
      }
      groups.get(key)!.todos.push(todo);
    }
    return Array.from(groups.values());
  }

  onDrop(quadrant: EisenhowerQuadrant): void {
    const id = this.todos.draggedId();
    if (!id) return;
    const { importance, urgency } = QUADRANT_BY_KEY[quadrant];
    this.todos.updateTodo(id, { importance, urgency });
    this.todos.endDrag();
  }

  readonly selectedTodoId = signal<string | null>(null);
  readonly selectedTodo = computed(() => this.todos.todos().find((todo) => todo.id === this.selectedTodoId()) ?? null);

  openDetail(id: string): void {
    this.selectedTodoId.set(id);
  }

  closeDetail(): void {
    this.selectedTodoId.set(null);
  }

  readonly activeQuadrant = signal<EisenhowerQuadrant | null>(null);

  openNewTask(quadrant: EisenhowerQuadrant): void {
    this.activeQuadrant.set(quadrant);
  }

  closeNewTask(): void {
    this.activeQuadrant.set(null);
  }
}
