import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ClockService } from '../../../services/clock.service';
import { ViewService } from '../../../services/view.service';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { AppMenuComponent } from '../app-menu/app-menu.component';
import { MultitaskToggleComponent } from '../multitask-toggle/multitask-toggle.component';
import { LoginPopoverComponent } from '../login-popover/login-popover.component';
import { PomodoroChipComponent } from '../pomodoro-chip/pomodoro-chip.component';
import { APP_VERSION } from '../../version';

@Component({
  selector: 'app-app-header',
  standalone: true,
  imports: [TranslatePipe, AppMenuComponent, MultitaskToggleComponent, LoginPopoverComponent, PomodoroChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.css',
})
export class AppHeaderComponent {
  readonly view = inject(ViewService);
  readonly clock = inject(ClockService);
  private readonly stopAlarmButton = viewChild<ElementRef<HTMLElement>>('stopAlarm');
  readonly appVersion = APP_VERSION;
  readonly coffeeDismissed = localStorageSignal<boolean>('productivist.coffeeDismissed', false);

  /**
   * The Pomodoro chip is lazy: only this condition ships in the initial bundle. Once it has been wanted it stays
   * mounted (it hides itself), so its screen-reader note about a phase ending, which is exactly when it hides, still
   * reaches the user.
   */
  private chipLatched = false;
  readonly chipMounted = computed(
    () =>
      (this.chipLatched ||=
        this.view.current() !== 'pomodoro' && this.clock.inSession() && !this.clock.alarmModalOpen()),
  );

  constructor() {
    // On phones the support pill floats at the bottom of the screen. This class lets `style.css` publish how much
    // room it takes (`--floating-bottom-offset`), so other floating controls, like the "+" of Tasks and projects,
    // stack above it instead of on top of it.
    effect(() => document.documentElement.classList.toggle('support-floating', !this.coffeeDismissed()));

    // The alarm may start while the user is anywhere in the app: bring them to its button, unless they are typing.
    effect(() => {
      const button = this.stopAlarmButton()?.nativeElement;
      if (button && document.activeElement === document.body) button.focus();
    });
  }

  /** Escape silences the alarm when nothing else (a dialog, a drawer) is there to use the key. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.clock.ringing() && !document.querySelector('[aria-modal="true"]')) this.clock.stopAlarm();
  }
}
