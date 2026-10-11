import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ProjectsService } from '../../../services/projects.service';
import { TodosService } from '../../../services/todos.service';
import type { TaskRow } from '../../../lib/project-cards';
import { KebabMenuComponent } from '../kebab-menu/kebab-menu.component';
import { TaskBadgesComponent } from '../task-badges/task-badges.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/** Rows shown before "Show all". */
const COLLAPSED_ROWS = 8;

/**
 * The inbox of the Tasks and projects page: open tasks that belong to no project. A plain list, deliberately not
 * styled like a project. Each row has a check, a title that opens Task Details, its chips and a ⋯ menu (move to a
 * project, edit, delete with a confirm bar in the row); a quick-add row sits at the bottom. With nothing in it the
 * card shrinks to one "Inbox is empty" line. `rows` are the tasks passing the page's search and tile filters,
 * `total` is the unfiltered count.
 */
@Component({
  selector: 'app-inbox-card',
  standalone: true,
  imports: [TranslatePipe, KebabMenuComponent, TaskBadgesComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inbox-card.component.html',
  styleUrl: './inbox-card.component.css',
})
export class InboxCardComponent {
  private readonly todos = inject(TodosService);
  private readonly injector = inject(Injector);
  readonly projects = inject(ProjectsService);

  readonly rows = input.required<readonly TaskRow[]>();
  readonly total = input.required<number>();
  /** A search or tile filter is on: the header shows "n of N". */
  readonly filtering = input(false);
  readonly openTask = output<string>();

  private readonly keepButton = viewChild<ElementRef<HTMLElement>>('keepButton');

  readonly showAll = signal(false);
  readonly draft = signal('');
  /** The row whose menu is showing the project list, and the row asking to confirm a delete. */
  readonly movingId = signal<string | null>(null);
  readonly confirmId = signal<string | null>(null);

  readonly visible = computed(() => (this.showAll() ? this.rows() : this.rows().slice(0, COLLAPSED_ROWS)));
  readonly hiddenCount = computed(() => Math.max(0, this.rows().length - COLLAPSED_ROWS));

  complete(todoId: string): void {
    this.todos.toggleDone(todoId);
  }

  add(): void {
    const title = this.draft().trim();
    if (!title) return;
    this.todos.addTodo({ title, importance: 'medium', urgency: 'medium', tags: [] });
    this.draft.set('');
  }

  moveTo(todoId: string, projectId: string): void {
    this.todos.updateTodo(todoId, { projectId });
  }

  askDelete(todoId: string): void {
    this.confirmId.set(todoId);
    afterNextRender(() => this.keepButton()?.nativeElement.focus(), { injector: this.injector });
  }

  deleteTask(todoId: string): void {
    this.confirmId.set(null);
    this.todos.removeTodo(todoId);
  }
}
