import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { localize } from '../../../lib/sportask/texts';
import { SportaskService } from '../../../services/sportask.service';
import { SportaskHistoryComponent } from '../sportask-history/sportask-history.component';
import { SportaskProgressComponent } from '../sportask-progress/sportask-progress.component';
import { SportaskSetupSheetComponent } from '../sportask-setup-sheet/sportask-setup-sheet.component';
import { SportaskSkinComponent } from '../sportask-skin/sportask-skin.component';
import { SportaskSummaryComponent } from '../sportask-summary/sportask-summary.component';
import { SportaskTemplatesComponent } from '../sportask-templates/sportask-templates.component';
import { PANEL_TABS, type PanelTab, SportPanelState } from './sport-panel.state';

/**
 * The Sportask panel (view `sportask`, docs/sportask/PLAN.md section 10): the title, the enrolment line (goal, week, next test) and
 * four tabs: Summary, Progress, History and Templates. Every tab is its own component; this shell owns the tab strip and the shared
 * `SportPanelState`. The panel always wears the chosen skin (`AppComponent` also puts it on `<html>` while the view is open).
 */
@Component({
  selector: 'app-sportask-view',
  standalone: true,
  imports: [TranslatePipe, SportaskSetupSheetComponent, SportaskSkinComponent, SportaskSummaryComponent, SportaskProgressComponent, SportaskHistoryComponent, SportaskTemplatesComponent],
  providers: [SportPanelState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-view.component.html',
  styleUrl: './sportask-view.component.css',
})
export class SportaskViewComponent {
  protected readonly state = inject(SportPanelState);
  protected readonly tabs = PANEL_TABS;
  protected readonly sportask = inject(SportaskService);
  /** *Train now*: the setup sheet in its single-block mode. */
  protected readonly training = signal(false);

  /** "Strength · week 3/6 · tests this week": the enrolment in one line, or null without one. */
  protected readonly line = computed(() => {
    const goal = this.state.goal();
    const pos = this.state.position();
    const program = this.state.program();
    if (!goal || !pos || !program) return null;
    const next = this.state.nextTest();
    const parts = [localize(goal.name, this.state.lang()), this.state.t('panel.week', { n: pos.week, total: program.weeks })];
    if (next) parts.push(next.thisWeek ? this.state.t('panel.testsThisWeek') : this.state.t('panel.nextTest', { date: this.state.dayLabel(next.date) }));
    return parts;
  });

  protected select(tab: PanelTab): void {
    this.state.selectTab(tab);
  }

  protected onTabKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = PANEL_TABS[(PANEL_TABS.indexOf(this.state.tab()) + step + PANEL_TABS.length) % PANEL_TABS.length]!;
    this.select(next);
    const tablist = event.currentTarget as HTMLElement;
    queueMicrotask(() => tablist.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
  }
}
