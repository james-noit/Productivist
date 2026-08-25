import { Component, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { ProjectFormComponent } from '../project-form/project-form.component';
import { ProjectTreeItemComponent } from '../project-tree-item/project-tree-item.component';

@Component({
  selector: 'app-projects-panel',
  standalone: true,
  imports: [TranslatePipe, ProjectFormComponent, ProjectTreeItemComponent],
  templateUrl: './projects-panel.component.html',
  styleUrl: './projects-panel.component.css',
})
export class ProjectsPanelComponent {
  readonly projects = inject(ProjectsService);

  readonly multitaskMode = input(false);
  readonly isTaskPickable = input<(todoId: string) => boolean>();
  readonly onPickTask = input<(todoId: string) => void>();

  readonly creating = signal(false);

  createProject(data: { icon: string; name: string; description: string; notes: string }): void {
    this.projects.addProject(data);
    this.creating.set(false);
  }
}
