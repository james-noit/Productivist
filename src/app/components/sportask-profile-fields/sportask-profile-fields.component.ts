import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ACTIVITY_LEVELS, PROFILE_LIMITS, REACH_LEVELS, hasProfile } from '../../../lib/sportask/profile';
import type { ActivityLevel, ReachLevel, SportProfile } from '../../../types/sportask';
import { NumberStepperComponent } from '../number-stepper/number-stepper.component';

type NumberKey = 'pushUps' | 'squats' | 'plankSeconds';

let nextId = 0;

/**
 * The "About you" block of Configuration > Sportask and of the setup wizard (0.25): how active the user is, the days a week they want
 * to train and an optional quick baseline (push-ups, squats, plank, toe reach). Every answer is optional and can be cleared; the
 * program starts from them and the weekly objectives scale with them. Presentational: `value` in, `changed` out (an object with only
 * the answers that are set). Needs the Sportask texts loaded by the parent.
 */
@Component({
  selector: 'app-sportask-profile-fields',
  standalone: true,
  imports: [TranslatePipe, NumberStepperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-profile-fields.component.html',
  styleUrl: './sportask-profile-fields.component.css',
})
export class SportaskProfileFieldsComponent {
  readonly value = input.required<SportProfile>();
  readonly changed = output<SportProfile>();

  protected readonly uid = `spf${nextId++}`;
  protected readonly activities = ACTIVITY_LEVELS;
  protected readonly reaches = REACH_LEVELS;
  protected readonly limits = PROFILE_LIMITS;
  protected readonly any = computed(() => hasProfile(this.value()));

  /** The new profile with `key` set, or removed when `value` is undefined. */
  private emit(key: keyof SportProfile, value: SportProfile[keyof SportProfile]): void {
    const next: Record<string, unknown> = { ...this.value() };
    if (value === undefined) delete next[key];
    else next[key] = value;
    this.changed.emit(next as SportProfile);
  }

  /** Picking the answer that is already chosen clears it. */
  protected pickActivity(a: ActivityLevel): void {
    this.emit('activity', this.value().activity === a ? undefined : a);
  }

  protected pickReach(r: ReachLevel): void {
    this.emit('reach', this.value().reach === r ? undefined : r);
  }

  protected setDays(n: number | null): void {
    this.emit('daysPerWeek', n ?? undefined);
  }

  /** A typed number; empty (or not a number) clears it. */
  protected setNumber(key: NumberKey, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.trim().replace(',', '.');
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) {
      this.emit(key, undefined);
      input.value = '';
      return;
    }
    const { min, max } = PROFILE_LIMITS[key];
    const clean = Math.min(max, Math.max(min, Math.round(n)));
    input.value = String(clean);
    this.emit(key, clean);
  }

  protected clear(): void {
    this.changed.emit({});
  }
}
