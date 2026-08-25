import { Component, computed, inject, input } from '@angular/core';
import { ProjectsService } from '../../../services/projects.service';
import type { Todo } from '../../../types/todo';

@Component({
  selector: 'app-task-project-tag',
  standalone: true,
  templateUrl: './task-project-tag.component.html',
  styleUrl: './task-project-tag.component.css',
})
export class TaskProjectTagComponent {
  private readonly projects = inject(ProjectsService);

  readonly todo = input.required<Todo>();

  readonly project = computed(() => this.projects.projects().find((p) => p.id === this.todo().projectId));
  readonly milestone = computed(() => this.projects.milestones().find((m) => m.id === this.todo().milestoneId));
}
