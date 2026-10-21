import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Carries the Sportask skins' stylesheet (docs/sportask/PLAN.md section 9.2) and nothing else: no template content, no logic.
 * The CSS is global (`ViewEncapsulation.None`) and keyed by `data-sport-skin`, so rendering this component is what "installs"
 * the skins, and destroying the last one removes them again: with Sportask off, no skin rule exists in the page. It lives in a
 * lazy chunk. `AppComponent` renders it while the whole-app skin applies; the Sportask surfaces (break modal, setup sheet) render
 * their own, so their look never depends on AppComponent. Several instances at once share one stylesheet.
 */
@Component({
  selector: 'app-sportask-skin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { hidden: '', 'aria-hidden': 'true' },
  template: '',
  styleUrl: './sportask-skin.component.css',
})
export class SportaskSkinComponent {}
