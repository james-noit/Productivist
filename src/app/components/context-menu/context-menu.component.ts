import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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

const MARGIN = 8;

/**
 * A menu opened at a point (a right-click, a long-press, the Menu key), as opposed to `kebab-menu`'s button. It is
 * presentational: the caller projects `<button class="menu-item" role="menuitem">`s, `.menu-heading`s and
 * `<hr class="menu-sep">`s, and swaps its own content for a second "page" with an `@if`. It is placed at (`x`, `y`) in
 * viewport pixels, flipped to the other side of the point and clamped to an 8px margin when it would overflow, and
 * re-placed whenever its content changes size. Focus goes to the first item; Up/Down/Home/End move; Escape and Tab
 * close it and put focus back on `returnFocus`; a press outside, a scroll, a change of width, the window losing
 * focus or focus moving elsewhere (a dialog opening) close it without moving focus. The `.menu-item` styles are
 * its own (scoped under `.ctxmenu`) because the global ones only exist once a `kebab-menu` has rendered.
 */
@Component({
  selector: 'app-context-menu',
  exportAs: 'contextMenu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  // The panel is `position: fixed`; the host must not take a slot (or a gap) in the page's flex column.
  host: { style: 'display: contents' },
  template: `
    <div
      #panel
      class="ctxmenu"
      role="menu"
      [attr.aria-label]="label()"
      [style.left.px]="pos().x"
      [style.top.px]="pos().y"
      [style.visibility]="placed() ? null : 'hidden'"
      (keydown)="onKeydown($event)"
      (focusout)="onFocusOut($event)"
    >
      <ng-content />
    </div>
  `,
  styles: `
    .ctxmenu {
      position: fixed;
      z-index: 23;
      min-width: 13rem;
      max-width: min(20rem, calc(100vw - 16px));
      max-height: calc(100vh - 16px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      padding: 0.25rem;
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 4px 12px rgb(0 0 0 / 0.08);
    }

    .ctxmenu .menu-item {
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

    .ctxmenu .menu-item:hover,
    .ctxmenu .menu-item:focus-visible {
      background-color: var(--color-surface-alt);
    }

    .ctxmenu .menu-item:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: -2px;
    }

    .ctxmenu .menu-item--danger {
      color: var(--color-high);
    }

    .ctxmenu .menu-item__hint {
      margin-left: auto;
      padding-left: 1rem;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .ctxmenu .menu-heading {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      min-width: 0;
      padding: 0.35rem 0.6rem 0.3rem;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    .ctxmenu .menu-sep {
      height: 0;
      margin: 0.25rem 0.1rem;
      border: none;
      border-top: 1px solid var(--color-border);
    }

    .ctxmenu .confirm-text {
      margin: 0;
      padding: 0.35rem 0.6rem 0.4rem;
      font-size: 0.85rem;
      line-height: 1.35;
    }
  `,
})
export class ContextMenuComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  /** The point it opens at, in viewport pixels. */
  readonly x = input.required<number>();
  readonly y = input.required<number>();
  /** Accessible name of the menu. */
  readonly label = input.required<string>();
  /** Gets focus back when Escape or Tab closes the menu. */
  readonly returnFocus = input<HTMLElement | null>(null);
  readonly dismissed = output<void>();

  /** Hidden until measured, so it never flashes at an unclamped position. */
  readonly placed = signal(false);
  readonly pos = signal({ x: 0, y: 0 });

  private closed = false;
  private openedWidth = window.innerWidth;

  constructor() {
    afterNextRender(() => {
      this.place();
      this.placed.set(true);
      this.focusFirst();
      // A page swap (a form, a question) changes the size: keep the menu inside the viewport.
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => this.place());
        observer.observe(this.panel().nativeElement);
        this.destroyRef.onDestroy(() => observer.disconnect());
      }
    });
  }

  /** Flips to the left of / above the point when it would overflow, then clamps inside the margin. */
  private place(): void {
    const el = this.panel().nativeElement;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const fit = (point: number, size: number, limit: number): number => {
      let at = point;
      if (at + size + MARGIN > limit) at = point - size;
      return Math.max(MARGIN, Math.min(at, limit - size - MARGIN));
    };
    const next = { x: fit(this.x(), w, vw), y: fit(this.y(), h, vh) };
    const now = this.pos();
    if (next.x !== now.x || next.y !== now.y) this.pos.set(next);
  }

  /** Moves focus to the first item; call it after the caller swaps the menu's page. */
  focusFirst(): void {
    afterNextRender(() => this.items()[0]?.focus({ preventScroll: true }), { injector: this.injector });
  }

  close(returnFocus = false): void {
    if (this.closed) return;
    this.closed = true;
    if (returnFocus) {
      const target = this.returnFocus();
      if (target?.isConnected) target.focus({ preventScroll: true });
    }
    this.dismissed.emit();
  }

  private items(): HTMLElement[] {
    return Array.from(this.panel().nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"], input'));
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    if (event.key === 'Tab') {
      this.close(true);
      return;
    }
    // Inside a text field the arrows and Home/End belong to the field.
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    const items = this.items();
    if (!items.length) return;
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
    items[next].focus({ preventScroll: true });
  }

  /** Focus moving to something outside (a dialog that just opened) closes the menu. */
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.panel().nativeElement.contains(next)) this.close();
  }

  @HostListener('document:pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (!this.panel().nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('window:blur')
  @HostListener('window:scroll')
  onAway(): void {
    this.close();
  }

  /** Only a change of width closes it: a phone's on-screen keyboard changes the height while a form is in use. */
  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth !== this.openedWidth) this.close();
  }
}
