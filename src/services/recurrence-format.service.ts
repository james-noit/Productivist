import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { describeRule, nextDate } from '../lib/recurrence-format';
import { RecurrenceService } from './recurrence.service';
import { SettingsService } from './settings.service';
import type { Recurrence } from '../types/recurrence';

/**
 * How recurring series read to a person: "Every week on Mon, Thu" and the date the next occurrence comes. Split from
 * RecurrenceService so this text machinery (and lib/recurrence-format.ts) only ships with the lazy UI that shows it,
 * never in the initial bundle. Reactive to the language: `textsVersion` changes whenever translations load or the
 * language switches, and `describe` reads it, so a computed that calls `describe` re-runs.
 */
@Injectable({ providedIn: 'root' })
export class RecurrenceFormatService {
  private readonly recurrences = inject(RecurrenceService);
  private readonly settings = inject(SettingsService);
  private readonly translate = inject(TranslateService);

  /** Bumped when translations load or the language changes: read it in a computed that calls `translate.instant`. */
  readonly textsVersion = signal(0);

  constructor() {
    this.translate.onTranslationChange.subscribe(() => this.textsVersion.update((n) => n + 1));
    this.translate.onLangChange.subscribe(() => this.textsVersion.update((n) => n + 1));
  }

  /** "Every week on Mon, Thu"; reads the language, so it is reactive when called inside a computed. */
  describe(rec: Pick<Recurrence, 'every' | 'unit' | 'weekdays' | 'mode' | 'startDate'>): string {
    this.textsVersion();
    return describeRule(rec, this.settings.language(), (key, params) => this.translate.instant(key, params));
  }

  /** The date this series produces next (null: over, or waiting for the open occurrence to be completed). */
  nextDateOf(rec: Recurrence): string | null {
    return nextDate(rec, this.recurrences.occurrencesBySeries().get(rec.id) ?? [], this.recurrences.today());
  }
}
