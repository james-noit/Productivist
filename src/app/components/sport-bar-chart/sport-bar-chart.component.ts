import { ChangeDetectionStrategy, Component, ElementRef, computed, input, viewChild } from '@angular/core';
import { type ChartGroup, barMax, barRects, labelEvery, niceTicks, numberFormatter, plotOf, scale, targetPath, toneOf } from '../../../lib/sportask/charts';
import { trackWidth } from '../../../lib/sportask/chart-width';
import { formatIso } from '../../../lib/dates';

const HEIGHT = 200;

/**
 * Bars per week (the keys are Mondays): one group = one bar per week, several groups are stacked or side by side, with an
 * optional dashed target line. Presentational: the panel passes translated labels. For screen readers it has a `role="img"`
 * summary and a visually hidden table with the same numbers.
 */
@Component({
  selector: 'app-sport-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sport-bar-chart.component.html',
  styleUrls: ['../sport-chart.shared.css', './sport-bar-chart.component.css'],
})
export class SportBarChartComponent {
  readonly title = input.required<string>();
  /** The Monday of each week, oldest first. */
  readonly keys = input.required<readonly string[]>();
  readonly groups = input.required<readonly ChartGroup[]>();
  readonly stacked = input(false);
  /** A target per week (null = none that week). */
  readonly targets = input<readonly (number | null)[] | null>(null);
  readonly targetLabel = input('');
  readonly unit = input('');
  readonly locale = input('en');

  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  protected readonly width = trackWidth(this.frame);
  protected readonly height = HEIGHT;

  private readonly numbers = computed(() => numberFormatter(this.locale()));
  private readonly dateFormat = computed(() => new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'short' }));
  protected readonly dateLabel = (iso: string): string => formatIso(this.dateFormat(), iso);

  protected readonly plot = computed(() => plotOf(this.width(), HEIGHT, { left: 36, right: 8, top: 12, bottom: 28 }));
  private readonly columns = computed(() => this.groups().map((g) => g.values));
  protected readonly ticks = computed(() => niceTicks(0, barMax(this.columns(), this.stacked(), this.targets() ?? undefined), 4));

  protected readonly yTicks = computed(() => {
    const plot = this.plot();
    const t = this.ticks();
    const y = scale(t.min, t.max, plot.bottom, plot.top);
    return t.values.map((value) => ({ value, y: y(value), label: this.numbers().format(value) }));
  });

  protected readonly xTicks = computed(() => {
    const keys = this.keys();
    const plot = this.plot();
    const slot = (plot.right - plot.left) / Math.max(1, keys.length);
    const every = labelEvery(keys.length, Math.max(2, Math.floor((plot.right - plot.left) / 56)));
    return keys.map((key, i) => ({ key, x: plot.left + (i + 0.5) * slot, label: this.dateLabel(key), show: i % every === 0 })).filter((t) => t.show);
  });

  protected readonly bars = computed(() => {
    const rects = barRects({ plot: this.plot(), groups: this.columns(), stacked: this.stacked(), max: this.ticks().max });
    const groups = this.groups();
    const keys = this.keys();
    const unit = this.unit() ? ' ' + this.unit() : '';
    return rects.map((r) => ({
      ...r,
      color: groups[r.group]!.color ?? toneOf(r.group),
      title: `${groups[r.group]!.label}, ${this.dateLabel(keys[r.index]!)}: ${this.numbers().format(r.value)}${unit}`,
    }));
  });

  protected readonly targetD = computed(() => {
    const t = this.targets();
    return t ? targetPath(this.plot(), t, this.ticks().max) : '';
  });

  protected readonly legend = computed(() => this.groups().map((g, i) => ({ id: g.id, label: g.label, color: g.color ?? toneOf(i) })));

  protected readonly summary = computed(() => {
    const n = this.numbers();
    const unit = this.unit() ? ' ' + this.unit() : '';
    const keys = this.keys();
    const last = keys.length - 1;
    const parts = this.groups().map((g) => `${g.label}: ${n.format(g.values.reduce<number>((t, v) => t + (v ?? 0), 0))}${unit}`);
    return [this.title(), ...(last >= 0 ? [`${this.dateLabel(keys[0]!)} – ${this.dateLabel(keys[last]!)}`] : []), ...parts].join('. ');
  });

  protected readonly table = computed(() => {
    const n = this.numbers();
    const targets = this.targets();
    return this.keys().map((key, i) => ({
      key,
      label: this.dateLabel(key),
      cells: this.groups().map((g) => n.format(g.values[i] ?? 0)),
      target: targets?.[i] != null ? n.format(targets[i]!) : '',
    }));
  });
}
