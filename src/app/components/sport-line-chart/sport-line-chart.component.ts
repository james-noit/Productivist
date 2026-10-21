import { ChangeDetectionStrategy, Component, ElementRef, computed, input, viewChild } from '@angular/core';
import { type ChartGroup, type Pt, linePath, labelEvery, niceTicks, numberFormatter, plotOf, scale, timeScaleX, toneOf } from '../../../lib/sportask/charts';
import { trackWidth } from '../../../lib/sportask/chart-width';
import { formatIso } from '../../../lib/dates';

const HEIGHT = 200;
/** Marker shapes besides the colour, so a series is not told apart by colour alone. */
const SHAPES = ['circle', 'square', 'diamond'] as const;

/**
 * A line chart over dates (a time scale, so tests taken at uneven intervals are drawn unevenly): one line per group, a gap where a
 * group has no value, optionally stepped (levels). Presentational: the panel passes translated labels. For screen readers it has a
 * `role="img"` summary and a visually hidden table with the same numbers.
 */
@Component({
  selector: 'app-sport-line-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sport-line-chart.component.html',
  styleUrls: ['../sport-chart.shared.css', './sport-line-chart.component.css'],
})
export class SportLineChartComponent {
  readonly title = input.required<string>();
  /** ISO days, oldest first. */
  readonly keys = input.required<readonly string[]>();
  readonly groups = input.required<readonly ChartGroup[]>();
  readonly unit = input('');
  readonly locale = input('en');
  readonly stepped = input(false);
  /** Fixed ends of the y axis (otherwise fitted to the data). */
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);

  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  protected readonly width = trackWidth(this.frame);
  protected readonly height = HEIGHT;

  private readonly numbers = computed(() => numberFormatter(this.locale()));
  private readonly dateFormat = computed(() => new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'short' }));
  protected readonly dateLabel = (iso: string): string => formatIso(this.dateFormat(), iso);

  protected readonly plot = computed(() => plotOf(this.width(), HEIGHT, { left: 40, right: 14, top: 12, bottom: 28 }));

  /** The y axis: the data's range (padded when every value is the same, so one point is not squeezed on an edge), whole-number steps for whole numbers. */
  protected readonly ticks = computed(() => {
    const values = this.groups().flatMap((g) => g.values).filter((v): v is number => v !== null);
    let lo = this.min() ?? (values.length ? Math.min(...values) : 0);
    let hi = this.max() ?? (values.length ? Math.max(...values) : 1);
    if (hi <= lo) {
      const pad = Math.max(1, Math.round(Math.abs(lo) * 0.1));
      lo -= pad;
      hi += pad;
    }
    const whole = values.every((v) => Number.isInteger(v)) || this.stepped();
    return niceTicks(lo, hi, 4, whole);
  });

  protected readonly yTicks = computed(() => {
    const plot = this.plot();
    const t = this.ticks();
    const y = scale(t.min, t.max, plot.bottom, plot.top);
    return t.values.map((value) => ({ value, y: y(value), label: this.numbers().format(value) }));
  });

  protected readonly xTicks = computed(() => {
    const keys = this.keys();
    const x = timeScaleX(keys, this.plot());
    const every = labelEvery(keys.length, Math.max(2, Math.floor(this.width() / 70)));
    return keys.map((key, i) => ({ key, x: x(key), label: this.dateLabel(key), show: i % every === 0 })).filter((t) => t.show);
  });

  protected readonly lines = computed(() => {
    const plot = this.plot();
    const t = this.ticks();
    const y = scale(t.min, t.max, plot.bottom, plot.top);
    const x = timeScaleX(this.keys(), plot);
    const keys = this.keys();
    const stepped = this.stepped();
    return this.groups().map((g, gi) => {
      const pts: (Pt | null)[] = g.values.map((v, i) => (v === null ? null : { x: x(keys[i]!), y: y(v) }));
      const marks = pts.flatMap((p, i) =>
        p
          ? [{ x: p.x, y: p.y, title: `${g.label}, ${this.dateLabel(keys[i]!)}: ${this.numbers().format(g.values[i]!)}${this.unit() ? ' ' + this.unit() : ''}` }]
          : [],
      );
      return { id: g.id, label: g.label, color: g.color ?? toneOf(gi), shape: SHAPES[gi % SHAPES.length]!, dashed: gi % 2 === 1, path: linePath(pts, stepped), marks };
    });
  });

  protected readonly summary = computed(() => {
    const n = this.numbers();
    const parts = this.groups().map((g) => {
      const values = g.values.filter((v): v is number => v !== null);
      if (values.length === 0) return '';
      return `${g.label}: ${n.format(values[0]!)} → ${n.format(values[values.length - 1]!)}${this.unit() ? ' ' + this.unit() : ''}`;
    });
    return [this.title(), ...parts.filter(Boolean)].join('. ');
  });

  protected readonly table = computed(() => {
    const n = this.numbers();
    return this.keys().map((key, i) => ({ key, label: this.dateLabel(key), cells: this.groups().map((g) => (g.values[i] === null || g.values[i] === undefined ? '' : n.format(g.values[i]!))) }));
  });
}
