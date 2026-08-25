import { Component, inject } from '@angular/core';
import { ViewService } from '../../../services/view.service';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { AppMenuComponent } from '../app-menu/app-menu.component';
import { MultitaskToggleComponent } from '../multitask-toggle/multitask-toggle.component';
import { APP_VERSION } from '../../version';

@Component({
  selector: 'app-app-header',
  standalone: true,
  imports: [AppMenuComponent, MultitaskToggleComponent],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.css',
})
export class AppHeaderComponent {
  readonly view = inject(ViewService);
  readonly appVersion = APP_VERSION;
  readonly coffeeDismissed = localStorageSignal<boolean>('productivist.coffeeDismissed', false);
}
