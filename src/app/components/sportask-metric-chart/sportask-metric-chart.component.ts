import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { type ChartGroup, toneOf } from '../../../lib/sportask/charts';
import { METRICS } from '../../../lib/sportask/metrics';
import type { DateRange } from '../../../lib/sportask/metrics';
import { localize } from '../../../lib/sportask/texts';
import { SportBarChartComponent } from '../sport-bar-chart/sport-bar-chart.component';
import { SportHeatmapComponent } from '../sport-heatmap/sport-heatmap.component';
import { SportLineChartComponent } from '../sport-line-chart/sport-line-chart.component';
import { SportPanelState } from '../sportask-view/sport-panel.state';

/** Block statuses keep the same colours everywhere: done is the green, partly done the amber, skipped the muted grey. */
const STATUS_COLORS: Record<string, string> = { done: toneOf(2), partial: toneOf(3), skipped: 'var(--color-text-muted)' };

/** Metrics that carry a one-line explanation under the title (`sportask.panel.note.<id>`). */
const WITH_NOTE = new Set(['setsPerPattern', 'zonesCovered', 'density', 'netKcal', 'ladderLevel', 'adherence']);

/**
 * One metric of the registry drawn as the chart that fits it (bars, stacked bars, line, heatmap), with its title, a note, the empty
 * and "needs your weight" states, and for an assessment the best value and the change since the first test. Used by the Summary
 * and Progress tabs.
 */
@Component({
  selector: 'app-sportask-metric-chart',
  standalone: true,
  imports: [TranslatePipe, SportBarChartComponent, SportHeatmapComponent, SportLineChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-metric-chart.component.html',
  styleUrl: './sportask-metric-chart.component.css',
})
export class SportaskMetricChartComponent {
  readonly metricId = input.required<string>();
  readonly range = input.required<DateRange>();
  /** Show the title (the Summary tab puts its own above the chart). */
  readonly heading = input(true);

  protected readonly state = inject(SportPanelState);

  private readonly def = computed(() => METRICS.get(this.metricId()));
  protected readonly isAssessment = computed(() => this.metricId().startsWith('assessment:'));
  protected readonly title = computed(() => localize(this.def()?.name, this.state.lang()));
  protected readonly unit = computed(() => localize(this.def()?.unit, this.state.lang()));
  protected readonly note = computed(() => (WITH_NOTE.has(this.metricId()) ? this.state.t(`panel.note.${this.metricId()}`) : ''));

  protected readonly series = computed(() => this.def()?.compute(this.state.blocks(), this.range(), this.state.env()) ?? null);

  protected readonly groups = computed<ChartGroup[]>(() =>
    (this.series()?.groups ?? []).map((g) => {
      const color = STATUS_COLORS[g.id];
      return { id: g.id, label: this.state.t(`panel.g.${g.id}`), values: g.values, ...(color ? { color } : {}) };
    }),
  );

  /** Whether there is anything to draw (a bar chart of all zeros is "nothing yet"). */
  protected readonly hasData = computed(() => this.groups().some((g) => g.values.some((v) => v !== null && v !== 0)));

  protected readonly lineBounds = computed(() => (this.metricId() === 'density' ? { min: 0, max: 100 } : { min: null, max: null }));

  protected readonly summaries = computed(() => {
    const series = this.series();
    if (!series || !this.isAssessment()) return [];
    const nf = new Intl.NumberFormat(this.state.lang(), { maximumFractionDigits: 1 });
    const unit = this.unit();
    return series.groups.flatMap((g) => {
      const s = g.summary;
      if (!s) return [];
      const side = series.groups.length > 1 ? this.state.t(`panel.g.${g.id}`) : '';
      const delta = (s.delta > 0 ? '+' : '') + nf.format(s.delta);
      return [{ id: g.id, side, best: `${nf.format(s.best)} ${unit}`, delta: `${delta} ${unit}`, improved: s.improved, flat: s.improved === null }];
    });
  });

  /** "Plank, then Desk plank": the test was done with different exercises over time. */
  protected readonly changedNote = computed(() => {
    const ids = this.series()?.exerciseIds ?? [];
    return this.isAssessment() && ids.length > 1 ? this.state.t('panel.changedExercise', { list: ids.map((id) => this.state.exerciseName(id)).join(' → ') }) : '';
  });
}
