import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { QUADRANT_BY_KEY } from '../../../lib/eisenhower';
import { ProjectMilestonePickerComponent, NEW_REF } from '../project-milestone-picker/project-milestone-picker.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { EisenhowerQuadrant } from '../../../types/eisenhower';
import type { Priority } from '../../../types/todo';


@Component({
  selector: 'app-new-task-modal',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ProjectMilestonePickerComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-task-modal.component.html',
  styleUrl: './new-task-modal.component.css',
})
export class NewTaskModalComponent {
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly translate = inject(TranslateService);

  /** The quadrant the task is added to (its importance and urgency). Without one, both are picked here and start at medium. */
  readonly quadrant = input<EisenhowerQuadrant | null>(null);
  /** Preselects the picker, so a task added from a project's own matrix lands in that project. */
  readonly projectId = input<string | null>(null);
  readonly milestoneId = input<string | null>(null);
  readonly close = output<void>();

  private readonly picker = viewChild(ProjectMilestonePickerComponent);
  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');


  readonly title = signal('');
  readonly description = signal('');
  readonly projectRef = signal('');
  readonly milestoneRef = signal('');
  readonly pomodorosForTermination = signal('');
  readonly importance = signal<Priority>('medium');
  readonly urgency = signal<Priority>('medium');
  readonly priorities: readonly Priority[] = ['low', 'medium', 'high'];

  constructor() {
    effect(() => {
      this.quadrant();
      this.init();
    });
    // `autofocus` does not fire for an element inserted after page load, so the title takes focus here.
    afterNextRender(() => this.titleInput()?.nativeElement.focus());
  }

  private init(): void {
    this.title.set('');
    this.description.set('');
    // Untracked: a changed preselection must not wipe what the user has typed.
    const projectId = untracked(this.projectId);
    this.projectRef.set(projectId ?? '');
    this.milestoneRef.set(projectId ? (untracked(this.milestoneId) ?? '') : '');
    this.pomodorosForTermination.set('');
    this.importance.set('medium');
    this.urgency.set('medium');
    this.picker()?.resetDrafts();
  }





  readonly importanceLabel = computed(() => {
    const quadrant = this.quadrant();
    return quadrant ? this.translate.instant(`todo.${QUADRANT_BY_KEY[quadrant].importance}`) : '';
  });
  readonly urgencyLabel = computed(() => {
    const quadrant = this.quadrant();
    return quadrant ? this.translate.instant(`todo.${QUADRANT_BY_KEY[quadrant].urgency}`) : '';
  });

  get modalTitle(): string {
    const quadrant = this.quadrant();
    if (!quadrant) return this.translate.instant('eisenhower.createTask.title');
    return this.translate.instant('eisenhower.newTaskIn', { quadrant: this.translate.instant(`eisenhower.${quadrant}`) });
  }

  handleSubmit(): void {
    const quadrant = this.quadrant();
    const target = quadrant ? QUADRANT_BY_KEY[quadrant] : { importance: this.importance(), urgency: this.urgency() };
    const trimmedTitle = this.title().trim();
    if (!trimmedTitle) return;

    // Unlike task-detail-modal, nothing here is committed until submit, so any project or
    // milestone the user typed into the picker's inline forms is created now.
    const picker = this.picker();
    if (!picker) return;

    let finalProjectId: string | undefined = picker.selectedProjectId();
    let finalMilestoneId: string | undefined = this.milestoneRef() || undefined;

    if (this.projectRef() === NEW_REF) {
      const name = picker.projectName().trim();
      if (!name) return;
      finalProjectId = this.projects.addProject({
        icon: picker.chosenIcon(),
        name,
        description: '',
        notes: '',
      }).id;
    }

    if (picker.showMilestones() && this.milestoneRef() === NEW_REF) {
      const name = picker.milestoneName().trim();
      if (!name) return;
      finalMilestoneId = this.projects.addMilestone(finalProjectId!, name).id;
    }

    const pomodoros = parseInt(this.pomodorosForTermination(), 10);

    this.todos.addTodo({
      title: trimmedTitle,
      description: this.description().trim() || undefined,
      importance: target.importance,
      urgency: target.urgency,
      tags: [],
      projectId: finalProjectId,
      milestoneId: finalMilestoneId,
      pomodorosForTermination: Number.isFinite(pomodoros) && pomodoros > 0 ? pomodoros : undefined,
    });

    this.close.emit();
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }

  handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close.emit();
    }
  }
}
