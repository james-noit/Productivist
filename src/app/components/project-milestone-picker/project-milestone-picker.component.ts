import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';

/** Sentinel refs for the two selects, alongside '' (none) and a real id. */
export const NEW_REF = '__new__';

export interface NewProjectInput {
  icon: string;
  name: string;
}

const ICONS = ['📁', '📌', '🚀', '🎯', '📚', '💼', '🛠️', '🎨', '🧪', '🏗️', '🌱', '🔥'];

/**
 * The project + milestone selects, including the inline "new project" (icon grid + name)
 * and "new milestone" forms. Shared by new-task-modal and task-detail-modal, which had
 * identical copies of the ICONS list, the four derivations below and the whole markup.
 *
 * It owns the *derivations* only, not the commit semantics: task-detail-modal writes each
 * change straight to the todo, while new-task-modal defers everything to submit. So the
 * refs are two-way models and the actual writes are left to the parent, which either acts
 * on (projectPicked)/(createProject) as they happen or reads the draft state at submit.
 */
@Component({
  selector: 'app-project-milestone-picker',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-milestone-picker.component.html',
  styleUrl: './project-milestone-picker.component.css',
})
export class ProjectMilestonePickerComponent {
  private readonly projects = inject(ProjectsService);
  private readonly translate = inject(TranslateService);

  readonly projectRef = model.required<string>();
  readonly milestoneRef = model.required<string>();

  /** new-task-modal creates on submit instead, so it hides the inline Save buttons. */
  readonly showInlineCreateButtons = input(true);

  readonly projectPicked = output<void>();
  readonly milestonePicked = output<void>();
  readonly createProject = output<NewProjectInput>();
  readonly createMilestone = output<string>();

  readonly icons = ICONS;

  /** Draft state for the inline create forms; the parent reads these at submit time. */
  readonly chosenIcon = signal(ICONS[0]);
  readonly projectName = signal('');
  readonly milestoneName = signal('');

  readonly selectedProjectId = computed<string | undefined>(() => {
    const ref = this.projectRef();
    if (ref === NEW_REF) return undefined;
    return ref || undefined;
  });

  readonly showMilestones = computed(() => !!this.selectedProjectId());

  readonly projectSelectOptions = computed(() => [
    { value: '', label: this.translate.instant('eisenhower.createTask.noProject') },
    ...this.projects.sortedProjects().map((p) => ({ value: p.id, label: `${p.icon} ${p.name}` })),
    { value: NEW_REF, label: this.translate.instant('eisenhower.createTask.newProject') },
  ]);

  readonly milestoneOptions = computed(() => {
    const projectId = this.selectedProjectId();
    if (!projectId) return [];
    return [
      { value: '', label: this.translate.instant('eisenhower.createTask.noMilestone') },
      ...this.projects.milestonesForProject(projectId).map((m) => ({ value: m.id, label: m.name })),
      { value: NEW_REF, label: this.translate.instant('eisenhower.createTask.newMilestone') },
    ];
  });

  /** Resets the inline drafts, e.g. when the host points the picker at a different task. */
  resetDrafts(): void {
    this.chosenIcon.set(ICONS[0]);
    this.projectName.set('');
    this.milestoneName.set('');
  }

  onProjectSelect(): void {
    if (this.projectRef() === NEW_REF) return;
    this.projectPicked.emit();
  }

  onMilestoneSelect(): void {
    if (this.milestoneRef() === NEW_REF) return;
    this.milestonePicked.emit();
  }

  submitNewProject(): void {
    const name = this.projectName().trim();
    if (!name) return;
    this.createProject.emit({ icon: this.chosenIcon(), name });
    this.projectName.set('');
  }

  submitNewMilestone(): void {
    const name = this.milestoneName().trim();
    if (!name) return;
    this.createMilestone.emit(name);
    this.milestoneName.set('');
  }
}
