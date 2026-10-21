import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { loadSportaskTexts } from '../../../lib/sportask/texts';
import { ViewService } from '../../../services/view.service';

const MARGIN = 8;
const GAP = 6;
let nextId = 0;

/**
 * The hint of a Sportask control while Sportask is off. The caller projects its (`aria-disabled`, never `disabled`: a disabled
 * button gets no hover or focus) control and binds `[attr.aria-describedby]="hint.describedBy()"` on it, with `#hint` on this
 * element. Hovering with a mouse, keyboard focus or a click shows a small non-modal `role="tooltip"`: "Sportask is off..." and an
 * *Open Configuration* button (`ViewService.openConfiguration('sportask')`). A click pins it open and a second click closes it;
 * Escape (with the focus on the control or in the hint), an outside press, a scroll or the focus leaving closes it, and Escape
 * is swallowed so it does not also close the dialog the control is in (Plan my day). It is `position: fixed`, placed below the
 * control, or above when there is no room, and clamped inside the viewport and the safe areas. The strings are Sportask's lazy
 * texts, fetched the first time the hint is asked for.
 */
@Component({
  selector: 'app-sportask-off-hint',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sportask-off-hint.component.html',
  styleUrl: './sportask-off-hint.component.css',
  host: {
    '(pointerenter)': 'onEnter($event)',
    '(pointerleave)': 'onLeave($event)',
    '(focusin)': 'onFocusIn($event)',
    '(focusout)': 'onFocusOut($event)',
    '(click)': 'onClick($event)',
    '(keydown.escape)': 'onEscape($event)',
    '(document:pointerdown)': 'onOutside($event)',
    '(window:resize)': 'close()',
  },
})
export class SportaskOffHintComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly view = inject(ViewService);
  private readonly translate = inject(TranslateService);
  private readonly injector = inject(Injector);

  readonly id = `soh-${nextId++}`;

  private readonly hovered = signal(false);
  private readonly focused = signal(false);
  private readonly pinned = signal(false);
  protected readonly ready = signal(false);
  protected readonly open = computed(() => this.hovered() || this.focused() || this.pinned());
  /** Where the panel sits, once measured (it is hidden until then): `above` flips the hover bridge. */
  protected readonly pos = signal<{ left: number; top: number; above: boolean } | null>(null);

  /** What the control's `aria-describedby` should be: the hint's id while it exists. */
  readonly describedBy = computed(() => (this.open() && this.ready() ? this.id : null));

  private trigger: HTMLElement | null = null;
  /** Set while the hint hands the focus back to the control itself, which must not reopen it. */
  private refocusing = false;

  constructor() {
    effect((onCleanup) => {
      if (!this.open() || !this.ready()) {
        this.pos.set(null);
        return;
      }
      afterNextRender(() => this.place(), { injector: this.injector });
      const onScroll = (): void => this.close();
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      onCleanup(() => document.removeEventListener('scroll', onScroll, { capture: true }));
    });
  }

  private load(): void {
    if (!this.ready()) void loadSportaskTexts(this.translate).then(() => this.ready.set(true));
  }

  private place(): void {
    const panel = this.host.nativeElement.querySelector<HTMLElement>('.soh__panel');
    if (!panel) return;
    const anchor = this.host.nativeElement.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const inset = (name: string): number => parseFloat(style.getPropertyValue(name)) || 0;
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const minLeft = MARGIN + inset('--soh-inset-left');
    const maxLeft = Math.max(minLeft, width - MARGIN - inset('--soh-inset-right') - panel.offsetWidth);
    const below = anchor.bottom + GAP;
    const fitsBelow = below + panel.offsetHeight <= height - MARGIN - inset('--soh-inset-bottom');
    const top = fitsBelow ? below : Math.max(MARGIN + inset('--soh-inset-top'), anchor.top - GAP - panel.offsetHeight);
    this.pos.set({ left: Math.min(maxLeft, Math.max(minLeft, anchor.left)), top, above: !fitsBelow });
  }

  private inPanel(node: EventTarget | null): boolean {
    return node instanceof Element && node.closest('.soh__panel') !== null && this.host.nativeElement.contains(node);
  }

  protected onEnter(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    this.hovered.set(true);
    this.load();
  }

  protected onLeave(event: PointerEvent): void {
    if (event.pointerType !== 'touch') this.hovered.set(false);
  }

  protected onFocusIn(event: FocusEvent): void {
    const target = event.target;
    if (this.refocusing || !(target instanceof HTMLElement)) return;
    if (!this.inPanel(target)) this.trigger = target;
    // A press focuses the control too, and the click that follows is what toggles; only the keyboard opens the hint by focus.
    let visible = false;
    try {
      visible = target.matches(':focus-visible');
    } catch {
      visible = false;
    }
    if (visible || this.inPanel(target)) {
      this.focused.set(true);
      this.load();
    }
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && this.host.nativeElement.contains(next)) return;
    this.focused.set(false);
    this.pinned.set(false);
  }

  protected onClick(event: MouseEvent): void {
    if (this.inPanel(event.target)) return;
    // Safari does not focus a button that is pressed; the focus is what keeps Escape and Tab inside the hint's reach.
    if (event.target instanceof Element) event.target.closest<HTMLElement>('button, [tabindex]')?.focus();
    this.load();
    if (this.open() && this.pinned()) {
      this.close();
    } else {
      this.pinned.set(true);
    }
  }

  protected onEscape(event: Event): void {
    if (!this.open()) return;
    event.stopPropagation();
    event.preventDefault();
    const insideHint = this.inPanel(document.activeElement);
    this.close();
    if (insideHint) {
      this.refocusing = true;
      this.trigger?.focus();
      this.refocusing = false;
    }
  }

  protected onOutside(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  close(): void {
    this.hovered.set(false);
    this.focused.set(false);
    this.pinned.set(false);
  }

  protected openConfiguration(): void {
    this.close();
    this.view.openConfiguration('sportask');
  }
}
