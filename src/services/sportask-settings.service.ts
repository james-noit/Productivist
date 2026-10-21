import { Injectable, computed, inject, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { SPORTASK_DEFAULTS, sportaskSwitch } from '../lib/sportask-defaults';
import type { SportaskSettings } from '../types/sportask';
import { SportDataService } from './sport-data.service';
import { SportaskService } from './sportask.service';

const KEY = 'productivist.sportask';
const DEFAULTS_JSON = JSON.stringify(SPORTASK_DEFAULTS);

/** Storage can throw (private windows, blocked site data): then Sportask counts as untouched. */
function storedDiffersFromDefaults(): boolean {
  try {
    const stored = localStorage.getItem(KEY);
    return stored !== null && stored !== DEFAULTS_JSON;
  } catch {
    return false;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The user's Sportask settings, stored as they are (no validation: that code would sit in the initial bundle).
 * Lazy consumers read `sanitizeSettings(settings())`, which fills defaults for anything missing or unknown.
 * They travel in the sync blob as `settings.sportask`; the body weight is health data and stays on this device.
 */
@Injectable({ providedIn: 'root' })
export class SportaskSettingsService {
  readonly settings = localStorageSignal<unknown>(KEY, SPORTASK_DEFAULTS);

  /** Body weight in kg, for the calorie estimate. Device-local, never synced or exported. */
  readonly weightKg = localStorageSignal<number | null>('productivist.sportaskWeightKg', null);

  /**
   * False until the settings differ from the defaults (here or through a pull), and then it stays true for the session.
   * The sync blob only carries `sportask` while it is true, so users who never touch Sportask keep the blob (and its
   * hash) they had before the feature existed instead of re-pushing it.
   */
  readonly customized = signal(storedDiffersFromDefaults());

  // Neither injected service depends on this one (the clock injects `SportaskService`, never the reverse), so there is no cycle.
  private readonly data = inject(SportDataService);
  private readonly sportask = inject(SportaskService);

  private readonly resolved = computed(() => sportaskSwitch(this.settings(), this.data.blocks().length > 0 || this.sportask.active()));

  /** Sportask is switched on (Configuration > Sportask). Read from the raw settings; see `sportaskSwitch` for the fallback of existing users. */
  readonly enabled = computed(() => this.resolved().enabled);
  /** The guided setup is done (or this device already used Sportask before the switch existed). */
  readonly setupDone = computed(() => this.resolved().setupDone);

  /** The first write also stores what the fallback resolved (`enabled`, `setupDoneAt`), so a later change to the data cannot flip the switch. */
  update(patch: Partial<SportaskSettings>): void {
    const r = this.resolved();
    // Object.assign, not spreads: the build turns each spread into a helper call.
    this.settings.update((current) =>
      Object.assign({ enabled: r.enabled, setupDoneAt: r.setupDone ? Date.now() : undefined }, isObject(current) ? current : SPORTASK_DEFAULTS, patch),
    );
    this.customized.set(true);
  }

  /** Replaces the settings with a blob pulled from the server; the caller has checked that it is a plain object. */
  apply(raw: Record<string, unknown>): void {
    if (JSON.stringify(raw) !== JSON.stringify(this.settings())) this.settings.set(raw);
    this.customized.set(true);
  }

  reset(): void {
    this.settings.set(SPORTASK_DEFAULTS);
    this.weightKg.set(null);
    this.customized.set(false);
  }
}
