import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SettingsService, type BellSoundId, type BoxClockOrder, type ClockStyle } from '../../../services/settings.service';
import { ClockService } from '../../../services/clock.service';
import { ViewService } from '../../../services/view.service';
import { MultitaskService } from '../../../services/multitask.service';

@Component({
  selector: 'app-clock-settings',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clock-settings.component.html',
  styleUrl: './clock-settings.component.css',
})
export class ClockSettingsComponent {
  readonly settings = inject(SettingsService);
  readonly multitask = inject(MultitaskService);
  private readonly clock = inject(ClockService);
  private readonly translate = inject(TranslateService);

  readonly bellSounds: { id: BellSoundId }[] = [
    { id: 'alarmClock' },
    { id: 'bowl' },
    { id: 'marimba' },
    { id: 'chime' },
    { id: 'birds' },
    { id: 'gong' },
    { id: 'digital' },
    { id: 'classic' },
    { id: 'siren' },
    { id: 'buzzer' },
  ];

  readonly clockStyles: { id: ClockStyle }[] = [{ id: 'boxes' }, { id: 'ring' }];
  readonly boxOrders: { id: BoxClockOrder }[] = [{ id: 'sequential' }, { id: 'random' }];

  readonly open = inject(ViewService).settingsOpen;

  get settingsLabel(): string {
    return this.translate.instant('clock.settings');
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  onBellSoundChange(event: Event): void {
    this.settings.setBellSound((event.target as HTMLInputElement).checked);
  }

  playSound(id: BellSoundId): void {
    this.clock.preview(id);
  }
}
