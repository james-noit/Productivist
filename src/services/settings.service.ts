import { Injectable } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';

export type Theme = 'light' | 'dark' | 'japanese' | 'nordic';
export type Language = 'en' | 'es';
export type BellSoundId = 'digital' | 'classic' | 'siren' | 'buzzer';
export type ClockStyle = 'boxes' | 'ring';
export type BoxClockOrder = 'sequential' | 'random';

export const DEFAULT_FOCUS_SECONDS = 25 * 60;
export const DEFAULT_BREAK_SECONDS = 5 * 60;
export const MIN_DURATION_SECONDS = 30;
export const MAX_FOCUS_SECONDS = 180 * 60;
export const MAX_BREAK_SECONDS = 60 * 60;
export const DEFAULT_BELL_SOUND_ID: BellSoundId = 'classic';
export const DEFAULT_CLOCK_STYLE: ClockStyle = 'boxes';
export const DEFAULT_BOX_CLOCK_ORDER: BoxClockOrder = 'sequential';

function roundToStep(seconds: number, min: number, max: number): number {
  const stepped = Math.round(seconds / 30) * 30;
  return Math.max(min, Math.min(max, stepped));
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly theme = localStorageSignal<Theme>('productivist.theme', 'light');
  readonly language = localStorageSignal<Language>('productivist.language', 'en');
  readonly focusSeconds = localStorageSignal<number>('productivist.focusSeconds', DEFAULT_FOCUS_SECONDS);
  readonly breakSeconds = localStorageSignal<number>('productivist.breakSeconds', DEFAULT_BREAK_SECONDS);
  readonly bellSound = localStorageSignal<boolean>('productivist.bellSound', true);
  readonly bellSoundId = localStorageSignal<BellSoundId>('productivist.bellSoundId', DEFAULT_BELL_SOUND_ID);
  readonly clockStyle = localStorageSignal<ClockStyle>('productivist.clockStyle', DEFAULT_CLOCK_STYLE);
  readonly boxClockOrder = localStorageSignal<BoxClockOrder>(
    'productivist.boxClockOrder',
    DEFAULT_BOX_CLOCK_ORDER,
  );

  setTheme(next: Theme): void {
    this.theme.set(next);
  }

  setLanguage(lang: Language): void {
    this.language.set(lang);
  }

  setFocusSeconds(seconds: number): void {
    this.focusSeconds.set(roundToStep(seconds, MIN_DURATION_SECONDS, MAX_FOCUS_SECONDS));
  }

  setBreakSeconds(seconds: number): void {
    this.breakSeconds.set(roundToStep(seconds, MIN_DURATION_SECONDS, MAX_BREAK_SECONDS));
  }

  setBellSound(val: boolean): void {
    this.bellSound.set(val);
  }

  setBellSoundId(id: BellSoundId): void {
    this.bellSoundId.set(id);
  }

  setClockStyle(style: ClockStyle): void {
    this.clockStyle.set(style);
  }

  setBoxClockOrder(order: BoxClockOrder): void {
    this.boxClockOrder.set(order);
  }

  reset(): void {
    this.theme.set('light');
    this.language.set('en');
    this.focusSeconds.set(DEFAULT_FOCUS_SECONDS);
    this.breakSeconds.set(DEFAULT_BREAK_SECONDS);
    this.bellSound.set(true);
    this.bellSoundId.set(DEFAULT_BELL_SOUND_ID);
    this.clockStyle.set(DEFAULT_CLOCK_STYLE);
    this.boxClockOrder.set(DEFAULT_BOX_CLOCK_ORDER);
  }
}
