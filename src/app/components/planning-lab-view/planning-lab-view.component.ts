import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewService } from '../../../services/view.service';
import { DailyBacklogViewComponent } from '../daily-backlog-view/daily-backlog-view.component';
import { GeneralBacklogViewComponent } from '../general-backlog-view/general-backlog-view.component';

@Component({
  selector: 'app-planning-lab-view',
  standalone: true,
  imports: [TranslatePipe, DailyBacklogViewComponent, GeneralBacklogViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planning-lab-view.component.html',
  styleUrl: './planning-lab-view.component.css',
})
export class PlanningLabViewComponent {
  private readonly view = inject(ViewService);

  readonly tab = this.view.planningLabTab;
}
