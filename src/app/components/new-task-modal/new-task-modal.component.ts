import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import type { EisenhowerQuadrant } from '../../../types/eisenhower';
import type { Priority } from '../../../types/todo';

const ICONS = ['📁', '📌', '🚀', '🎯', '📚', '💼', '🛠️', '🎨', '🧪', '🏗️', '🌱', '🔥'];

const QUADRANT_TARGETS: Record<EisenhowerQuadrant, { importance: Priority; urgency: Priority }> = {
  doFirst: { importance: 'high', urgency: 'high' },
  schedule: { importance: 'high', urgency: 'low' },
  delegate: { importance: 'low', urgency: 'high' },
  eliminate: { importance: 'low', urgency: 'low' },
};

@Component({
  selector: 'app-new-task-modal',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './new-task-modal.component.html',
  styleUrl: './new-task-modal.component.css',
})
export class NewTaskModalComponent {
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly translate = inject(TranslateService);

  readonly quadrant = input.required<EisenhowerQuadrant>();
  readonly close = output<void>();

  readonly icons = ICONS;

  readonly title = signal('');
  readonly description = signal('');
  readonly projectRef = signal('');
  readonly milestoneRef = signal('');
  readonly pomodorosForTermination = signal('');

  readonly chosenIcon = signal(ICONS[0]);
  readonly projectName = signal('');
  readonly milestoneName = signal('');

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
    this.chosenIcon.set(ICONS[0]);
    this.projectName.set('');
    this.milestoneName.set('');
  }

  readonly selectedProjectId = computed<string | undefined>(() => {
    const ref = this.projectRef();
    if (ref === '__new__') return undefined;
    return ref || undefined;
  });

  readonly showMilestones = computed(() => !!this.selectedProjectId());

  readonly projectSelectOptions = computed(() => {
    const opts: Array<{ value: string; label: string }> = [
      { value: '', label: this.translate.instant('eisenhower.createTask.noProject') },
      ...this.projects.sortedProjects().map((p) => ({ value: p.id, label: `${p.icon} ${p.name}` })),
    ];
    opts.push({ value: '__new__', label: this.translate.instant('eisenhower.createTask.newProject') });
    return opts;
  });

  readonly milestoneOptions = computed(() => {
    const projectId = this.selectedProjectId();
    if (!projectId) return [];
    const projectMilestones = this.projects.milestonesForProject(projectId);
    const opts: Array<{ value: string; label: string }> = [
      { value: '', label: this.translate.instant('eisenhower.createTask.noMilestone') },
      ...projectMilestones.map((m) => ({ value: m.id, label: m.name })),
    ];
    opts.push({ value: '__new__', label: this.translate.instant('eisenhower.createTask.newMilestone') });
    return opts;
  });

  readonly importanceLabel = computed(() =>
    this.translate.instant(`todo.${QUADRANT_TARGETS[this.quadrant()].importance}`),
  );
  readonly urgencyLabel = computed(() =>
    this.translate.instant(`todo.${QUADRANT_TARGETS[this.quadrant()].urgency}`),
  );

  get modalTitle(): string {
    return this.translate.instant('eisenhower.newTaskIn', {
      quadrant: this.translate.instant(`eisenhower.${this.quadrant()}`),
    });
  }

  handleSubmit(): void {
    const target = QUADRANT_TARGETS[this.quadrant()];
    const trimmedTitle = this.title().trim();
    if (!trimmedTitle) return;

    let finalProjectId: string | undefined = this.selectedProjectId();
    let finalMilestoneId: string | undefined = this.milestoneRef() || undefined;

    if (this.projectRef() === '__new__' && this.projectName().trim()) {
      const createdProject = this.projects.addProject({
        icon: this.chosenIcon(),
        name: this.projectName().trim(),
        description: '',
        notes: '',
      });
      finalProjectId = createdProject.id;
    } else if (this.projectRef() === '__new__') {
      return;
    }

    if (this.showMilestones() && this.milestoneRef() === '__new__' && this.milestoneName().trim()) {
      const createdMilestone = this.projects.addMilestone(finalProjectId!, this.milestoneName().trim());
      finalMilestoneId = createdMilestone.id;
    } else if (this.showMilestones() && this.milestoneRef() === '__new__') {
      return;
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
