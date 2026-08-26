import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ClockService } from '../../../services/clock.service';
import { SettingsService } from '../../../services/settings.service';

function shuffledOrder(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

@Component({
  selector: 'app-box-clock',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './box-clock.component.html',
  styleUrl: './box-clock.component.css',
})
export class BoxClockComponent {
  private readonly clock = inject(ClockService);
  private readonly settings = inject(SettingsService);

  readonly boxCount = computed(() => Math.max(1, Math.ceil(this.clock.durationSeconds() / 60)));
  readonly boxIndices = computed(() => Array.from({ length: this.boxCount() }, (_, i) => i));

  private freshOrder(): number[] {
    const count = this.boxCount();
    return this.settings.boxClockOrder() === 'random'
      ? shuffledOrder(count)
      : Array.from({ length: count }, (_, i) => i);
  }

  readonly order = signal<number[]>([]);

  readonly consumeOrder = computed(() => {
    const map = new Map<number, number>();
    this.order().forEach((boxIndex, position) => map.set(boxIndex, position));
    return map;
  });

  readonly elapsedSeconds = computed(() =>
    Math.max(0, this.clock.totalSeconds() - this.clock.remainingSeconds()),
  );
  readonly minutesElapsed = computed(() => Math.floor(this.elapsedSeconds() / 60));
  readonly currentMinuteProgress = computed(() => (this.elapsedSeconds() % 60) / 60);

  constructor() {
    effect(() => {
      this.boxCount();
      this.settings.boxClockOrder();
      this.clock.mode();
      this.order.set(this.freshOrder());
    });
  }

  boxState(boxIndex: number): 'remaining' | 'active' | 'gone' {
    const position = this.consumeOrder().get(boxIndex) ?? 0;
    const minutesElapsed = this.minutesElapsed();
    if (position < minutesElapsed) return 'gone';
    if (position === minutesElapsed) return 'active';
    return 'remaining';
  }

  boxProgress(boxIndex: number): number {
    const position = this.consumeOrder().get(boxIndex) ?? 0;
    return position === this.minutesElapsed() ? this.currentMinuteProgress() : 0;
  }
}
