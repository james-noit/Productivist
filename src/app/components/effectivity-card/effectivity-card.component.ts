import { Component, computed, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MultitaskService } from '../../../services/multitask.service';

@Component({
  selector: 'app-effectivity-card',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './effectivity-card.component.html',
  styleUrl: './effectivity-card.component.css',
})
export class EffectivityCardComponent {
  readonly multitask = inject(MultitaskService);
  private readonly translate = inject(TranslateService);

  readonly percentage = computed(() => {
    const value = this.multitask.efficiency();
    return value === null ? null : Math.round(value * 100);
  });

  readonly colorVar = computed(() => {
    const value = this.multitask.efficiency();
    if (value === null) return 'var(--color-text-muted)';
    if (value >= 0.9) return 'var(--color-capacity-safe)';
    if (value >= 0.75) return 'var(--color-capacity-elevated)';
    if (value >= 0.5) return 'var(--color-capacity-high)';
    return 'var(--color-capacity-critical)';
  });

  restart(): void {
    if (!window.confirm(this.translate.instant('multitask.restartCounterConfirm'))) return;
    this.multitask.resetAccomplishments();
  }
}
