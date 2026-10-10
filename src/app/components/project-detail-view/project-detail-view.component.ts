import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService, type ProjectPresentation } from '../../../services/view.service';
import { EditProjectModalComponent } from '../edit-project-modal/edit-project-modal.component';
import { IconComponent } from '../icon/icon.component';
import { KanbanBoardComponent } from '../kanban-board/kanban-board.component';

interface PresentationTab {
  key: ProjectPresentation;
  labelKey: string;
}

/** One entry per presentation; adding one later is an entry here plus a `@case` in the template. */
const PRESENTATIONS: readonly PresentationTab[] = [{ key: 'kanban', labelKey: 'projectDetail.presentations.kanban' }];

@Component({
  selector: 'app-project-detail-view',
  standalone: true,
  // KanbanBoardComponent is only used inside a @defer block, so it gets its own chunk.
  imports: [TranslatePipe, IconComponent, EditProjectModalComponent, KanbanBoardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-detail-view.component.html',
  styleUrl: './project-detail-view.component.css',
})
export class ProjectDetailViewComponent {
  readonly view = inject(ViewService);
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly translate = inject(TranslateService);

  readonly presentations = PRESENTATIONS;
  readonly editing = signal(false);

  readonly project = computed(() => {
    const id = this.view.activeProjectId();
    return id ? (this.projects.projects().find((p) => p.id === id) ?? null) : null;
  });

  readonly progress = computed(() => {
    const id = this.view.activeProjectId();
    let done = 0;
    let total = 0;
    for (const todo of this.todos.todos()) {
      if (todo.projectId !== id) continue;
      total++;
      if (todo.done) done++;
    }
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
  });

  constructor() {
    // The project may be deleted here or, after a sync, on another device.
    effect(() => {
      if (!this.project()) this.view.setView('projects');
    });
  }

  back(): void {
    this.view.setView('projects');
  }

  saveEdit(data: { icon: string; name: string; description: string; notes: string }): void {
    const project = this.project();
    if (project) this.projects.updateProject(project.id, data);
    this.editing.set(false);
  }

  deleteProject(): void {
    const project = this.project();
    if (!project) return;
    if (!window.confirm(this.translate.instant('projects.deleteConfirm'))) return;
    this.projects.removeProject(project.id);
    this.view.setView('projects');
  }

  selectPresentation(key: ProjectPresentation): void {
    this.view.projectPresentation.set(key);
  }

  /** Left/Right move between presentations, wrapping, and take focus with them. */
  onTabKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = PRESENTATIONS.findIndex((p) => p.key === this.view.projectPresentation());
    const next = PRESENTATIONS[(index + step + PRESENTATIONS.length) % PRESENTATIONS.length].key;
    this.selectPresentation(next);
    const tablist = event.currentTarget as HTMLElement;
    queueMicrotask(() => tablist.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
  }
}
