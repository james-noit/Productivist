import { DestroyRef, type ElementRef, type Signal, afterNextRender, inject, signal } from '@angular/core';

/**
 * The width in px of an element, kept up to date with a ResizeObserver, so a chart can draw its SVG at the size it is shown
 * (text stays readable on a phone instead of a fixed viewBox being scaled down). Call it from a constructor or field initialiser.
 * `fallback` is used until the first measurement (and where there is no layout, such as a prerender).
 */
export function trackWidth(frame: Signal<ElementRef<HTMLElement> | undefined>, fallback = 320): Signal<number> {
  const width = signal(fallback);
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    const node = frame()?.nativeElement;
    if (!node) return;
    const measure = (): void => {
      const w = Math.round(node.clientWidth);
      if (w > 0) width.set(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    destroyRef.onDestroy(() => observer.disconnect());
  });
  return width;
}
