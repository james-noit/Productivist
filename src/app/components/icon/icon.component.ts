import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PROJECT_ICON_PATHS } from '../../../lib/project-icon-paths';

/**
 * Renders the project icon library by name: the shapes are data in `lib/project-icon-paths.ts`
 * (a few `d` strings each), drawn with the stroke style of `ui-icon`. Anything that isn't a
 * recognized name (e.g. an emoji a user saved before icons moved off emoji) is printed as-is,
 * so older projects keep showing their original icon instead of breaking.
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

  readonly paths = computed(() => {
    const name = this.name();
    return Object.hasOwn(PROJECT_ICON_PATHS, name) ? PROJECT_ICON_PATHS[name] : undefined;
  });
}
