import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DailyPlanService } from '../../../services/daily-plan.service';
import { ViewService, type ProjectsTab } from '../../../services/view.service';
import { EisenhowerViewComponent } from '../eisenhower-view/eisenhower-view.component';
import { ProjectsPanelComponent } from '../projects-panel/projects-panel.component';

const TABS: readonly ProjectsTab[] = ['projects', 'matrix'];

@Component({
  selector: 'app-projects-view',
  standalone: true,
  // EisenhowerViewComponent is only used inside a @defer block, so it gets its own chunk.
  imports: [TranslatePipe, ProjectsPanelComponent, EisenhowerViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-view.component.html',
  styleUrl: './projects-view.component.css',
})
export class ProjectsViewComponent {
  readonly view = inject(ViewService);
  private readonly dailyPlan = inject(DailyPlanService);

  /** True once the wizard holds anything worth coming back to, so the button reads "Resume". */
  readonly planInProgress = computed(() => this.dailyPlan.stage() !== 'prompt' || this.dailyPlan.hasAnyObjective());
  readonly planStep = computed(() => this.dailyPlan.stepIndex() + 1);

  selectTab(tab: ProjectsTab): void {
    this.view.openProjectsTab(tab);
  }

  /** Left/Right move between the two tabs, wrapping, and take focus with them. */
  onTabKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(this.view.projectsTab()) + step + TABS.length) % TABS.length];
    this.selectTab(next);
    const tablist = event.currentTarget as HTMLElement;
    queueMicrotask(() => tablist.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
  }
}
