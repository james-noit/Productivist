import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ClockService } from '../../../services/clock.service';
import { SettingsService } from '../../../services/settings.service';
import { trapTab } from '../../../lib/focus-trap';

const CLOCK_REFRESH_MS = 15_000;

/**
 * The dialog that asks to stop the end-of-session alarm while "keep ringing" is on. AppComponent renders it from
 * `ClockService.alarmModalOpen`, over every view. The clock is two stacked images (the body and the hammer) so
 * the hammer can rattle on its own; all the motion is CSS and stops under `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-alarm-modal',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alarm-modal.component.html',
  styleUrl: './alarm-modal.component.css',
})
export class AlarmModalComponent {
  private readonly clock = inject(ClockService);
  private readonly settings = inject(SettingsService);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly stopButton = viewChild<ElementRef<HTMLElement>>('stopBtn');

  private readonly now = signal(Date.now());

  /** After the switch to the next mode, `mode()` is the one that starts next: a break next means focus just ended. */
  readonly titleKey = computed(() => (this.clock.mode() === 'break' ? 'clock.timeUp' : 'clock.breakOver'));

  readonly time = computed(() =>
    new Intl.DateTimeFormat(this.settings.language(), { hour: '2-digit', minute: '2-digit' }).format(this.now()),
  );

  constructor() {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    afterNextRender(() => this.stopButton()?.nativeElement.focus());

    const refresh = setInterval(() => this.now.set(Date.now()), CLOCK_REFRESH_MS);

    // Space, Enter and Escape stop the alarm from anywhere. Listening on the capture phase of the document keeps
    // the dialogs underneath (their own Escape handlers, a focused row's Enter) from also reacting to the key.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        this.stop();
        return;
      }
      const panel = this.panel()?.nativeElement;
      if (panel && trapTab(event, panel)) event.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(refresh);
      document.removeEventListener('keydown', onKey, true);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else document.body.focus();
    });
  }

  stop(): void {
    this.clock.stopAlarm();
  }
}
