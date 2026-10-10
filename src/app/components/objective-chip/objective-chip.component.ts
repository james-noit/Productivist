import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Read-only chip naming the project objectives a task serves (Kanban cards, List rows): the first title,
 * "+N" for the rest, all of them in the tooltip. Renders nothing for a task that serves none.
 * `:host { display: contents }` so the chip stays a direct child of the caller's flex container.
 */
@Component({
  selector: 'app-objective-chip',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-chip.component.html',
  styleUrl: './objective-chip.component.css',
})
export class ObjectiveChipComponent {
  readonly titles = input<readonly string[]>([]);
  protected readonly all = computed(() => this.titles().join(', '));
}
