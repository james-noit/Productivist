import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { ViewService } from '../../../services/view.service';
import { quadrantSegments, tintOf, type ProjectCardView } from '../../../lib/project-cards';
import { forgeName } from '../../../lib/forge-flavors';
import { IconComponent } from '../icon/icon.component';
import { ProjectActionsMenuComponent } from '../project-actions-menu/project-actions-menu.component';
import { ProjectTaskRowsComponent } from '../project-task-rows/project-task-rows.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * One project on the Tasks and projects page. The whole card opens the project: the title is the real button and
 * its `::after` stretches over the card, while the controls that do something else (the ⋯ menu, a task's check
 * and title) sit above it. Everything shown comes from `view`, built once per change by the page, so the card
 * itself computes nothing per task. Editing happens in a modal the page owns (`edit`); the ⋯ menu is
 * `project-actions-menu`, whose Delete is confirmed by the bar inside the card.
 */
@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [TranslatePipe, IconComponent, ProjectActionsMenuComponent, ProjectTaskRowsComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.css',
})
export class ProjectCardComponent {
  protected readonly forgeName = forgeName;
  private readonly projects = inject(ProjectsService);
  private readonly appView = inject(ViewService);
  private readonly injector = inject(Injector);

  readonly view = input.required<ProjectCardView>();
  readonly edit = output<void>();
  readonly openTask = output<string>();

  private readonly keepButton = viewChild<ElementRef<HTMLElement>>('keepButton');

  readonly confirming = signal(false);

  readonly tint = computed(() => tintOf(this.view().project.id));

  /** The quadrants that have open tasks, in the Eisenhower order, as the segments of the share bar. */
  readonly segments = computed(() => quadrantSegments(this.view().stats.quadrants));

  open(): void {
    this.appView.openProject(this.view().project.id);
  }

  askDelete(): void {
    this.confirming.set(true);
    afterNextRender(() => this.keepButton()?.nativeElement.focus(), { injector: this.injector });
  }

  deleteProject(): void {
    this.projects.removeProject(this.view().project.id);
  }
}
