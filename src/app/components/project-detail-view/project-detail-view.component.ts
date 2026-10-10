import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService, type ProjectPresentation } from '../../../services/view.service';
import { EditProjectModalComponent } from '../edit-project-modal/edit-project-modal.component';
import { IconComponent } from '../icon/icon.component';
import { KanbanBoardComponent } from '../kanban-board/kanban-board.component';
import { EisenhowerViewComponent } from '../eisenhower-view/eisenhower-view.component';
import { ProjectTaskListComponent } from '../project-task-list/project-task-list.component';
import { ProjectOverviewComponent } from '../project-overview/project-overview.component';
import { ProjectRoadmapComponent } from '../project-roadmap/project-roadmap.component';
import { ProjectCalendarComponent } from '../project-calendar/project-calendar.component';

interface PresentationTab {
  key: ProjectPresentation;
  labelKey: string;
  /** Stroke path of a 24x24 icon, rendered with `[attr.d]`. */
  icon: string;
}

/** One entry per presentation; adding one later is an entry here plus a `@case` in the template. */
const PRESENTATIONS: readonly PresentationTab[] = [
  { key: 'overview', labelKey: 'projectDetail.presentations.overview', icon: 'M4.5 17a8 8 0 1 1 15 0M12 15l3.5-4.5M4 21h16' },
  { key: 'kanban', labelKey: 'projectDetail.presentations.kanban', icon: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z' },
  { key: 'list', labelKey: 'projectDetail.presentations.list', icon: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01' },
  { key: 'matrix', labelKey: 'projectDetail.presentations.matrix', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { key: 'roadmap', labelKey: 'projectDetail.presentations.roadmap', icon: 'M4 6h9M8 12h12M6 18h8' },
  { key: 'calendar', labelKey: 'projectDetail.presentations.calendar', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
];

@Component({
  selector: 'app-project-detail-view',
  standalone: true,
  // The presentations are only used inside @defer blocks, so each gets its own chunk.
  imports: [TranslatePipe, IconComponent, EditProjectModalComponent, KanbanBoardComponent, ProjectOverviewComponent, ProjectTaskListComponent, EisenhowerViewComponent, ProjectRoadmapComponent, ProjectCalendarComponent],
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

  /** Alt+Left always goes back; Escape only when it is not already closing a modal or leaving a field. */
  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' && event.altKey && !event.shiftKey) {
      event.preventDefault();
      this.back();
    } else if (event.key === 'Escape' && !event.altKey && !event.shiftKey) {
      if (document.querySelector('[aria-modal="true"], .modal-overlay')) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return;
      this.back();
    }
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
