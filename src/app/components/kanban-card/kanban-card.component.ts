import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BOARD_COLUMNS, columnOf, type BoardColumnKey } from '../../../lib/kanban';
import { TodosService } from '../../../services/todos.service';
import { TaskBadgesComponent } from '../task-badges/task-badges.component';
import type { Milestone } from '../../../types/project';
import type { Todo } from '../../../types/todo';

/**
 * A card on the project board. Draggable with the mouse; the "Move" menu is the keyboard and touch
 * path to the same moves. Moves are reported to the board, which owns the swimlane context.
 */
@Component({
  selector: 'app-kanban-card',
  standalone: true,
  imports: [TranslatePipe, TaskBadgesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kanban-card.component.html',
  styleUrl: './kanban-card.component.css',
})
export class KanbanCardComponent {
  private readonly todos = inject(TodosService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly todo = input.required<Todo>();
  /** Milestone name shown as a chip; the board passes it only when swimlanes are off. */
  readonly milestoneName = input<string | null>(null);
  /** Milestones offered by the menu's "Milestone" section; empty hides it (flat board). */
  readonly moveMilestones = input<readonly Milestone[]>([]);

  readonly open = output<void>();
  readonly moveColumn = output<BoardColumnKey>();
  /** `null` = no milestone. */
  readonly moveMilestone = output<string | null>();
  /** A card was dropped on this one: the board inserts the dragged card before it. */
  readonly cardDrop = output<DragEvent>();

  readonly columns = BOARD_COLUMNS;
  readonly menuOpen = signal(false);
  readonly dragging = computed(() => this.todos.draggedId() === this.todo().id);
  readonly column = computed(() => columnOf(this.todo()));

  onDragStart(event: DragEvent): void {
    this.menuOpen.set(false);
    // Firefox starts no drag without data.
    event.dataTransfer?.setData('text/plain', this.todo().id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.todos.startDrag(this.todo().id);
  }

  onDragEnd(): void {
    this.todos.endDrag();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.open.emit();
    }
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((v) => !v);
  }

  chooseColumn(key: BoardColumnKey): void {
    this.menuOpen.set(false);
    this.moveColumn.emit(key);
  }

  chooseMilestone(id: string | null): void {
    this.menuOpen.set(false);
    this.moveMilestone.emit(id);
  }

  /** Closes the menu when focus leaves the card (Tab away, or a click elsewhere). */
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.host.nativeElement.contains(next)) this.menuOpen.set(false);
  }

  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.menuOpen.set(false);
      this.host.nativeElement.querySelector<HTMLElement>('.kanban-card__move')?.focus();
    }
  }
}
