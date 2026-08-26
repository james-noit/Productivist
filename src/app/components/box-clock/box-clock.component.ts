import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ClockService } from '../../../services/clock.service';
import { SettingsService } from '../../../services/settings.service';

type BoxState = 'remaining' | 'active' | 'gone';

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

  private freshOrder(): number[] {
    const count = this.boxCount();
    return this.settings.boxClockOrder() === 'random'
      ? shuffledOrder(count)
      : Array.from({ length: count }, (_, i) => i);
  }

  readonly order = signal<number[]>([]);

  private readonly elapsedSeconds = computed(() =>
    Math.max(0, this.clock.totalSeconds() - this.clock.remainingSeconds()),
  );
  private readonly minutesElapsed = computed(() => Math.floor(this.elapsedSeconds() / 60));
  private readonly currentMinuteProgress = computed(() => (this.elapsedSeconds() % 60) / 60);

  /**
   * The whole grid in one array. The template used to call `boxState(i)` and
   * `boxProgress(i)` per box, which meant two Map lookups per box on every change
   * detection pass — up to 360 of them for a three-hour session, every second.
   */
  readonly boxes = computed<{ index: number; state: BoxState; progress: number }[]>(() => {
    const minutesElapsed = this.minutesElapsed();
    const progress = this.currentMinuteProgress();
    // order[position] = which box is consumed at that position, so the array index is
    // the position and the value is the box — exactly what we need to walk it once.
    const count = this.boxCount();
    // Until the effect below has produced an order for the current count, fall back to
    // the identity order rather than a partially-stale one, which could map two positions
    // onto the same box and leave a hole in the array.
    const stored = this.order();
    const order = stored.length === count ? stored : null;
    const boxes = new Array<{ index: number; state: BoxState; progress: number }>(count);
    for (let position = 0; position < count; position += 1) {
      const index = order === null ? position : order[position];
      const state: BoxState = position < minutesElapsed ? 'gone' : position === minutesElapsed ? 'active' : 'remaining';
      boxes[index] = { index, state, progress: state === 'active' ? progress : 0 };
    }
    return boxes;
  });

  constructor() {
    effect(() => {
      this.boxCount();
      this.settings.boxClockOrder();
      this.clock.mode();
      this.order.set(this.freshOrder());
    });
  }
}
