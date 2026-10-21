import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { addDays, startOfWeek } from '../../../lib/dates';
import { CATALOG } from '../../../lib/sportask/catalog';
import { weekStats } from '../../../lib/sportask/metrics/summary';
import { SportaskTargetsComponent } from '../sportask-targets/sportask-targets.component';
import { SportaskMetricChartComponent } from '../sportask-metric-chart/sportask-metric-chart.component';
import { SportPanelState } from '../sportask-view/sport-panel.state';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/** Weeks of the activity heatmap. */
const HEAT_WEEKS = 12;

/** The Summary tab: this week's tiles, the last 12 weeks as a heatmap and the goal's headline chart. */
@Component({
  selector: 'app-sportask-summary',
  standalone: true,
  imports: [TranslatePipe, SportaskMetricChartComponent, SportaskTargetsComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-summary.component.html',
  styleUrl: './sportask-summary.component.css',
})
export class SportaskSummaryComponent {
  protected readonly state = inject(SportPanelState);

  protected readonly hasBlocks = computed(() => this.state.blocks().length > 0);

  private readonly nf = computed(() => new Intl.NumberFormat(this.state.lang(), { maximumFractionDigits: 0 }));
  private readonly stats = computed(() => weekStats(this.state.blocks(), this.state.today(), CATALOG, this.state.weightKg() ?? null));

  protected readonly tiles = computed(() => {
    const s = this.stats();
    const nf = this.nf();
    return [
      { id: 'blocks', label: this.state.t('panel.tile.blocks'), value: `${s.counted} / ${s.offered}`, hint: '' },
      { id: 'minutes', label: this.state.t('panel.tile.minutes'), value: nf.format(Math.round(s.activeMinutes)), hint: '' },
      { id: 'streak', label: this.state.t('panel.tile.streak'), value: s.streak === 1 ? this.state.t('panel.tile.day') : this.state.t('panel.tile.days', { n: s.streak }), hint: '' },
      s.kcal === null
        ? { id: 'kcal', label: this.state.t('panel.tile.kcal'), value: '—', hint: this.state.t('panel.tile.kcalHint') }
        : { id: 'kcal', label: this.state.t('panel.tile.kcal'), value: `≈ ${nf.format(Math.round(s.kcal))} kcal`, hint: '' },
    ];
  });

  protected readonly heatRange = computed(() => ({ from: addDays(startOfWeek(this.state.today()), -(HEAT_WEEKS - 1) * 7), to: this.state.today() }));
  protected readonly chartRange = computed(() => ({ from: addDays(startOfWeek(this.state.today()), -(HEAT_WEEKS - 1) * 7), to: this.state.today() }));

  /** The goal's first metric that is not the heatmap or a test; adherence without a goal. */
  protected readonly headlineId = computed(() => this.state.metricIds()?.find((id) => id !== 'heatmap' && !id.startsWith('assessment:')) ?? 'adherence');

  protected goProgress(): void {
    this.state.selectTab('progress');
  }
}
