import { ChangeDetectionStrategy, Component, ElementRef, computed, input, viewChild } from '@angular/core';
import { heatLayout } from '../../../lib/sportask/charts';
import { trackWidth } from '../../../lib/sportask/chart-width';
import { addDays, formatIso, startOfWeek } from '../../../lib/dates';

const LABEL_W = 22;
const MONTH_H = 16;
const MAX_CELL = 22;
const GAP = 3;

/**
 * Activity per day as a calendar grid: weeks are columns (oldest left), Monday to Sunday are rows, and the colour is how many
 * blocks that day had. Presentational. For screen readers it has a `role="img"` summary and a visually hidden table of the days that
 * had activity.
 */
@Component({
  selector: 'app-sport-heatmap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sport-heatmap.component.html',
  styleUrls: ['../sport-chart.shared.css', './sport-heatmap.component.css'],
})
export class SportHeatmapComponent {
  readonly title = input.required<string>();
  /** Consecutive ISO days, oldest first. */
  readonly keys = input.required<readonly string[]>();
  readonly values = input.required<readonly (number | null)[]>();
  readonly locale = input('en');
  /** "Less" / "More" for the legend. */
  readonly lessLabel = input('');
  readonly moreLabel = input('');
  /** The unit for a tooltip: "{{n}} blocks". */
  readonly unit = input('');

  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  protected readonly width = trackWidth(this.frame);

  private readonly dateFormat = computed(() => new Intl.DateTimeFormat(this.locale(), { weekday: 'short', day: 'numeric', month: 'short' }));
  private readonly monthFormat = computed(() => new Intl.DateTimeFormat(this.locale(), { month: 'short' }));
  private readonly weekdayFormat = computed(() => new Intl.DateTimeFormat(this.locale(), { weekday: 'narrow' }));

  private readonly layout = computed(() => heatLayout(this.keys(), this.values()));

  /** Cell size follows the width (at most MAX_CELL) so 12 weeks fit a phone and 52 stay readable. */
  protected readonly cell = computed(() => {
    const cols = Math.max(1, this.layout().cols);
    return Math.max(6, Math.min(MAX_CELL, Math.floor((this.width() - LABEL_W - GAP * (cols - 1)) / cols)));
  });
  protected readonly step = computed(() => this.cell() + GAP);
  protected readonly svgWidth = computed(() => LABEL_W + this.layout().cols * this.step());
  protected readonly svgHeight = computed(() => MONTH_H + 7 * this.step());

  protected readonly cells = computed(() => {
    const step = this.step();
    const unit = this.unit();
    return this.layout().cells.map((c) => ({
      x: LABEL_W + c.col * step,
      y: MONTH_H + c.row * step,
      level: c.level,
      date: c.date,
      title: `${formatIso(this.dateFormat(), c.date)}: ${c.value}${unit ? ' ' + unit : ''}`,
    }));
  });

  protected readonly months = computed(() => this.layout().monthStarts.map((m) => ({ x: LABEL_W + m.col * this.step(), label: formatIso(this.monthFormat(), m.date) })));

  /** Mon, Wed, Fri only, so the labels do not crowd the small cells. */
  protected readonly weekdays = computed(() => {
    const monday = startOfWeek('2026-03-02');
    return [0, 2, 4].map((row) => ({ y: MONTH_H + row * this.step() + this.cell() / 2, label: formatIso(this.weekdayFormat(), addDays(monday, row)) }));
  });

  protected readonly levels = [0, 1, 2, 3, 4];

  protected readonly total = computed(() => this.values().reduce<number>((t, v) => t + (v ?? 0), 0));
  protected readonly summary = computed(() => `${this.title()}: ${this.total()}${this.unit() ? ' ' + this.unit() : ''}`);
  protected readonly table = computed(() => {
    const out: { date: string; label: string; value: number }[] = [];
    this.keys().forEach((date, i) => {
      const v = this.values()[i] ?? 0;
      if (v > 0) out.push({ date, label: formatIso(this.dateFormat(), date), value: v });
    });
    return out;
  });
}
