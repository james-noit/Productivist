import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ProjectFormComponent } from '../project-form/project-form.component';
import type { Project } from '../../../types/project';

@Component({
  selector: 'app-edit-project-modal',
  standalone: true,
  imports: [TranslatePipe, ProjectFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edit-project-modal.component.html',
  styleUrl: './edit-project-modal.component.css',
})
export class EditProjectModalComponent {
  readonly project = input.required<Project>();
  readonly save = output<{ icon: string; name: string; description: string; notes: string }>();
  readonly close = output<void>();

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }
}
