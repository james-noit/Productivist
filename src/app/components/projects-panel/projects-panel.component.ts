import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import { classify, compareByUrgency, type QuadrantCounts } from '../../../lib/eisenhower';
import { FreeTasksCardComponent } from '../free-tasks-card/free-tasks-card.component';
import { ProjectFormComponent } from '../project-form/project-form.component';
import { ProjectTreeItemComponent } from '../project-tree-item/project-tree-item.component';
import { QuadrantCountBadgesComponent } from '../quadrant-count-badges/quadrant-count-badges.component';
import type { Project } from '../../../types/project';
import type { EisenhowerQuadrant } from '../../../types/eisenhower';

export type ProjectsSort = 'manual' | 'urgency';

interface ProjectRow {
  project: Project;
  /** Only set with `withBacklog`; without it the tree item falls back to its plain task count. */
  counts: QuadrantCounts | undefined;
}

// Shared so a project with no open tasks doesn't allocate a fresh object per pass.
const NO_COUNTS: QuadrantCounts = { doFirst: 0, schedule: 0, delegate: 0, eliminate: 0 };

@Component({
  selector: 'app-projects-panel',
  standalone: true,
  imports: [
    TranslatePipe,
    FreeTasksCardComponent,
    ProjectFormComponent,
    ProjectTreeItemComponent,
    QuadrantCountBadgesComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-panel.component.html',
  styleUrl: './projects-panel.component.css',
})
export class ProjectsPanelComponent {
  readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly view = inject(ViewService);

  readonly multitaskMode = input(false);
  readonly isTaskPickable = input<(todoId: string) => boolean>();
  readonly onPickTask = input<(todoId: string) => void>();
  /**
   * The Projects view's "general backlog" layout: an all-tasks summary strip, the free tasks card
   * first in the list, quadrant badges on every project and a sort toggle. Off by default so the
   * panel renders as before for the task picker, drawer and wizard that embed it.
   */
  readonly withBacklog = input(false);

  readonly creating = signal(false);
  readonly sort = localStorageSignal<ProjectsSort>('productivist.projectsSort', 'manual');

  /** One pass over the open todos: per-project quadrant counts plus the combined total. */
  private readonly openTaskStats = computed(() => {
    const byProject = new Map<string, QuadrantCounts>();
    const combined: QuadrantCounts = { ...NO_COUNTS };
    let total = 0;
    if (!this.withBacklog()) return { byProject, combined, total };
    for (const todo of this.todos.todos()) {
      if (todo.done) continue;
      const quadrant = classify(todo);
      combined[quadrant]++;
      total++;
      if (!todo.projectId) continue;
      let counts = byProject.get(todo.projectId);
      if (!counts) {
        counts = { ...NO_COUNTS };
        byProject.set(todo.projectId, counts);
      }
      counts[quadrant]++;
    }
    return { byProject, combined, total };
  });

  readonly countsByProject = computed(() => this.openTaskStats().byProject);
  readonly combinedCounts = computed(() => this.openTaskStats().combined);
  readonly openTaskTotal = computed(() => this.openTaskStats().total);

  readonly rows = computed<ProjectRow[]>(() => {
    const sorted = this.projects.sortedProjects();
    if (!this.withBacklog()) return sorted.map((project) => ({ project, counts: undefined }));
    const byProject = this.countsByProject();
    const rows = sorted.map((project) => ({ project, counts: byProject.get(project.id) ?? NO_COUNTS }));
    // Array.prototype.sort is stable, so ties keep the manual order.
    return this.sort() === 'urgency' ? rows.sort((a, b) => compareByUrgency(a.counts, b.counts)) : rows;
  });

  /** With the backlog layout, free tasks alone are enough to fill the list. */
  readonly isEmpty = computed(
    () => !this.rows().length && (!this.withBacklog() || this.openTaskTotal() === 0),
  );

  createProject(data: { icon: string; name: string; description: string; notes: string }): void {
    this.projects.addProject(data);
    this.creating.set(false);
  }

  openMatrix(quadrant: EisenhowerQuadrant): void {
    this.view.openProjectsTab('matrix', quadrant);
  }
}
