import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Renders a small library of hand-drawn SVG icons by name, matching the stroke style used
 * in the app menu. Anything that isn't a recognized name (e.g. an emoji a user saved
 * before icons moved off emoji) falls through to the default case and is printed as-is, so
 * older projects keep showing their original icon instead of breaking.
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.css',
})
export class IconComponent {
  readonly name = input.required<string>();
}
