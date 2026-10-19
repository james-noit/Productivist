import { Directive, ElementRef, effect, inject, input } from '@angular/core';

/**
 * Makes an `<a>` point at an external http(s) URL, set from code: a bound `[href]` would pull Angular's URL
 * sanitizer into whichever chunk first uses it, and the URLs here (a repository, an issue, a token page) come from
 * rows that were validated on import and sync. Anything that is not http(s) leaves the link inert. Opens in a new
 * tab without a referrer.
 */
@Directive({ selector: 'a[appExternalHref]', standalone: true })
export class ExternalHrefDirective {
  private readonly el = inject<ElementRef<HTMLAnchorElement>>(ElementRef);
  readonly url = input.required<string>({ alias: 'appExternalHref' });

  constructor() {
    effect(() => {
      const a = this.el.nativeElement;
      const url = this.url();
      if (/^https?:\/\//i.test(url)) {
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      } else {
        a.removeAttribute('href');
      }
    });
  }
}
