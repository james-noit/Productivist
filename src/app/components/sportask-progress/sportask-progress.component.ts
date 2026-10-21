import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FREE_METRIC_IDS, METRICS } from '../../../lib/sportask/metrics';
import { SportaskMetricChartComponent } from '../sportask-metric-chart/sportask-metric-chart.component';
import { SportPanelState } from '../sportask-view/sport-panel.state';

const RANGES: readonly number[] = [4, 12, 52, 0];

/** The Progress tab: a range picker, one chart per metric of the goal, then its tests (best value and change since the first one). */
@Component({
  selector: 'app-sportask-progress',
  standalone: true,
  imports: [TranslatePipe, SportaskMetricChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-progress.component.html',
  styleUrl: './sportask-progress.component.css',
})
export class SportaskProgressComponent {
  protected readonly state = inject(SportPanelState);
  protected readonly ranges = RANGES;

  /** Without a goal the free-training metrics; the Strength tab hint appears when no band or weight is owned (pull is limited). */
  private readonly ids = computed(() => this.state.metricIds() ?? FREE_METRIC_IDS);
  protected readonly charts = computed(() => this.ids().filter((id) => !id.startsWith('assessment:')));
  protected readonly tests = computed(() => this.ids().filter((id) => id.startsWith('assessment:')));

  /**
   * Strength: bodyweight pulling tops out at the second rung (CONTENT 3.1). When nothing to pull with is owned and the user has
   * reached it, say how to go on.
   */
  protected readonly pullHint = computed(() => {
    if (this.state.goal()?.id !== 'strength') return false;
    const eq = this.state.settings().equipment;
    if (['band', 'dumbbells', 'kettlebell'].some((id) => eq[id]?.owned)) return false;
    const first = this.state.firstDate();
    if (!first) return false;
    const series = METRICS.get('ladderLevel')?.compute(this.state.blocks(), { from: first, to: this.state.today() }, this.state.env());
    const values = series?.groups.find((g) => g.id === 'pull')?.values.filter((v): v is number => v !== null) ?? [];
    return (values[values.length - 1] ?? 0) >= 2;
  });

  protected readonly hasBlocks = computed(() => this.state.blocks().length > 0);

  protected setWeeks(n: number): void {
    this.state.weeks.set(n);
  }
}
