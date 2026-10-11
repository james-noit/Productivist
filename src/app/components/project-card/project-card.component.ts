import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import { ViewService } from '../../../services/view.service';
import { QUADRANTS } from '../../../lib/eisenhower';
import { tintOf, type ProjectCardView } from '../../../lib/project-cards';
import { IconComponent } from '../icon/icon.component';
import { KebabMenuComponent } from '../kebab-menu/kebab-menu.component';
import { RepeatMarkComponent } from '../repeat-mark/repeat-mark.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * One project on the Tasks and projects page. The whole card opens the project: the title is the real button and
 * its `::after` stretches over the card, while the controls that do something else (the ⋯ menu, a task's check
 * and title) sit above it. Everything shown comes from `view`, built once per change by the page, so the card
 * itself computes nothing per task. Editing happens in a modal the page owns (`edit`); the rest is handled here.
 */
@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [TranslatePipe, IconComponent, KebabMenuComponent, RepeatMarkComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.css',
})
export class ProjectCardComponent {
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);
  private readonly appView = inject(ViewService);
  private readonly injector = inject(Injector);

  readonly view = input.required<ProjectCardView>();
  readonly edit = output<void>();
  readonly openTask = output<string>();

  private readonly keepButton = viewChild<ElementRef<HTMLElement>>('keepButton');
  private readonly milestoneInput = viewChild<ElementRef<HTMLElement>>('milestoneInput');

  readonly confirming = signal(false);
  readonly addingMilestone = signal(false);
  readonly milestoneName = signal('');

  readonly tint = computed(() => tintOf(this.view().project.id));

  /** The quadrants that have open tasks, in the Eisenhower order, as the segments of the share bar. */
  readonly segments = computed(() => {
    const counts = this.view().stats.quadrants;
    return QUADRANTS.map((q) => ({ key: q.key, css: q.cssKey, labelKey: q.labelKey, count: counts[q.key] })).filter((s) => s.count > 0);
  });

  open(): void {
    this.appView.openProject(this.view().project.id);
  }

  complete(todoId: string): void {
    this.todos.toggleDone(todoId);
  }

  startMilestone(): void {
    this.addingMilestone.set(true);
    afterNextRender(() => this.milestoneInput()?.nativeElement.focus(), { injector: this.injector });
  }

  submitMilestone(menu: { close(): void }): void {
    const name = this.milestoneName().trim();
    if (!name) return;
    this.projects.addMilestone(this.view().project.id, name);
    menu.close();
  }

  resetMenu(): void {
    this.addingMilestone.set(false);
    this.milestoneName.set('');
  }

  askDelete(): void {
    this.confirming.set(true);
    afterNextRender(() => this.keepButton()?.nativeElement.focus(), { injector: this.injector });
  }

  deleteProject(): void {
    this.projects.removeProject(this.view().project.id);
  }
}
