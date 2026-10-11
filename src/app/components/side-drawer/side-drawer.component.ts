import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { trapTab } from '../../../lib/focus-trap';
import { lockScroll } from '../../../lib/scroll-lock';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/**
 * The offcanvas shell shared by the Tasks and projects filters and the Flow filters: a scrim, a panel that
 * slides in from the right (not at all under `prefers-reduced-motion`) with a title, a close button, a scrolling
 * body (the default slot) and a footer (the `[drawerFooter]` slot). Presentational: what is inside, and what
 * "closed" means, belong to the caller (`closed` is emitted for the close button, the scrim and Escape).
 *
 * While `open` it is a modal dialog: Tab is trapped, focus starts on the first `[data-first]` control (else the
 * first focusable one), Escape is swallowed so the project view does not also go back, and the page behind does
 * not scroll. When it closes, or is destroyed while open, focus goes back to `returnFocus` or, failing that, to
 * whatever had focus when it opened.
 */
@Component({
  selector: 'app-side-drawer',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './side-drawer.component.html',
  styleUrl: './side-drawer.component.css',
})
export class SideDrawerComponent {
  private readonly injector = inject(Injector);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  readonly open = input.required<boolean>();
  /** Translation key of the heading. */
  readonly titleKey = input.required<string>();
  /** The id of the dialog element (the heading is `<id>-title`); also what a trigger's `aria-controls` points to. */
  readonly ariaId = input.required<string>();
  /** Where focus goes back to on close; defaults to the element focused when the drawer opened. */
  readonly returnFocus = input<HTMLElement | null>(null);

  readonly closed = output<void>();

  private releaseScroll: (() => void) | null = null;
  private opener: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const open = this.open();
      untracked(() => (open ? this.onOpen() : this.onClose()));
    });
    inject(DestroyRef).onDestroy(() => this.onClose());
  }

  private onOpen(): void {
    if (this.releaseScroll) return;
    const active = document.activeElement;
    this.opener = this.returnFocus() ?? (active instanceof HTMLElement && active !== document.body ? active : null);
    this.releaseScroll = lockScroll();
    afterNextRender(
      () => {
        const panel = this.panel()?.nativeElement;
        const first = panel?.querySelector<HTMLElement>('[data-first]') ?? panel?.querySelector<HTMLElement>('.drawer__body button, .drawer__body input, .drawer__body select');
        (first ?? panel)?.focus();
      },
      { injector: this.injector },
    );
  }

  private onClose(): void {
    if (!this.releaseScroll) return;
    this.releaseScroll();
    this.releaseScroll = null;
    const opener = this.opener;
    this.opener = null;
    queueMicrotask(() => {
      if (opener?.isConnected) opener.focus();
    });
  }

  protected closeOnScrim(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    const panel = this.panel()?.nativeElement;
    if (panel) trapTab(event, panel);
  }
}
