import { Injectable, computed, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import type { SportaskSession, SportaskStartOptions } from '../types/sportask';

/** What "start Sportask when this plan launches" remembers (the source is only known at launch). */
export type SportaskArmed = Omit<SportaskStartOptions, 'source'>;

/**
 * The Sportask session (device-local, like the timer) and the small bit of logic that has to run at startup: the
 * duration override the clock reads, and the trigger that opens the break modal when a focus phase ends. Everything
 * else (catalog, generator, texts, and the operations that start a session, arm the planner or close a break:
 * `lib/sportask/session-ops.ts`) is lazy; keep this file free of it. The initial-bundle budget for the whole feature is small.
 */
@Injectable({ providedIn: 'root' })
export class SportaskService {
  readonly session = localStorageSignal<SportaskSession | null>('productivist.sportaskSession', null);
  /** A session to start when the Plan-my-day plan launches (Pomodoro or Multitask): `armed.set(options)` arms it, `armed.set(null)` disarms. */
  readonly armed = localStorageSignal<SportaskArmed | null>('productivist.sportaskArmed', null);

  readonly active = computed(() => this.session()?.active === true);
  /**
   * The break modal is showing (`AppComponent` renders it from this). It is also what hides the clock's own "session
   * complete" dialog meanwhile (`suppressSessionModal` in the plan): same signal, no second one to keep in step.
   */
  readonly breakOpen = signal(this.session()?.pending != null); // a reload in the middle of a break brings the modal back

  /**
   * The lengths the clock uses while a session is active. A break is long when it is the every-N-th one of the
   * session: `breaksSeen` counts the break that has just started (`focusEnded` runs before the clock sets that break's
   * length), so the long break is the one that makes it a multiple of N.
   */
  readonly durationOverride = computed<{ focus: number; break: number } | null>(() => {
    const s = this.session();
    const c = s?.cadence;
    if (!s?.active || !c) return null;
    const n = s.breaksSeen;
    const lb = c.longBreak;
    return { focus: c.focusSeconds, break: lb && n && n % lb.every === 0 ? lb.seconds : c.breakSeconds };
  });

  /**
   * The clock calls this when a focus phase ends (before it sets the break's length, so a long break is already counted).
   * With a session active it counts the break and, if this one carries exercise, opens the break modal.
   */
  focusEnded(): void {
    const s = this.session();
    if (!s?.active) return;
    const breaksSeen = s.breaksSeen + 1;
    this.session.set({ ...s, breaksSeen, pending: null });
    if (breaksSeen % s.cadence.exerciseEvery === 0) this.breakOpen.set(true);
  }

  /** Leaves Sportask: the clock goes back to the user's own durations (a phase that is running is not touched). */
  stop(): void {
    this.session.set(null);
    this.breakOpen.set(false);
  }
}
