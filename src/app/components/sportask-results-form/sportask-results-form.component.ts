import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { ResultRow } from '../../../lib/sportask/results';
import type { Feedback, MetricKind } from '../../../types/sportask';
import { NumberStepperComponent } from '../number-stepper/number-stepper.component';

const FEEDBACKS: readonly Feedback[] = ['tooEasy', 'ok', 'tooHard'];
const RPES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const STEPPER_MAX: Record<MetricKind, number> = { reps: 1000, seconds: 3600, cm: 1000 };

/**
 * The Results form of a block: one row per exercise (checked, value, weight), how it felt and the effort. Shared by the break
 * modal's last screen and the history's "Edit marks" dialog; both own the state and bind it two ways. Presentational: no services.
 * Tests (`test`) enter a free number and have no "how it felt" or effort.
 */
@Component({
  selector: 'app-sportask-results-form',
  standalone: true,
  imports: [TranslatePipe, NumberStepperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-results-form.component.html',
  styleUrl: './sportask-results-form.component.css',
})
export class SportaskResultsFormComponent {
  readonly rows = model.required<ResultRow[]>();
  readonly feedback = model<Feedback | null>('ok');
  readonly rpe = model<number | null>(null);
  readonly test = input(false);

  protected readonly feedbacks = FEEDBACKS;
  protected readonly rpes = RPES;
  protected readonly maxOf = (metric: MetricKind): number => STEPPER_MAX[metric];

  /** Writing a value means the step was done. */
  protected setValue(key: string, value: number | null): void {
    this.rows.update((rows) => rows.map((r) => (r.key === key ? { ...r, value, done: r.done || value !== null } : r)));
  }

  protected setNumber(key: string, event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim().replace(',', '.');
    const n = Number(raw);
    this.setValue(key, raw === '' || !Number.isFinite(n) ? null : Math.min(100000, Math.max(-1000, n)));
  }

  protected setLoad(key: string, loadKg: number | null): void {
    this.rows.update((rows) => rows.map((r) => (r.key === key ? { ...r, loadKg } : r)));
  }

  protected toggleDone(key: string): void {
    this.rows.update((rows) => rows.map((r) => (r.key === key ? { ...r, done: !r.done } : r)));
  }

  protected setRpe(value: number): void {
    this.rpe.update((current) => (current === value ? null : value));
  }
}
