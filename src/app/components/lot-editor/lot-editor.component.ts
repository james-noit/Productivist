import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import type { ExecutionLot } from '../../../services/daily-plan.service';
import { ContextMenuHostDirective, type ContextRequest } from '../../directives/context-menu-host.directive';
import { ContextMenuComponent } from '../context-menu/context-menu.component';
import { KebabMenuComponent } from '../kebab-menu/kebab-menu.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

export type LotTarget = { lotId: string } | 'newLot';

/** One open context menu, snapshotted when it opens (it lives for a few seconds). `id` is new each time. */
interface LotContextMenu {
  id: number;
  x: number;
  y: number;
  label: string;
  heading: string;
  returnFocus: HTMLElement | null;
  /** The task for a task menu; null = a lot menu. */
  taskId: string | null;
  lotId: string;
  /** The lots the task can go to (task menu). */
  targets: { id: string; n: number }[];
  canUp: boolean;
  canDown: boolean;
}

/**
 * The execution lots as a list of cards, shared by the Plan-my-day wizard's grouping step and by the Multitask
 * view's "Edit lots" drawer. Presentational: it emits `moveTask` / `moveLot` and the caller applies them.
 *
 * A task moves by tap-to-arm (tap it, then tap a lot or "New lot"), by drag and drop, or from its ⋯ "Move to…"
 * menu, which is the keyboard path; a right-click, long-press or Menu key on an unlocked task (or on an
 * unlocked, movable lot's header, for Move lot up/down) opens the same choices at the pointer through
 * `appContextMenuHost`, and locked lots open none. Lots with an index below `lockedCount` are read-only and muted; with
 * `activeIndex` set (the running plan) the active lot is marked "Now" and, like the locked ones, cannot be
 * reordered, and no lot can be moved across it.
 */
@Component({
  selector: 'app-lot-editor',
  standalone: true,
  imports: [TranslatePipe, KebabMenuComponent, UiIconComponent, ContextMenuHostDirective, ContextMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lot-editor.component.html',
  styleUrl: './lot-editor.component.css',
})
export class LotEditorComponent {
  private readonly translate = inject(TranslateService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  // --- Context menu ---

  private readonly contextMenu = signal<LotContextMenu | null>(null);
  /** The list the template loops over, so a new request re-creates the menu. */
  protected readonly contextMenus = computed(() => {
    const menu = this.contextMenu();
    return menu ? [menu] : [];
  });
  private menuSeq = 0;

  onContext(request: ContextRequest): void {
    const target = request.target;
    const lotId = target?.closest<HTMLElement>('[data-lot]')?.dataset['lot'];
    const row = lotId ? this.rows().find((r) => r.id === lotId) : undefined;
    if (!target || !row || row.locked) return;
    const taskId = target.dataset['ctx'] === 'lot-task' ? (target.dataset['task'] ?? null) : null;
    let heading: string;
    if (taskId) {
      const task = row.tasks.find((t) => t.id === taskId);
      if (!task) return;
      heading = task.title;
    } else {
      if (target.dataset['ctx'] !== 'lot' || row.active || (!row.canUp && !row.canDown)) return;
      heading = this.translate.instant('planningLab.lotLabel', { n: row.n });
    }
    this.contextMenu.set({
      id: ++this.menuSeq,
      x: request.x,
      y: request.y,
      label: heading,
      heading,
      returnFocus: request.returnFocus,
      taskId,
      lotId: row.id,
      targets: this.editable().filter((r) => r.id !== row.id).map((r) => ({ id: r.id, n: r.n })),
      canUp: row.canUp,
      canDown: row.canDown,
    });
  }

  closeContext(): void {
    this.contextMenu.set(null);
  }

  /** The task is re-created in its new lot (or the lot moves): focus follows it. */
  moveFromMenu(taskId: string, target: LotTarget, menu: { close(): void }): void {
    menu.close();
    this.moveTo(taskId, target);
    this.focusAfter(`[data-ctx="lot-task"][data-task="${CSS.escape(taskId)}"] .lot-task__title`);
  }

  moveLotFromMenu(lotId: string, dir: -1 | 1, menu: { close(): void }): void {
    menu.close();
    this.moveLot.emit({ lotId, dir });
    this.focusAfter(`.lot[data-lot="${CSS.escape(lotId)}"] .lot__order-buttons button:not([disabled])`);
  }

  private focusAfter(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
