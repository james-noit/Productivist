import type { CadencePreset, SportaskSettings } from '../../types/sportask';
import { createRegistry } from './registry';

/** Mirrors MIN_DURATION_SECONDS / MAX_FOCUS_SECONDS / MAX_BREAK_SECONDS of settings.service.ts (not imported: that file is Angular). */
export const MIN_DURATION_SECONDS = 30;
export const MAX_FOCUS_SECONDS = 180 * 60;
export const MAX_BREAK_SECONDS = 60 * 60;
/** The custom cadence is limited to focus 5..180 min and break 0.5..60 min, in 30 s steps. */
export const MIN_CUSTOM_FOCUS_SECONDS = 5 * 60;

export type CadenceValues = Omit<CadencePreset, 'id' | 'name'>;

/** PLAN section 5.1. `custom` is a settings value (user-defined), not a preset. */
export const CADENCES = createRegistry<CadencePreset>([
  { id: 'micro', name: { en: 'Micro (5/1)', es: 'Micro (5/1)' }, focusSeconds: 300, breakSeconds: 60, exerciseEvery: 1 },
  { id: 'short', name: { en: 'Short (10/2)', es: 'Corto (10/2)' }, focusSeconds: 600, breakSeconds: 120, exerciseEvery: 1 },
  { id: 'classic', name: { en: 'Classic (25/5)', es: 'Clásico (25/5)' }, focusSeconds: 1500, breakSeconds: 300, longBreak: { every: 4, seconds: 900 }, exerciseEvery: 1 },
  { id: 'deep', name: { en: 'Deep (50/10)', es: 'Profundo (50/10)' }, focusSeconds: 3000, breakSeconds: 600, exerciseEvery: 1 },
  { id: 'classicAlt', name: { en: 'Classic, every other break', es: 'Clásico, una pausa sí y otra no' }, focusSeconds: 1500, breakSeconds: 300, longBreak: { every: 4, seconds: 900 }, exerciseEvery: 2 },
]);

const roundTo30 = (n: number): number => Math.round(n / 30) * 30;
const clampInt = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(n)));

/** Clamps untrusted custom cadence values to the allowed ranges. */
export function clampCadence(c: CadenceValues): CadenceValues {
  const out: CadenceValues = {
    focusSeconds: clampInt(roundTo30(c.focusSeconds), MIN_CUSTOM_FOCUS_SECONDS, MAX_FOCUS_SECONDS),
    breakSeconds: clampInt(roundTo30(c.breakSeconds), MIN_DURATION_SECONDS, MAX_BREAK_SECONDS),
    exerciseEvery: clampInt(c.exerciseEvery, 1, 8),
  };
  if (c.longBreak) {
    out.longBreak = { every: clampInt(c.longBreak.every, 2, 12), seconds: clampInt(roundTo30(c.longBreak.seconds), MIN_DURATION_SECONDS, MAX_BREAK_SECONDS) };
  }
  return out;
}

/** The cadence a session starts with: the preset named in settings, or the custom one; falls back to `classic`. */
export function resolveCadence(settings: Pick<SportaskSettings, 'cadenceId' | 'customCadence'>): CadenceValues {
  if (settings.cadenceId === 'custom' && settings.customCadence) return clampCadence(settings.customCadence);
  const preset = CADENCES.get(settings.cadenceId) ?? CADENCES.get('classic')!;
  const out: CadenceValues = { focusSeconds: preset.focusSeconds, breakSeconds: preset.breakSeconds, exerciseEvery: preset.exerciseEvery };
  if (preset.longBreak) out.longBreak = { ...preset.longBreak };
  return out;
}

/** Break length for the n-th break of a session (1-based): the long break when it is the every-N-th one. */
export function breakSecondsFor(cadence: CadenceValues, breakNumber: number): number {
  const lb = cadence.longBreak;
  return lb && breakNumber % lb.every === 0 ? lb.seconds : cadence.breakSeconds;
}
