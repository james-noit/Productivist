import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodosService } from '../../../services/todos.service';
import type { TaskRow } from '../../../lib/project-cards';
import { RepeatMarkComponent } from '../repeat-mark/repeat-mark.component';

/**
 * The "Next up" / "Matching tasks" list of a project, shared by the project card and the expanded project row: a
 * round check that completes the task, a title that opens Task Details (`openTask`), the ↻ marker and the due
 * date. Its check and title sit above the stretched link of the card or row around it (`z-index: 1`), so the host
 * must not create a stacking context.
 */
@Component({
  selector: 'app-project-task-rows',
  standalone: true,
  imports: [TranslatePipe, RepeatMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-task-rows.component.html',
  styleUrl: './project-task-rows.component.css',
})
export class ProjectTaskRowsComponent {
  private readonly todos = inject(TodosService);

  readonly rows = input.required<readonly TaskRow[]>();
  /** The rows are the tasks matching the page's filters instead of the plain "next up". */
  readonly matching = input(false);
  readonly openTask = output<string>();

  complete(todoId: string): void {
    this.todos.toggleDone(todoId);
  }
}
