import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { sanitizeSettings } from '../../../lib/sportask/sanitize';
import { deactivate } from '../../../lib/sportask/session-ops';
import { APP_SKIN, resolveSkin } from '../../../lib/sportask/skins';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import { SportaskService } from '../../../services/sportask.service';
import { ViewService } from '../../../services/view.service';
import { SportaskBreakModalComponent } from '../sportask-break-modal/sportask-break-modal.component';
import { SportaskPrepareComponent } from '../sportask-prepare/sportask-prepare.component';
import { SportaskSkinComponent } from '../sportask-skin/sportask-skin.component';

/**
 * Everything Sportask puts outside the views, in one lazy component so `AppComponent` carries a single `@defer` for it:
 * the skin's tokens and the `data-sport-skin` attribute on <html> (while a session runs with "apply to the whole app" on, and
 * always on the Sportask panel), the headless `sportask-prepare` while a session is active, and the break modal while a break
 * is open (`--modal-z: 60`: over every view and modal, under the ringing alarm). `AppComponent` renders it while any of those
 * applies (`SportaskService.active()`, `breakOpen()` or the panel being the current view); this decides which parts show.
 */
@Component({
  selector: 'app-sportask-host',
  standalone: true,
  imports: [SportaskBreakModalComponent, SportaskPrepareComponent, SportaskSkinComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ':host { display: contents; }',
  template: `
    @if (skin()) {
      <app-sportask-skin />
    }
    @if (sportask.active()) {
      <app-sportask-prepare />
    }
    @if (sportask.breakOpen()) {
      @defer (on immediate) {
        <app-sportask-break-modal />
      }
    }
  `,
})
export class SportaskHostComponent {
  protected readonly sportask = inject(SportaskService);
  private readonly view = inject(ViewService);
  private readonly settings = inject(SportaskSettingsService);

  /** The skin id the whole app wears right now, or null. An unknown stored id resolves to the default skin. */
  protected readonly skin = computed<string | null>(() => {
    const panel = this.view.current() === 'sportask' && this.settings.enabled();
    if (!panel && !this.sportask.active()) return null;
    const s = sanitizeSettings(this.settings.settings());
    const skin = resolveSkin(s.skin);
    // The app's own theme needs no attribute (and must not get the skins' badge override).
    return skin === APP_SKIN || (!panel && !s.skinWholeApp) ? null : skin;
  });

  constructor() {
    // Sportask switched off (here or, through sync, on another device) while a session runs, a break is open or the panel is the
    // stored view: stop the session and leave the panel. (`AppComponent` already shows Pomodoro instead of the panel meanwhile.)
    effect(() => {
      if (this.settings.enabled()) return;
      untracked(() => {
        deactivate(this.sportask);
        if (this.view.current() === 'sportask') this.view.setView('pomodoro');
      });
    });
    effect((onCleanup) => {
      const skin = this.skin();
      if (skin) document.documentElement.dataset['sportSkin'] = skin;
      else delete document.documentElement.dataset['sportSkin'];
      onCleanup(() => delete document.documentElement.dataset['sportSkin']);
    });
  }
}
