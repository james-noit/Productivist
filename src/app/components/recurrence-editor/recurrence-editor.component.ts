import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addDays, formatIso, isIsoDate, parseIso, todayIso } from '../../../lib/dates';
import { MAX_EVERY, UNITS, WEEKDAYS, weekdayOf, weekdaySet } from '../../../lib/recurrence';
import { previewDates, weekdayNames } from '../../../lib/recurrence-format';
import { RecurrenceService } from '../../../services/recurrence.service';
import { RecurrenceFormatService } from '../../../services/recurrence-format.service';
import { SettingsService } from '../../../services/settings.service';
import type { Recurrence, RecurrenceMode, RecurrenceUnit } from '../../../types/recurrence';

/**
 * The rule part of a series as the form edits it: `every` is null while the box is empty, `weekdays` empty
 * means "the start date's weekday", `startDate` is '' until picked and `endDate` '' means never.
 */
export interface RuleDraft {
  every: number | null;
  unit: RecurrenceUnit;
  weekdays: number[];
  mode: RecurrenceMode;
  startDate: string;
  endDate: string;
}

export type RuleFields = Pick<Recurrence, 'every' | 'unit' | 'mode' | 'startDate'> & Partial<Pick<Recurrence, 'weekdays' | 'endDate'>>;

export function ruleDraftFrom(rec: RuleFields | null, startDate: string): RuleDraft {
  return rec
    ? {
        every: rec.every,
        unit: rec.unit,
        weekdays: rec.unit === 'week' ? [...(rec.weekdays ?? [])] : [],
        mode: rec.mode,
        startDate: rec.startDate,
        endDate: rec.endDate ?? '',
      }
    : { every: 1, unit: 'week', weekdays: [], mode: 'schedule', startDate, endDate: '' };
}

export function rulesEqual(a: RuleDraft, b: RuleDraft): boolean {
  return (
    a.every === b.every &&
    a.unit === b.unit &&
    a.mode === b.mode &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.weekdays.length === b.weekdays.length &&
    a.weekdays.every((d, i) => d === b.weekdays[i])
  );
}

export function ruleValid(rule: RuleDraft): boolean {
  return (
    rule.every !== null &&
    Number.isInteger(rule.every) &&
    rule.every >= 1 &&
    rule.every <= MAX_EVERY &&
    isIsoDate(rule.startDate) &&
    (rule.endDate === '' || (isIsoDate(rule.endDate) && rule.endDate >= rule.startDate))
  );
}

/** The draft as stored fields (optional ones only when set). Call only when `ruleValid(rule)`. */
export function ruleFields(rule: RuleDraft): RuleFields {
  return {
    every: rule.every ?? 1,
    unit: rule.unit,
    mode: rule.mode,
    startDate: rule.startDate,
    ...(rule.unit === 'week' && rule.weekdays.length ? { weekdays: [...rule.weekdays] } : {}),
    ...(rule.endDate ? { endDate: rule.endDate } : {}),
  };
}

let nextUid = 0;

/**
 * The rule form shared by Task Details ("Repeat…") and the recurring-tasks modal: repeat every N units, on which
 * weekdays, start and end, fixed schedule or counted from completion, and a preview of the next dates.
 */
@Component({
  selector: 'app-recurrence-editor',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recurrence-editor.component.html',
  styleUrl: './recurrence-editor.component.css',
})
export class RecurrenceEditorComponent {
  private readonly settings = inject(SettingsService);
  private readonly recurrences = inject(RecurrenceService);
  private readonly format = inject(RecurrenceFormatService);
  private readonly translate = inject(TranslateService);

  readonly rule = model.required<RuleDraft>();
  /** Date of the occurrence that already exists, if any: the preview continues after it. */
  readonly lastDate = input<string | undefined>(undefined);

  readonly uid = `rec-${nextUid++}`;
  readonly units = UNITS;
  readonly weekdays = WEEKDAYS;
  readonly maxEvery = MAX_EVERY;

  private readonly language = this.settings.language;
  readonly longNames = computed(() => weekdayNames(this.language(), 'long'));
  readonly narrowNames = computed(() => weekdayNames(this.language(), 'narrow'));

