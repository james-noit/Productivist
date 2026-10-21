import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CATALOG } from '../../../lib/sportask/catalog';
import { hasProfile } from '../../../lib/sportask/profile';
import { type GoalTarget, goalTargets } from '../../../lib/sportask/targets';
import { SportPanelState } from '../sportask-view/sport-panel.state';

interface TargetRow {
  id: string;
  label: string;
  value: string;
  detail: string;
  percent: number;
  met: boolean;
}

/**
 * "Your objectives" on the Summary tab (0.25): the weekly targets of the enrolled program, worked out from the goal, the user's
 * profile and their history (`lib/sportask/targets.ts`), each with a progress bar. Nothing here is stored. Needs the panel state.
 */
@Component({
  selector: 'app-sportask-targets',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-targets.component.html',
  styleUrl: './sportask-targets.component.css',
})
export class SportaskTargetsComponent {
  protected readonly state = inject(SportPanelState);

  private readonly nf = computed(() => new Intl.NumberFormat(this.state.lang(), { maximumFractionDigits: 0 }));

  private readonly targets = computed(() =>
    goalTargets({ settings: this.state.settings(), history: this.state.blocks(), today: this.state.today(), catalog: CATALOG, weightKg: this.state.weightKg() ?? null }),
  );

  protected readonly rows = computed<TargetRow[]>(() => this.targets().map((t) => this.row(t)));
  protected readonly hasProfile = computed(() => hasProfile(this.state.settings().profile));

  private row(t: GoalTarget): TargetRow {
    const n = (v: number): string => this.nf().format(Math.round(v));
    const base = { id: t.id, percent: Math.round(t.progress * 100), met: t.met };
    switch (t.kind) {
      case 'days':
        return { ...base, label: this.state.t('panel.targets.days'), value: this.state.t('panel.targets.of', { current: n(t.current), target: n(t.target) }), detail: '' };
      case 'minutes':
        return { ...base, label: this.state.t('panel.targets.minutes'), value: this.state.t('panel.targets.ofMin', { current: n(t.current), target: n(t.target) }), detail: this.state.t('panel.targets.minutesNote') };
      case 'kcal':
        return { ...base, label: this.state.t('panel.targets.kcal'), value: this.state.t('panel.targets.ofKcal', { current: n(t.current), target: n(t.target) }), detail: this.state.t('panel.targets.kcalNote') };
      case 'rung': {
        const movement = this.state.t(`panel.g.${t.ladderId}`);
        const now = t.currentExerciseId ? this.state.exerciseName(t.currentExerciseId) : '';
        const next = t.targetExerciseId ? this.state.exerciseName(t.targetExerciseId) : '';
        return t.met
          ? { ...base, label: this.state.t('panel.targets.rungTop', { movement }), value: now, detail: '' }
          : { ...base, label: this.state.t('panel.targets.rung', { movement }), value: next, detail: this.state.t('panel.targets.rungNow', { name: now }) };
      }
      case 'test': {
        const def = CATALOG.assessments.get(t.assessmentId ?? '');
        const name = def ? (this.state.lang() === 'es' ? def.name.es : def.name.en) : (t.assessmentId ?? '');
        const unit = this.state.t(`panel.unit.${t.metric}`);
        return {
          ...base,
          label: name,
          value: t.met && t.target === t.current ? this.state.t('panel.targets.testDone', { current: n(t.current), unit }) : this.state.t('panel.targets.test', { target: n(t.target), unit }),
          detail: this.state.t('panel.targets.testNow', { current: n(t.current), first: n(t.from ?? t.current), unit }),
        };
      }
    }
  }

  protected openConfiguration(): void {
    this.state.openConfiguration();
  }
}
