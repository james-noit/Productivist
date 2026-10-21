import type { SportaskService } from '../../services/sportask.service';
import type { SportaskStartOptions } from '../../types/sportask';

/*
 * The operations on the Sportask session that only lazy code needs. They live here, not in `SportaskService`, so the eager
 * service stays within the initial-bundle budget; they write the service's signals directly.
 */

/** Starts a session (a new one replaces the current one) and drops whatever was armed for the planner. */
export function startSession(sportask: SportaskService, options: SportaskStartOptions): void {
  sportask.session.set({ active: true, ...options, startedAt: Date.now(), breaksSeen: 0, pending: null });
  sportask.armed.set(null);
}

/** For the planner's launch functions (phase 5): starts the armed session, if any, for the view that launches. */
export function activateArmed(sportask: SportaskService, source: SportaskStartOptions['source']): void {
  const armed = sportask.armed();
  if (armed) startSession(sportask, { ...armed, source });
}

/** Closes the break modal and forgets the block that was pending (a *Train now* block ends with it; a session is left alone). */
export function closeBreak(sportask: SportaskService): void {
  sportask.breakOpen.set(false);
  if (sportask.single()) sportask.single.set(null);
  else sportask.session.update((s) => (s?.pending ? { ...s, pending: null } : s));
}

/** *Train now*: opens the break modal on one block of `blockSeconds`, counted by its own timer. The session (if any) is untouched. */
export function startSingle(sportask: SportaskService, options: Pick<SportaskStartOptions, 'mode' | 'templateId' | 'equipmentOverride'>, blockSeconds: number): void {
  sportask.single.set({ ...options, blockSeconds, pending: null, endAt: null, left: blockSeconds, ended: false });
  sportask.breakOpen.set(true);
}

/**
 * Sportask was switched off: stops a running session and an open *Train now* block, and drops a plan armed for the planner.
 * The synced data (blocks, templates, the rest of the settings) is not touched, so switching it on again brings the history back.
 */
export function deactivate(sportask: SportaskService): void {
  sportask.stop();
  sportask.armed.set(null);
}
