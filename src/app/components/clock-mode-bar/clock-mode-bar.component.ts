import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ClockService } from '../../../services/clock.service';
import { ClockSettingsComponent } from '../clock-settings/clock-settings.component';
import { SportaskButtonComponent } from '../sportask-button/sportask-button.component';

/**
 * The top row of the Pomodoro clock and of the Multitask strip: one Focus | Break switch on the left, the quiet tools (Sportask,
 * clock settings) as round icon buttons on the right, so the mode reads as the one primary choice.
 */
@Component({
  selector: 'app-clock-mode-bar',
  standalone: true,
  imports: [TranslatePipe, ClockSettingsComponent, SportaskButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clock-mode-bar.component.html',
  styleUrl: './clock-mode-bar.component.css',
})
export class ClockModeBarComponent {
  readonly source = input<'pomodoro' | 'multitask'>('pomodoro');
  protected readonly clock = inject(ClockService);
}
