import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { ViewService } from '../../../services/view.service';
import { KebabMenuComponent } from '../kebab-menu/kebab-menu.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
import type { Project } from '../../../types/project';

/**
 * The ⋯ menu of a project on the Tasks and projects page (Open, Edit, New milestone, Delete), shared by the project
 * card and the project row. Editing happens in a modal the page owns (`edit`). Delete either asks the caller to
 * show its own confirmation (`deleteRequested`, which the card renders as a bar inside itself) or, with
 * `inlineConfirm`, swaps the menu to a "Delete project?" page of its own, for a row that has no room for a bar.
 */
@Component({
  selector: 'app-project-actions-menu',
  standalone: true,
  imports: [TranslatePipe, KebabMenuComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-actions-menu.component.html',
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    .confirm-text {
      margin: 0;
      padding: 0.35rem 0.6rem 0.4rem;
      font-size: 0.85rem;
      line-height: 1.35;
    }
  `,
})
export class ProjectActionsMenuComponent {
  private readonly projects = inject(ProjectsService);
  private readonly appView = inject(ViewService);
  private readonly injector = inject(Injector);

  readonly project = input.required<Project>();
  /** Ask "Delete project?" inside the menu instead of emitting `deleteRequested`. */
  readonly inlineConfirm = input(false);
  readonly edit = output<void>();
  readonly deleteRequested = output<void>();

  private readonly milestoneInput = viewChild<ElementRef<HTMLElement>>('milestoneInput');

  readonly addingMilestone = signal(false);
  readonly confirming = signal(false);
  readonly milestoneName = signal('');

  open(): void {
    this.appView.openProject(this.project().id);
  }

  startMilestone(): void {
    this.addingMilestone.set(true);
    afterNextRender(() => this.milestoneInput()?.nativeElement.focus(), { injector: this.injector });
  }

  submitMilestone(menu: { close(): void }): void {
    const name = this.milestoneName().trim();
    if (!name) return;
    this.projects.addMilestone(this.project().id, name);
    menu.close();
  }

  /** Delete: the caller's own confirmation, or this menu's second page. */
  askDelete(menu: { close(): void; focusFirst(): void }): void {
    if (this.inlineConfirm()) {
      this.confirming.set(true);
      menu.focusFirst();
    } else {
      menu.close();
      this.deleteRequested.emit();
    }
  }

  deleteProject(): void {
    this.projects.removeProject(this.project().id);
  }

  resetMenu(): void {
    this.addingMilestone.set(false);
    this.confirming.set(false);
    this.milestoneName.set('');
  }
}
