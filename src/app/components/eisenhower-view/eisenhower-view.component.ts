import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { TodosService } from '../../../services/todos.service';
import { ProjectsService } from '../../../services/projects.service';
import { EisenhowerCardComponent } from '../eisenhower-card/eisenhower-card.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { NewTaskModalComponent } from '../new-task-modal/new-task-modal.component';
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
  imports: [TranslatePipe, EisenhowerCardComponent, TaskDetailModalComponent, NewTaskModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './eisenhower-view.component.html',
  styleUrl: './eisenhower-view.component.css',
})
export class EisenhowerViewComponent {
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);
  private readonly translate = inject(TranslateService);

  readonly viewMode = localStorageSignal<EisenhowerViewMode>('productivist.eisenhowerViewMode', 'detailed');

  readonly activeTodos = computed(() => this.todos.sortTasks(this.todos.todos().filter((todo) => !todo.done)));

  /**
   * Every quadrant with its tasks already split and grouped by project. The template used
   * to call `groupByProject(listFor(q.key))` inline, which rebuilt a Map and one array per
   * project for all four quadrants on every change detection pass.
   */
  readonly quadrants = computed<QuadrantSection[]>(() => {
    const byQuadrant: Record<EisenhowerQuadrant, Todo[]> = { doFirst: [], schedule: [], delegate: [], eliminate: [] };
    for (const todo of this.activeTodos()) byQuadrant[classify(todo)].push(todo);
    return QUADRANTS.map((def) => ({
      ...def,
      todos: byQuadrant[def.key],
      groups: this.groupByProject(byQuadrant[def.key]),
    }));
  });

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
