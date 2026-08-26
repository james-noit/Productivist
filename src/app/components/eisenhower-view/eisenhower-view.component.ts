import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { TodosService } from '../../../services/todos.service';
import { ProjectsService } from '../../../services/projects.service';
import { EisenhowerCardComponent } from '../eisenhower-card/eisenhower-card.component';
import { TaskDetailModalComponent } from '../task-detail-modal/task-detail-modal.component';
import { NewTaskModalComponent } from '../new-task-modal/new-task-modal.component';
import type { Todo, Priority } from '../../../types/todo';
import type { EisenhowerQuadrant, EisenhowerViewMode } from '../../../types/eisenhower';

interface ProjectGroup {
  key: string;
  name: string;
  icon?: string;
  todos: Todo[];
}

const QUADRANT_TARGETS: Record<EisenhowerQuadrant, { importance: Priority; urgency: Priority }> = {
  doFirst: { importance: 'high', urgency: 'high' },
  schedule: { importance: 'high', urgency: 'low' },
  delegate: { importance: 'low', urgency: 'high' },
  eliminate: { importance: 'low', urgency: 'low' },
};

const QUADRANT_DEFS: { key: EisenhowerQuadrant; cssKey: string }[] = [
  { key: 'doFirst', cssKey: 'do-first' },
  { key: 'schedule', cssKey: 'schedule' },
  { key: 'delegate', cssKey: 'delegate' },
  { key: 'eliminate', cssKey: 'eliminate' },
];

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

  readonly quadrantDefs = QUADRANT_DEFS;
  readonly viewMode = localStorageSignal<EisenhowerViewMode>('productivist.eisenhowerViewMode', 'detailed');

  readonly activeTodos = computed(() => this.todos.sortTasks(this.todos.todos().filter((todo) => !todo.done)));

  private readonly isImportant = (todo: Todo) => todo.importance === 'high';
  private readonly isUrgent = (todo: Todo) => todo.urgency === 'high';

  readonly doFirst = computed(() => this.activeTodos().filter((t) => this.isImportant(t) && this.isUrgent(t)));
  readonly schedule = computed(() => this.activeTodos().filter((t) => this.isImportant(t) && !this.isUrgent(t)));
  readonly delegate = computed(() => this.activeTodos().filter((t) => !this.isImportant(t) && this.isUrgent(t)));
  readonly eliminate = computed(() => this.activeTodos().filter((t) => !this.isImportant(t) && !this.isUrgent(t)));

  listFor(quadrant: EisenhowerQuadrant): Todo[] {
    switch (quadrant) {
      case 'doFirst':
        return this.doFirst();
      case 'schedule':
        return this.schedule();
      case 'delegate':
        return this.delegate();
      case 'eliminate':
        return this.eliminate();
    }
  }

  groupByProject(list: Todo[]): ProjectGroup[] {
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
    this.todos.updateTodo(id, QUADRANT_TARGETS[quadrant]);
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
