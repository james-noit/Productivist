import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { ViewService } from '../../../services/view.service';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { AppMenuComponent } from '../app-menu/app-menu.component';
import { MultitaskToggleComponent } from '../multitask-toggle/multitask-toggle.component';
import { LoginPopoverComponent } from '../login-popover/login-popover.component';
import { APP_VERSION } from '../../version';

@Component({
  selector: 'app-app-header',
  standalone: true,
  imports: [AppMenuComponent, MultitaskToggleComponent, LoginPopoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.css',
})
export class AppHeaderComponent {
  readonly view = inject(ViewService);
  readonly appVersion = APP_VERSION;
  readonly coffeeDismissed = localStorageSignal<boolean>('productivist.coffeeDismissed', false);

  constructor() {
    // On phones the support pill floats at the bottom of the screen. This class lets `style.css` publish how much
    // room it takes (`--floating-bottom-offset`), so other floating controls, like the "+" of Tasks and projects,
    // stack above it instead of on top of it.
    effect(() => document.documentElement.classList.toggle('support-floating', !this.coffeeDismissed()));
  }
}
