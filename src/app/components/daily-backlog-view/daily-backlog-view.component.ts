import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { ProjectsService } from '../../../services/projects.service';
import { TodoFormComponent } from '../todo-form/todo-form.component';
import type { Project } from '../../../types/project';
import type { Priority } from '../../../types/todo';

type BacklogGroup = { kind: 'unassigned' } | { kind: 'project'; project: Project };

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

@Component({
  selector: 'app-daily-backlog-view',
  standalone: true,
  imports: [TranslatePipe, TodoFormComponent],
  templateUrl: './daily-backlog-view.component.html',
  styleUrl: './daily-backlog-view.component.css',
})
export class DailyBacklogViewComponent {
  readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);

  readonly selectedGroup = signal<BacklogGroup | null>(null);
  readonly addingTask = signal(false);

  readonly unassignedCount = computed(
    () => this.todos.todos().filter((todo) => !todo.done && !todo.projectId).length,
  );

  readonly projectGroups = computed(() =>
    this.projects.sortedProjects().map((project) => ({
      project,
      count: this.todos.todos().filter((todo) => !todo.done && todo.projectId === project.id).length,
    })),
  );

  readonly selectedProject = computed(() => {
    const group = this.selectedGroup();
    return group?.kind === 'project' ? group.project : null;
  });

  readonly selectedTasks = computed(() => {
    const group = this.selectedGroup();
    if (!group) return [];
    const list = this.todos
      .todos()
      .filter((todo) => !todo.done)
      .filter((todo) => (group.kind === 'unassigned' ? !todo.projectId : todo.projectId === group.project.id));
    return list.sort((a, b) => {
      const importanceDiff = PRIORITY_RANK[a.importance] - PRIORITY_RANK[b.importance];
      if (importanceDiff !== 0) return importanceDiff;
      return PRIORITY_RANK[a.urgency] - PRIORITY_RANK[b.urgency];
    });
  });

  isSelected(group: BacklogGroup): boolean {
    const current = this.selectedGroup();
    if (!current) return false;
    if (group.kind === 'unassigned') return current.kind === 'unassigned';
    return current.kind === 'project' && current.project.id === group.project.id;
  }

  selectGroup(group: BacklogGroup): void {
    this.selectedGroup.set(group);
    this.addingTask.set(false);
  }
}
