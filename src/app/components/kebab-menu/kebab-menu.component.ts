import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  ViewEncapsulation,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * A "more actions" button with a small popover menu. Put `<button class="menu-item" role="menuitem">` elements
 * inside; each one decides whether the menu closes (call `close()` through a template reference:
 * `<app-kebab-menu #menu="kebabMenu">` ... `(click)="...; menu.close()"`), so an item can also switch the menu to
 * another page of items. Escape closes it and returns focus to the button, Up/Down move between items and a
 * click anywhere else closes it. The `.menu-item` styles are global (encapsulation off) because the items belong
 * to the caller's template.
 */
@Component({
  selector: 'app-kebab-menu',
  exportAs: 'kebabMenu',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <button
      #toggle
      type="button"
      class="btn btn--ghost btn--icon btn--sm kebab__toggle"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="label()"
      [title]="label()"
      (click)="toggleMenu()"
    >
      <app-ui-icon name="more" />
    </button>
    @if (open()) {
      <div class="kebab__panel" [class.kebab__panel--start]="align() === 'start'" role="menu" [attr.aria-label]="label()" (keydown)="onPanelKeydown($event)">
        <ng-content />
      </div>
    }
  `,
  styles: `
    app-kebab-menu {
      position: relative;
      display: inline-flex;
      flex: none;
    }

    .kebab__panel {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      z-index: 20;
      min-width: 12rem;
      max-width: min(20rem, 80vw);
      display: flex;
      flex-direction: column;
      padding: 0.25rem;
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 4px 12px rgb(0 0 0 / 0.08);
    }

    .kebab__panel--start {
      right: auto;
      left: 0;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      width: 100%;
      min-height: 34px;
      padding: 0.3rem 0.6rem;
      background: none;
      border: none;
      border-radius: 6px;
      color: var(--color-text);
      font-family: inherit;
      font-size: 0.9rem;
      text-align: left;
      cursor: pointer;
    }

    .menu-item:hover,
    .menu-item:focus-visible {
      background-color: var(--color-surface-alt);
    }

    .menu-item:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: -2px;
    }

    .menu-item--danger {
      color: var(--color-high);
    }

    .menu-item--back {
      color: var(--color-text-muted);
    }

    .menu-item__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .menu-heading {
      padding: 0.35rem 0.6rem 0.2rem;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .menu-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.4rem 0.45rem 0.45rem;
    }
  `,
})
export class KebabMenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');

  /** Accessible name and tooltip of the ⋯ button. */
  readonly label = input.required<string>();
  /** Which edge of the button the panel lines up with: 'end' (default) opens leftwards, 'start' rightwards. */
  readonly align = input<'start' | 'end'>('end');
  /** Emits when the menu closes, so a caller can reset a multi-page menu. */
  readonly closed = output<void>();

  readonly open = signal(false);

  toggleMenu(): void {
    if (this.open()) this.close();
    else {
      this.open.set(true);
      this.focusFirst();
    }
  }

  /** Moves focus to the first item once the panel has rendered; call it after an item swaps the menu's page. */
  focusFirst(): void {
    afterNextRender(() => this.items()[0]?.focus(), { injector: this.injector });
  }

  close(returnFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    this.closed.emit();
    if (returnFocus) this.toggle().nativeElement.focus();
  }

  private items(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.kebab__panel [role="menuitem"], .kebab__panel input'));
  }

  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    // Inside a text field the arrows belong to the field.
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    const items = this.items();
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length].focus();
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
}
