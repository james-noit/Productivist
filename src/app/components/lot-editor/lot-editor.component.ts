import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { ExecutionLot } from '../../../services/daily-plan.service';
import { KebabMenuComponent } from '../kebab-menu/kebab-menu.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

export type LotTarget = { lotId: string } | 'newLot';

/**
 * The execution lots as a list of cards, shared by the Plan-my-day wizard's grouping step and by the Multitask
 * view's "Edit lots" drawer. Presentational: it emits `moveTask` / `moveLot` and the caller applies them.
 *
 * A task moves by tap-to-arm (tap it, then tap a lot or "New lot"), by drag and drop, or from its ⋯ "Move to…"
 * menu, which is the keyboard path. Lots with an index below `lockedCount` are read-only and muted; with
 * `activeIndex` set (the running plan) the active lot is marked "Now" and, like the locked ones, cannot be
 * reordered, and no lot can be moved across it.
 */
@Component({
  selector: 'app-lot-editor',
  standalone: true,
  imports: [TranslatePipe, KebabMenuComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lot-editor.component.html',
  styleUrl: './lot-editor.component.css',
})
export class LotEditorComponent {
  readonly lots = input.required<readonly ExecutionLot[]>();
  /** Lots with an index below this are read-only. */
  readonly lockedCount = input(0);
  /** The running plan's active lot (marked "Now"); null in the wizard. */
  readonly activeIndex = input<number | null>(null);
  readonly titles = input.required<ReadonlyMap<string, string>>();
  readonly doneIds = input.required<ReadonlySet<string>>();

  readonly moveTask = output<{ taskId: string; target: LotTarget }>();
  readonly moveLot = output<{ lotId: string; dir: -1 | 1 }>();

  /** The task picked up by a tap or a drag, waiting for a lot. */
  readonly armed = signal<string | null>(null);

  /** Lots that may still receive tasks. */
  private readonly firstEditable = computed(() => this.lockedCount());
  /** Lots at this index or later can be reordered (the active lot itself cannot). */
  private readonly firstMovable = computed(() => {
    const active = this.activeIndex();
    return active === null ? this.lockedCount() : active + 1;
  });

  readonly rows = computed(() => {
    const lots = this.lots();
    const titles = this.titles();
    const done = this.doneIds();
    const firstEditable = this.firstEditable();
    const firstMovable = this.firstMovable();
    const active = this.activeIndex();
    return lots.map((lot, i) => ({
      id: lot.id,
      n: i + 1,
      locked: i < firstEditable,
      active: i === active,
      canUp: i > firstMovable,
      canDown: i >= firstMovable && i < lots.length - 1,
      tasks: lot.taskIds
        .filter((id) => titles.has(id))
        .map((id) => ({ id, title: titles.get(id) ?? '', done: done.has(id) })),
    }));
  });

  /** The lots a task can be moved to from its menu: the editable ones. */
  readonly editable = computed(() => this.rows().filter((row) => !row.locked));

  toggleArmed(taskId: string): void {
    this.armed.update((current) => (current === taskId ? null : taskId));
  }

  arm(taskId: string): void {
    this.armed.set(taskId);
  }

  disarm(): void {
    this.armed.set(null);
  }

  /** Places the armed task (or the one being dragged) into a lot. */
  place(target: LotTarget): void {
    const taskId = this.armed();
    if (!taskId) return;
    this.armed.set(null);
    this.moveTask.emit({ taskId, target });
  }

  moveTo(taskId: string, target: LotTarget): void {
    this.armed.set(null);
    this.moveTask.emit({ taskId, target });
  }
}
