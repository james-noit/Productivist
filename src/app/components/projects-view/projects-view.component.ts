import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ProjectsPanelComponent } from '../projects-panel/projects-panel.component';

@Component({
  selector: 'app-projects-view',
  standalone: true,
  imports: [TranslatePipe, ProjectsPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-view.component.html',
  styleUrl: './projects-view.component.css',
})
export class ProjectsViewComponent {}
