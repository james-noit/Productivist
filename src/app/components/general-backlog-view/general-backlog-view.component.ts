import { Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import { ProjectsService } from '../../../services/projects.service';
import { QUADRANTS, countByQuadrant, type QuadrantCounts } from '../../../lib/eisenhower';
import { FreeTasksCardComponent } from '../free-tasks-card/free-tasks-card.component';
import { ProjectTreeItemComponent } from '../project-tree-item/project-tree-item.component';
import type { Project } from '../../../types/project';

interface ProjectRow {
  project: Project;
  counts: QuadrantCounts;
}

@Component({
  selector: 'app-general-backlog-view',
  standalone: true,
  imports: [TranslatePipe, FreeTasksCardComponent, ProjectTreeItemComponent],
  templateUrl: './general-backlog-view.component.html',
  styleUrl: './general-backlog-view.component.css',
})
export class GeneralBacklogViewComponent {
  private readonly todos = inject(TodosService);
  private readonly projects = inject(ProjectsService);

  readonly quadrants = QUADRANTS;

  readonly activeTodos = computed(() => this.todos.todos().filter((todo) => !todo.done));

  readonly combinedTotal = computed(() => this.activeTodos().length);
  readonly combinedCounts = computed(() => countByQuadrant(this.activeTodos()));

  // Ordered red (doFirst) > yellow (delegate) > blue (schedule) > grey (eliminate),
  // each descending, matching the priority a project's most urgent work implies.
  readonly projectRows = computed<ProjectRow[]>(() => {
    const rows: ProjectRow[] = this.projects.sortedProjects().map((project) => ({
      project,
      counts: countByQuadrant(this.activeTodos().filter((todo) => todo.projectId === project.id)),
    }));
    return rows.sort((a, b) => {
      if (b.counts.doFirst !== a.counts.doFirst) return b.counts.doFirst - a.counts.doFirst;
      if (b.counts.delegate !== a.counts.delegate) return b.counts.delegate - a.counts.delegate;
      if (b.counts.schedule !== a.counts.schedule) return b.counts.schedule - a.counts.schedule;
      return b.counts.eliminate - a.counts.eliminate;
    });
  });

  readonly isEmpty = computed(
    () => this.activeTodos().length === 0 && this.projects.sortedProjects().length === 0,
  );
}
