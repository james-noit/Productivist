import { DestroyRef, Directive, ElementRef, inject, input, output } from '@angular/core';

/** A press this long (ms) on touch, without moving more than `LONG_PRESS_SLOP` px, opens the context menu. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

/** Where the native menu is always left alone: text fields, links and editable text. */
const NATIVE_MENU_TARGETS = 'input, textarea, select, a[href], [contenteditable=""], [contenteditable="true"]';
/** Dialogs, drawers and ⋯ menus: the native menu stays only for the ones that lie inside the host. */
const OVERLAYS = '[aria-modal="true"], [role="dialog"], .kebab__panel';
/** What a pointer-opened menu gives focus back to when it has no better idea: the target's first control. */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What `contextRequested` carries. */
export interface ContextRequest {
  /** Viewport pixels the menu opens at. */
  x: number;
  y: number;
  /** The `contextTargets` element that was pressed (the closest one), or null when the press landed elsewhere in the host. */
  target: HTMLElement | null;
  /** Where focus goes back to when the menu closes: the focused element for the keyboard, the target itself if it is a control, else its first control, for the pointer. */
  returnFocus: HTMLElement | null;
}

/**
 * The trigger side of a context menu, for any container: right-click, a 500 ms touch long-press and the Menu key /
 * Shift+F10 on the host emit `contextRequested` with the point, the matched `contextTargets` element and the element
 * focus should return to; the caller renders the menu (usually `context-menu`) and decides what it offers. It sets
 * nothing visible. `contextTargets` is the selector of the elements that have their own menu (the closest one wins);
 * with `contextFallback` off a press anywhere else keeps the browser's menu, with it on it emits `target: null`.
 * The browser's own menu is left alone with Shift held, over text fields, links, `[contenteditable]` and selected text,
 * and inside a dialog, drawer or ⋯ menu that lies *inside* the host (a dialog opened on top of this content); a dialog
 * that contains the host is its own container and is ignored, so a host inside Plan my day or a drawer still works.
 * It also owns the click that follows a long-press (swallowed once), the Menu key's duplicate `contextmenu` event
 * (1 s) and Android's duplicate on a long-press (800 ms). `.ctxmenu` itself always swallows the event.
 */
@Directive({
  selector: '[appContextMenuHost]',
  standalone: true,
  host: {
    '(contextmenu)': 'onContextMenu($event)',
    '(keydown)': 'onKeydown($event)',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerEnd()',
    '(pointercancel)': 'onPointerEnd()',
  },
})
export class ContextMenuHostDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Selector of the elements that have their own menu. */
  readonly contextTargets = input('[data-ctx]');
  /** Whether a press anywhere else in the host opens a menu with `target: null`. */
  readonly contextFallback = input(true);
  /** Optional selector, inside a target, of the control a pointer-opened menu returns focus to (default: its first control). */
  readonly contextFocus = input('');
  readonly contextRequested = output<ContextRequest>();

  private press: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  /** A long-press opened the menu: the click that follows the finger lifting must not also activate what is under it. */
  private swallowClick = false;
  private touchMenuAt = 0;
  private keyMenuAt = 0;

  constructor() {
    const host = this.host;
    const swallow = (event: Event): void => {
      if (!this.swallowClick) return;
      this.swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    host.addEventListener('click', swallow, true);
    inject(DestroyRef).onDestroy(() => {
      host.removeEventListener('click', swallow, true);
      this.cancelPress();
    });
  }

  /** Right-click. Shift, text fields, links, selected text and dialogs inside the host keep the browser's own menu. */
  onContextMenu(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.ctxmenu')) {
      event.preventDefault();
      return;
    }
    // The Menu key fires a contextmenu event of its own on some platforms (button 0): the keydown already opened the menu.
    if (event.button === 0 && !event.ctrlKey && performance.now() - this.keyMenuAt < 1000) {
      event.preventDefault();
      return;
    }
    // Android Chrome fires contextmenu on a long-press too, just before or after our own timer.
    if (performance.now() - this.touchMenuAt < 800) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey || this.native(target) || this.selectionAt(event.clientX, event.clientY)) return;
    const matched = this.match(target);
    if (!matched && !this.contextFallback()) return;
    event.preventDefault();
    if (this.press) {
      this.swallowClick = true;
      this.touchMenuAt = performance.now();
    }
    this.cancelPress();
    this.emit(event.clientX, event.clientY, matched, null);
  }

  /** The Menu key or Shift+F10 opens the menu at the bottom-left of the focused target or control. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest('.ctxmenu') || this.native(target)) return;
    const matched = this.match(target);
    if (!matched && !this.contextFallback()) return;
    event.preventDefault();
    this.keyMenuAt = performance.now();
    const rect = (matched ?? target).getBoundingClientRect();
    this.emit(rect.left, rect.bottom, matched, target);
  }

  onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('.ctxmenu') || this.native(target)) return;
    const matched = this.match(target);
    if (!matched && !this.contextFallback()) return;
    this.cancelPress();
    const { clientX: x, clientY: y } = event;
    const timer = setTimeout(() => {
      this.press = null;
      this.swallowClick = true;
      this.touchMenuAt = performance.now();
      this.emit(x, y, matched, null);
    }, LONG_PRESS_MS);
    this.press = { x, y, timer };
  }

  onPointerMove(event: PointerEvent): void {
    const press = this.press;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP) this.cancelPress();
  }

  onPointerEnd(): void {
    this.cancelPress();
    // The click of a long-press arrives right after the finger lifts; do not let the flag outlive it.
    if (this.swallowClick) setTimeout(() => (this.swallowClick = false), 350);
  }

  private cancelPress(): void {
    if (this.press) clearTimeout(this.press.timer);
    this.press = null;
  }

  /** The closest `contextTargets` element inside the host. */
  private match(from: Element): HTMLElement | null {
    const found = from.closest<HTMLElement>(this.contextTargets());
    return found && this.host.contains(found) ? found : null;
  }

  /** Whether the browser's own menu is the right one here. */
  private native(from: Element): boolean {
    if (from.closest(NATIVE_MENU_TARGETS)) return true;
    const overlay = from.closest(OVERLAYS);
    return !!overlay && overlay !== this.host && this.host.contains(overlay);
  }

  private emit(x: number, y: number, target: HTMLElement | null, focused: HTMLElement | null): void {
    let returnFocus = focused;
    if (!returnFocus) {
      const selector = this.contextFocus();
      const inside = target
        ? ((selector && target.querySelector<HTMLElement>(selector)) || (target.matches(FOCUSABLE) ? target : target.querySelector<HTMLElement>(FOCUSABLE)))
        : null;
      const active = document.activeElement;
      returnFocus = inside ?? (active instanceof HTMLElement && active !== document.body ? active : null);
    }
    this.contextRequested.emit({ x, y, target, returnFocus });
  }

  /** Whether the click lands on selected text, where the browser's own menu (Copy…) is the useful one. */
  private selectionAt(x: number, y: number): boolean {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) return false;
    for (const rect of Array.from(selection.getRangeAt(0).getClientRects())) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;
    }
    return false;
  }
}
