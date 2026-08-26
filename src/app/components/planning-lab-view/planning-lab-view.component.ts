import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { DailyBacklogViewComponent } from '../daily-backlog-view/daily-backlog-view.component';
import { GeneralBacklogViewComponent } from '../general-backlog-view/general-backlog-view.component';

type PlanningLabTab = 'daily' | 'general';

@Component({
  selector: 'app-planning-lab-view',
  standalone: true,
  imports: [TranslatePipe, DailyBacklogViewComponent, GeneralBacklogViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planning-lab-view.component.html',
  styleUrl: './planning-lab-view.component.css',
})
export class PlanningLabViewComponent {
  readonly tab = localStorageSignal<PlanningLabTab>('productivist.planningLabTab', 'daily');
}
