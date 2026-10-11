import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewService } from '../../../services/view.service';
import { quadrantSegments, tintOf, type ProjectCardView } from '../../../lib/project-cards';
import { IconComponent } from '../icon/icon.component';
import { ProjectActionsMenuComponent } from '../project-actions-menu/project-actions-menu.component';
import { ProjectTaskRowsComponent } from '../project-task-rows/project-task-rows.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * One project in the compact list layout of the Tasks and projects page, fed by the same `ProjectCardView` as the
 * card. The grid columns come from `--plist-columns`, set by the list that holds the rows and its header, so both
 * line up. The whole row opens the project (the name button's `::after` stretches over it, like the card); the
 * chevron, the ⋯ menu and the task rows sit above it. The chevron expands the row to its next-up tasks; the page
 * keeps which rows are expanded (`expanded` / `toggleExpanded`) so a layout switch does not forget them.
 */
@Component({
  selector: 'app-project-row',
  standalone: true,
  imports: [TranslatePipe, IconComponent, ProjectActionsMenuComponent, ProjectTaskRowsComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-row.component.html',
  styleUrl: './project-row.component.css',
})
export class ProjectRowComponent {
  private readonly appView = inject(ViewService);

  readonly view = input.required<ProjectCardView>();
  readonly expanded = input(false);
  readonly toggleExpanded = output<void>();
  readonly edit = output<void>();
  readonly openTask = output<string>();

  readonly tint = computed(() => tintOf(this.view().project.id));
  readonly segments = computed(() => quadrantSegments(this.view().stats.quadrants));

  open(): void {
    this.appView.openProject(this.view().project.id);
  }
}
