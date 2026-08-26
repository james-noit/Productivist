import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { Todo } from '../../../types/todo';

/**
 * A task's importance and urgency chips, optionally followed by its tags.
 *
 * The host is `display: contents`, so the chips remain direct children of whatever
 * flex or grid container the caller puts this in — several call sites lay the badges
 * out as siblings of a title rather than inside a wrapper of their own.
 */
@Component({
  selector: 'app-task-badges',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-badges.component.html',
  styleUrl: './task-badges.component.css',
})
export class TaskBadgesComponent {
  readonly todo = input.required<Todo>();
  readonly showTags = input(false);
}
