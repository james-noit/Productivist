import { afterNextRender, DestroyRef, Directive, ElementRef, HostListener, inject, input } from '@angular/core';

/**
 * Makes a `<textarea>` grow with its content up to `appAutoGrow` lines (default 12), then scroll.
 * Measured in script because `field-sizing: content` is not available in every engine the add-on runs in.
 */
@Directive({ selector: 'textarea[appAutoGrow]', standalone: true })
export class AutoGrowDirective {
  private readonly el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;
  readonly maxLines = input(12, { alias: 'appAutoGrow', transform: (v: number | string) => Number(v) || 12 });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.resize();
      if (typeof ResizeObserver === 'undefined') return;
      // A width change (layout switching between one and two columns) re-wraps the text.
      let width = this.el.clientWidth;
      const observer = new ResizeObserver(() => {
        if (this.el.clientWidth === width) return;
        width = this.el.clientWidth;
        this.resize();
      });
      observer.observe(this.el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  @HostListener('input')
  resize(): void {
    const el = this.el;
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.45;
    const chrome =
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const max = line * this.maxLines() + chrome;
    el.style.height = 'auto';
    const wanted = el.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    el.style.height = `${Math.min(wanted, max)}px`;
    el.style.overflowY = wanted > max ? 'auto' : 'hidden';
  }
}
