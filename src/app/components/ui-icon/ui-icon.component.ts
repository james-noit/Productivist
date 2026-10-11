import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type UiIconName =
  | 'x'
  | 'trash'
  | 'repeat'
  | 'calendar'
  | 'plus'
  | 'minus'
  | 'more'
  | 'check'
  | 'search'
  | 'chevron-down'
  | 'chevron-right'
  | 'edit'
  | 'pause'
  | 'play'
  | 'flag'
  | 'clock'
  | 'inbox'
  | 'open'
  | 'grip'
  | 'alert';

/**
 * Interface icons (close, delete, add, ...) as inline SVGs on a 24px grid: 1.75 stroke, round caps and
 * joins, `currentColor`. Decorative: the button or link around it carries the accessible name.
 * Not the same as `app-icon`, which is the project-icon library.
 */
@Component({
  selector: 'app-ui-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-icon.component.html',
  styleUrl: './ui-icon.component.css',
})
export class UiIconComponent {
  readonly name = input.required<UiIconName>();
  readonly size = input(18);
}
