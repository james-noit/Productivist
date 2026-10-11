import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * A − / + stepper for an optional whole number. `null` means "not set" and shows `emptyText`;
 * stepping down from `min` clears it, stepping up from empty sets `min`.
 */
@Component({
  selector: 'app-number-stepper',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './number-stepper.component.html',
  styleUrl: './number-stepper.component.css',
})
export class NumberStepperComponent {
  readonly value = model<number | null>(null);
  readonly min = input(1);
  readonly max = input(99);
  readonly emptyText = input('—');
  readonly decreaseLabel = input.required<string>();
  readonly increaseLabel = input.required<string>();

  readonly canDecrease = computed(() => this.value() !== null);
  readonly canIncrease = computed(() => (this.value() ?? this.min() - 1) < this.max());

  decrease(): void {
    const current = this.value();
    if (current === null) return;
    this.value.set(current <= this.min() ? null : current - 1);
  }

  increase(): void {
    const current = this.value();
    this.value.set(current === null ? this.min() : Math.min(current + 1, this.max()));
  }
}
