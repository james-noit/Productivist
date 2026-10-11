import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RecurrenceService } from '../../../services/recurrence.service';
import { RecurrenceFormatService } from '../../../services/recurrence-format.service';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { Todo } from '../../../types/todo';

/**
 * The ↻ marker of a recurring task's occurrence, with the series' rule ("Every week on Mon") as its tooltip and
 * accessible name. Renders nothing for ordinary tasks and for occurrences whose series was deleted.
 * `task-badges` includes it, so most views get it for free; the List and the Calendar place it by hand.
 */
@Component({
  selector: 'app-repeat-mark',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rule(); as text) {
      <span class="repeat-mark" role="img" [attr.aria-label]="text" [title]="text"><app-ui-icon name="repeat" [size]="size()" /></span>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .repeat-mark {
      display: inline-flex;
      align-items: center;
      flex: none;
      color: var(--color-text-muted);
    }
  `,
})
export class RepeatMarkComponent {
  private readonly recurrences = inject(RecurrenceService);
  private readonly format = inject(RecurrenceFormatService);

  readonly todo = input.required<Pick<Todo, 'recurrenceId'>>();
  readonly size = input(13);

  readonly rule = computed(() => {
    const id = this.todo().recurrenceId;
    const series = id ? this.recurrences.byId().get(id) : undefined;
    return series ? this.format.describe(series) : null;
  });
}
