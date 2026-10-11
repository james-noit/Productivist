import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ViewService } from '../../../services/view.service';
import { UiIconComponent, type UiIconName } from '../ui-icon/ui-icon.component';

/** One entry of the menu. `id` is what `pick` emits; `shortcut` is a single letter that picks it from anywhere. */
export interface FabItem {
  id: string;
  icon: UiIconName;
  labelKey: string;
  shortcut?: string;
}

let nextUid = 0;

/**
 * The floating "+" shared by the Tasks and projects page and the Flow presentation: a round button at the bottom
 * right whose menu opens upwards. Presentational: the caller passes the `items` and maps `pick` to its own
 * actions (the dialogs belong to the page). It also owns the single-letter shortcuts of the items, which are
 * ignored while typing, with a modifier, or while any dialog that does not contain the button is open. It sits
 * above the header's floating support pill on phones through `--floating-bottom-offset` (see `style.css`) and
 * below modal overlays; with `[contained]` it is positioned inside its nearest positioned ancestor instead of the
 * viewport (the Flow focus mode), without that offset.
 */
@Component({
  selector: 'app-fab-menu',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fab-menu.component.html',
  styleUrl: './fab-menu.component.css',
  host: { '[class.fab-menu--contained]': 'contained()' },
})
export class FabMenuComponent {
  private readonly view = inject(ViewService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');

  readonly items = input.required<readonly FabItem[]>();
  /** Position inside the nearest positioned ancestor instead of the viewport. */
  readonly contained = input(false);
  readonly pick = output<string>();

  readonly open = signal(false);
  protected readonly menuId = `fab-menu-${nextUid++}`;

  toggleMenu(): void {
    if (this.open()) this.close();
    else this.show(0);
  }

  private show(index: number): void {
    this.open.set(true);
    afterNextRender(() => this.menuItems().at(index)?.focus(), { injector: this.injector });
  }

  close(returnFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.toggle().nativeElement.focus();
  }

  choose(id: string): void {
    this.open.set(false);
    // Focus goes back here when the dialog closes, since the menu item that was clicked is gone by then; callers
    // that need to restore it read `document.activeElement`, which is the button from here on.
    this.toggle().nativeElement.focus();
    this.pick.emit(id);
  }

  private menuItems(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }

  onToggleKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.show(event.key === 'ArrowUp' ? this.items().length - 1 : 0);
    }
  }

  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    const items = this.menuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (index + 1) % items.length;
        break;
      case 'ArrowUp':
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  /** Tabbing out of the menu closes it, like a click elsewhere. */
  @HostListener('focusout', ['$event'])
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (this.open() && next && !this.host.nativeElement.contains(next)) this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  /** An item's letter picks it: not while typing, with a modifier, or while a dialog that does not hold this button is open. */
  @HostListener('document:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const item = this.items().find((i) => i.shortcut?.toLowerCase() === key);
    if (!item) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"], [data-menu]'))) return;
    if (this.view.planningOpen() || this.view.configOpen() || this.view.recurringOpen()) return;
    const host = this.host.nativeElement;
    if (Array.from(document.querySelectorAll('[aria-modal="true"]')).some((el) => !el.contains(host))) return;
    event.preventDefault();
    this.open.set(false);
    this.pick.emit(item.id);
  }
}
