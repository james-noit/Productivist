import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CADENCES, MAX_BREAK_SECONDS, MAX_FOCUS_SECONDS, MIN_CUSTOM_FOCUS_SECONDS, MIN_DURATION_SECONDS, clampCadence, resolveCadence, type CadenceValues } from '../../../lib/sportask/cadences';
import type { RhythmValue } from '../../../lib/sportask/setup';
import { localize } from '../../../lib/sportask/texts';
import { SettingsService } from '../../../services/settings.service';
import { NumberStepperComponent } from '../number-stepper/number-stepper.component';

const minutes = (seconds: number): number => seconds / 60;
let nextId = 0;

/**
 * The rhythm block of Configuration > Sportask and of the setup wizard: the preset rows and the custom cadence. Presentational:
 * `value` is the preset id (or `custom`) with the stored custom values, `changed` the new pair.
 */
@Component({
  selector: 'app-sportask-rhythm-fields',
  standalone: true,
  imports: [TranslatePipe, NumberStepperComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-rhythm-fields.component.html',
  styleUrl: './sportask-rhythm-fields.component.css',
})
export class SportaskRhythmFieldsComponent {
  readonly value = input.required<RhythmValue>();
  readonly changed = output<RhythmValue>();

  protected readonly uid = `srf${nextId++}`;
  private readonly lang = inject(SettingsService).language;

  protected readonly limits = {
    focusMin: minutes(MIN_CUSTOM_FOCUS_SECONDS),
    focusMax: minutes(MAX_FOCUS_SECONDS),
    breakMin: minutes(MIN_DURATION_SECONDS),
    breakMax: minutes(MAX_BREAK_SECONDS),
  };

  protected readonly cadenceId = computed(() => this.value().cadenceId);
  /** The values the custom fields show (the stored custom cadence, or the current preset to start from). */
  protected readonly custom = computed<CadenceValues>(() => {
    const v = this.value();
    return v.customCadence ?? resolveCadence({ cadenceId: v.cadenceId, customCadence: undefined });
  });
  protected readonly rows = computed(() => {
    const lang = this.lang();
    return CADENCES.all.map((c) => ({
      id: c.id,
      name: localize(c.name, lang),
      focus: this.fmt(minutes(c.focusSeconds)),
      brk: this.fmt(minutes(c.breakSeconds)),
      longMin: c.longBreak ? this.fmt(minutes(c.longBreak.seconds)) : null,
      longEvery: c.longBreak?.every ?? 0,
      every: c.exerciseEvery,
    }));
  });

  private fmt(n: number): string {
    return new Intl.NumberFormat(this.lang(), { maximumFractionDigits: 1 }).format(n);
  }

  protected pickCadence(id: string): void {
    if (id === 'custom') this.changed.emit({ cadenceId: 'custom', customCadence: this.custom() });
    else this.changed.emit({ ...this.value(), cadenceId: id });
  }

  /** Emits the clamped custom cadence and returns it (the input only sees the new `value` after the parent's next render). */
  private setCustom(change: Partial<CadenceValues>, clear?: 'longBreak'): CadenceValues {
    const next: CadenceValues = { ...this.custom(), ...change };
    if (clear) delete next.longBreak;
    const clamped = clampCadence(next);
    this.changed.emit({ cadenceId: 'custom', customCadence: clamped });
    return clamped;
  }

  /** A length typed in minutes (half minutes allowed); the clamped value is written back so the box never lies. */
  protected onMinutes(event: Event, field: 'focusSeconds' | 'breakSeconds' | 'longSeconds'): void {
    const input = event.target as HTMLInputElement;
    const n = Number(input.value.replace(',', '.'));
    const current = this.custom();
    if (input.value.trim() === '' || !Number.isFinite(n)) {
      input.value = String(minutes(field === 'longSeconds' ? (current.longBreak?.seconds ?? 0) : current[field]));
      return;
    }
    const stored =
      field === 'longSeconds' ? this.setCustom({ longBreak: { every: current.longBreak?.every ?? 4, seconds: n * 60 } }) : this.setCustom({ [field]: n * 60 });
    input.value = String(minutes(field === 'longSeconds' ? (stored.longBreak?.seconds ?? 0) : stored[field]));
  }

  protected toggleLongBreak(): void {
    if (this.custom().longBreak) this.setCustom({}, 'longBreak');
    else this.setCustom({ longBreak: { every: 4, seconds: 900 } });
  }

  protected setLongEvery(value: number | null): void {
    const lb = this.custom().longBreak;
    if (lb && value !== null) this.setCustom({ longBreak: { ...lb, every: value } });
  }

  protected setExerciseEvery(value: number | null): void {
    if (value !== null) this.setCustom({ exerciseEvery: value });
  }
}
