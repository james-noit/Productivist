import { Injectable, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { SPORTASK_DEFAULTS } from '../lib/sportask-defaults';
import type { SportaskSettings } from '../types/sportask';

const KEY = 'productivist.sportask';
const DEFAULTS_JSON = JSON.stringify(SPORTASK_DEFAULTS);

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
  readonly customized = signal(localStorage.getItem(KEY) !== null && localStorage.getItem(KEY) !== DEFAULTS_JSON);

  update(patch: Partial<SportaskSettings>): void {
    this.settings.update((current) => ({ ...(isObject(current) ? current : SPORTASK_DEFAULTS), ...patch }));
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
