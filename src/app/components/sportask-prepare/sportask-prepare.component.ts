import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { CATALOG } from '../../../lib/sportask/catalog';
import { makePending } from '../../../lib/sportask/make-block';
import { sanitizeSettings } from '../../../lib/sportask/sanitize';
import { loadSportaskTexts, localize } from '../../../lib/sportask/texts';
import { ClockService } from '../../../services/clock.service';
import { SettingsService } from '../../../services/settings.service';
import { SportDataService } from '../../../services/sport-data.service';
import { SportaskSettingsService } from '../../../services/sportask-settings.service';
import { SportaskService } from '../../../services/sportask.service';

/**
 * Headless (lazy): while a Sportask session is active and a focus phase is running, it makes the block of the break that
 * follows (when that break carries exercise), keeps it in the session as `prepared` (the break modal takes it as its block)
 * and publishes the first exercise's name as `SportaskService.nextExerciseName`. The native end-of-focus notification is
 * scheduled when the phase starts and the WebView is frozen when it fires, so this is the only moment its text can name
 * the exercise. `AppComponent` renders it while `SportaskService.active()`; it renders nothing.
 */
@Component({
  selector: 'app-sportask-prepare',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportaskPrepareComponent {
  private readonly sportask = inject(SportaskService);
  private readonly clock = inject(ClockService);
  private readonly store = inject(SportaskSettingsService);
  private readonly data = inject(SportDataService);
  private readonly appSettings = inject(SettingsService);
  private readonly translate = inject(TranslateService);
  private token = 0;

  /** What the next block depends on; null when there is nothing to prepare (no exercise on the next break, or not in focus). */
  private readonly key = computed(() => {
    const s = this.sportask.session();
    if (!s?.active || this.sportask.single() || this.clock.mode() !== 'focus') return null;
    const n = s.breaksSeen + 1;
    if (n % s.cadence.exerciseEvery !== 0) return null;
    return JSON.stringify([n, s.mode, s.templateId, s.equipmentOverride, s.cadence, this.store.settings(), this.appSettings.language(), this.data.blocks().length, this.data.templates().length]);
  });

  constructor() {
    effect(() => {
      const key = this.key();
      // Written in a microtask, never inside the effect.
      untracked(() => queueMicrotask(() => this.prepare(key)));
    });
    inject(DestroyRef).onDestroy(() => {
      this.token++;
      this.sportask.nextExerciseName.set(null);
    });
  }

  private prepare(key: string | null): void {
    const token = ++this.token;
    const s = this.sportask.session();
    if (key === null || !s?.active) {
      this.sportask.nextExerciseName.set(null);
      return;
    }
    const n = s.breaksSeen + 1;
    const lb = s.cadence.longBreak;
    const blockSeconds = lb && n % lb.every === 0 ? lb.seconds : s.cadence.breakSeconds;
    const block = makePending({
      request: s,
      blockSeconds,
      blocks: this.data.blocks(),
      templates: this.data.templates(),
      settings: sanitizeSettings(this.store.settings()),
    });
    this.sportask.session.update((cur) => (cur?.active ? { ...cur, prepared: { breakIndex: n, block } } : cur));
    const exerciseId = block.plan.steps[0]?.exerciseId;
    const name = exerciseId ? localize(CATALOG.exercises.get(exerciseId)?.name, this.appSettings.language()) : '';
    void loadSportaskTexts(this.translate).then(() => {
      if (token === this.token) this.sportask.nextExerciseName.set(name || null);
    });
  }
}
