import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import type { Project } from '../../../types/project';

const ICONS = ['📁', '📌', '🚀', '🎯', '📚', '💼', '🛠️', '🎨', '🧪', '🏗️', '🌱', '🔥'];

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-form.component.html',
  styleUrl: './project-form.component.css',
})
export class ProjectFormComponent {
  readonly project = input<Project>();
  readonly save = output<{ icon: string; name: string; description: string; notes: string }>();
  readonly cancel = output<void>();

  readonly icons = ICONS;

  readonly icon = signal(this.initial((p) => p.icon) ?? ICONS[0]);
  readonly name = signal(this.initial((p) => p.name) ?? '');
  readonly description = signal(this.initial((p) => p.description) ?? '');
  readonly notes = signal(this.initial((p) => p.notes) ?? '');

  private initial<T>(pick: (p: Project) => T): T | undefined {
    const project = this.project();
    return project ? pick(project) : undefined;
  }

  submit(): void {
    const trimmed = this.name().trim();
    if (!trimmed) return;
    this.save.emit({
      icon: this.icon(),
      name: trimmed,
      description: this.description().trim(),
      notes: this.notes().trim(),
    });
  }
}
