import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { UiIconComponent, type UiIconName } from '../ui-icon/ui-icon.component';

export type BarKind = 'objective' | 'milestone' | 'nomilestone' | 'task';
export type BarAction = 'edit' | 'link' | 'status' | 'collapse' | 'delete' | 'open';
/** The question the bar can ask instead of showing its actions. */
export type BarConfirm = 'delete' | 'horizon';

interface BarButton {
  id: BarAction;
  icon: UiIconName;
  labelKey: string;
  /** The key that does the same from the keyboard, shown in the tooltip. */
  key: string | null;
  /** Icon only, even on a wide screen. */
  iconOnly: boolean;
  danger: boolean;
  popup: boolean;
}

let nextUid = 0;

/**
 * The little toolbar the Flow diagram floats next to its selected node (`flow-canvas` positions it from the
 * node's rect and the viewport): Edit, Link..., Mark achieved, Delete for an objective; Edit, Link..., Collapse for
 * a milestone card; Collapse for the "No milestone" card; Open and Link... for a task row. With `confirm` set it
 * shows an inline question instead (delete this objective, or change its horizon and lose some links), with
 * focus on the committing button. Presentational: it reports what was asked and the canvas does it. Escape
 * answers the question, or else dismisses the selection, and never reaches the project view.
 */
@Component({
  selector: 'app-flow-selection-bar',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-selection-bar.component.html',
  styleUrl: './flow-selection-bar.component.css',
  host: {
    'data-ui': '',
    // A click on the bar must not take focus off the node (a card or the canvas): keyboard users keep their place.
    '(mousedown)': '$event.preventDefault()',
    '(keydown)': 'onKeydown($event)',
  },
})
export class FlowSelectionBarComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly confirmButton = viewChild<ElementRef<HTMLElement>>('confirmButton');

  readonly kind = input.required<BarKind>();
  /** The node's name, for the accessible name of the toolbar. */
  readonly name = input('');
  /** Objective only: its status is achieved, so the status button offers to reopen it. */
  readonly achieved = input(false);
  /** Cards only: the card is collapsed. */
  readonly collapsed = input(false);
  /** The link menu opened from this bar is showing. */
  readonly menuOpen = input(false);
  readonly confirm = input<BarConfirm | null>(null);

  readonly action = output<BarAction>();
  /** The committing answer of a question. */
  readonly confirmed = output<void>();
  /** The safe answer of a question (or Escape on it). */
  readonly cancelled = output<void>();
  /** Escape while no question is open: drop the selection. */
  readonly dismissed = output<void>();

  protected readonly uid = `flow-bar-${nextUid++}`;

  protected readonly buttons = computed<BarButton[]>(() => {
    const button = (id: BarAction, icon: UiIconName, labelKey: string, key: string | null, extra: Partial<BarButton> = {}): BarButton => ({
      id,
      icon,
      labelKey,
      key,
      iconOnly: false,
      danger: false,
      popup: false,
      ...extra,
    });
    const collapse = button('collapse', this.collapsed() ? 'chevron-right' : 'chevron-down', this.collapsed() ? 'flow.expand' : 'flow.collapse', null);
    switch (this.kind()) {
      case 'objective':
        return [
          button('edit', 'edit', 'projects.edit', 'E'),
          button('link', 'link', 'flow.bar.link', 'L', { popup: true }),
          this.achieved()
            ? button('status', 'undo', 'flow.bar.markActive', 'A')
            : button('status', 'check', 'flow.bar.markAchieved', 'A'),
          button('delete', 'trash', 'todo.delete', 'Delete', { iconOnly: true, danger: true }),
        ];
      case 'milestone':
        return [button('edit', 'edit', 'projects.edit', 'E'), button('link', 'link', 'flow.bar.link', 'L', { popup: true }), collapse];
      case 'nomilestone':
        return [collapse];
      case 'task':
        return [button('open', 'open', 'flow.bar.open', 'Enter'), button('link', 'link', 'flow.bar.link', 'L', { popup: true })];
    }
  });

  constructor() {
    // A question takes focus onto its committing button; answering returns it to the node (the canvas does that).
    effect(() => {
      if (this.confirm()) afterNextRender(() => this.confirmButton()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.confirm()) this.cancelled.emit();
      else this.dismissed.emit();
      return;
    }
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step || event.altKey || event.ctrlKey || event.metaKey) return;
    const items = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('button'));
    const index = items.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    items[(index + step + items.length) % items.length].focus();
  }
}
