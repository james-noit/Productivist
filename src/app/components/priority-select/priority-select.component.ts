import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { Priority } from '../../../types/todo';

/** The low/medium/high dropdown. The option triplet was repeated at every edit site. */
@Component({
  selector: 'app-priority-select',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './priority-select.component.html',
  styleUrl: './priority-select.component.css',
})
export class PrioritySelectComponent {
  readonly value = model.required<Priority>();

  onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value as Priority);
  }
}
