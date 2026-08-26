import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { QUADRANT_BY_KEY } from '../../../lib/eisenhower';
import { ProjectMilestonePickerComponent, NEW_REF } from '../project-milestone-picker/project-milestone-picker.component';
import type { EisenhowerQuadrant } from '../../../types/eisenhower';


@Component({
  selector: 'app-new-task-modal',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ProjectMilestonePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-task-modal.component.html',
  styleUrl: './new-task-modal.component.css',
})
export class NewTaskModalComponent {
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly translate = inject(TranslateService);

  readonly quadrant = input.required<EisenhowerQuadrant>();
  readonly close = output<void>();

  private readonly picker = viewChild(ProjectMilestonePickerComponent);


  readonly title = signal('');
  readonly description = signal('');
  readonly projectRef = signal('');
  readonly milestoneRef = signal('');
  readonly pomodorosForTermination = signal('');


  constructor() {
    effect(() => {
      this.quadrant();
      this.init();
    });
  }

  private init(): void {
    this.title.set('');
    this.description.set('');
    this.projectRef.set('');
    this.milestoneRef.set('');
    this.pomodorosForTermination.set('');
    this.picker()?.resetDrafts();
  }





  readonly importanceLabel = computed(() =>
    this.translate.instant(`todo.${QUADRANT_BY_KEY[this.quadrant()].importance}`),
  );
  readonly urgencyLabel = computed(() =>
    this.translate.instant(`todo.${QUADRANT_BY_KEY[this.quadrant()].urgency}`),
  );

  get modalTitle(): string {
    return this.translate.instant('eisenhower.newTaskIn', {
      quadrant: this.translate.instant(`eisenhower.${this.quadrant()}`),
    });
  }

  handleSubmit(): void {
    const target = QUADRANT_BY_KEY[this.quadrant()];
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

  handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close.emit();
    }
  }
}