  /** The weekdays shown as on: the chosen ones, or the start date's own. */
  readonly activeDays = computed(() => {
    const rule = this.rule();
    return weekdaySet({ unit: 'week', weekdays: rule.weekdays, startDate: isIsoDate(rule.startDate) ? rule.startDate : todayIso() });
  });

  readonly everyInvalid = computed(() => {
    const every = this.rule().every;
    return every === null || !Number.isInteger(every) || every < 1 || every > MAX_EVERY;
  });
  readonly endBeforeStart = computed(() => {
    const { startDate, endDate } = this.rule();
    return isIsoDate(startDate) && isIsoDate(endDate) && endDate < startDate;
  });
  readonly startMissing = computed(() => !isIsoDate(this.rule().startDate));

  /** "1 week", "3 days": the interval of the rule as a phrase. */
  readonly interval = computed(() => {
    this.format.textsVersion();
    const rule = this.rule();
    const n = rule.every ?? 1;
    return `${n} ${this.translate.instant(`recurrence.units.${rule.unit}.${n === 1 ? 'one' : 'other'}`)}`;
  });

  private readonly dayFormat = computed(() => new Intl.DateTimeFormat(this.language(), { weekday: 'short', day: 'numeric', month: 'short' }));
  private readonly longDayFormat = computed(() => new Intl.DateTimeFormat(this.language(), { day: 'numeric', month: 'long' }));

  /** Day-of-month / date hint for month and year rules, from the start date. */
  readonly hint = computed(() => {
    const rule = this.rule();
    const start = parseIso(rule.startDate);
    if (!start) return null;
    if (rule.unit === 'month') return { key: start.getDate() > 28 ? 'recurrence.editor.monthHintClamp' : 'recurrence.editor.monthHint', params: { day: start.getDate() } };
    if (rule.unit === 'year') return { key: 'recurrence.editor.yearHint', params: { date: this.longDayFormat().format(start) } };
    return null;
  });

  /** The next three scheduled dates, formatted; empty for the after-completion mode or an ended series. */
  readonly preview = computed(() => {
    const rule = this.rule();
    if (this.everyInvalid() || this.startMissing() || this.endBeforeStart() || rule.mode !== 'schedule') return [];
    const rec: Recurrence = {
      id: 'preview',
      title: '',
      importance: 'medium',
      urgency: 'medium',
      tags: [],
      every: rule.every ?? 1,
      unit: rule.unit,
      weekdays: rule.weekdays,
      mode: rule.mode,
      startDate: rule.startDate,
      ...(rule.endDate ? { endDate: rule.endDate } : {}),
      ...(this.lastDate() ? { lastDate: this.lastDate() } : {}),
      order: 0,
      createdAt: 0,
    };
    return previewDates(rec, 3, this.recurrences.today()).map((iso) => formatIso(this.dayFormat(), iso));
  });

  readonly firstDate = computed(() => formatIso(this.dayFormat(), this.rule().startDate));

  edit(patch: Partial<RuleDraft>): void {
    this.rule.update((rule) => ({ ...rule, ...patch }));
  }

  setEvery(raw: string): void {
    const n = Number.parseInt(raw, 10);
    this.edit({ every: Number.isFinite(n) ? n : null });
  }

  setUnit(unit: RecurrenceUnit): void {
    this.edit({ unit, weekdays: unit === 'week' ? this.rule().weekdays : [] });
  }

  setDate(which: 'startDate' | 'endDate', value: string): void {
    this.edit({ [which]: isIsoDate(value) ? value : '' });
  }

  setNever(never: boolean): void {
    const { startDate, endDate } = this.rule();
    if (never) this.edit({ endDate: '' });
    else if (!endDate) this.edit({ endDate: addDays(isIsoDate(startDate) ? startDate : todayIso(), 90) });
  }

  /** Toggles a weekday; at least one stays on, and the start date's own weekday alone is stored as "none". */
  toggleDay(day: number): void {
    const rule = this.rule();
    const current = this.activeDays();
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b);
    if (!next.length) return;
    const implicit = isIsoDate(rule.startDate) ? [weekdayOf(rule.startDate)] : [];
    this.edit({ weekdays: next.length === 1 && implicit[0] === next[0] ? [] : next });
  }
}
