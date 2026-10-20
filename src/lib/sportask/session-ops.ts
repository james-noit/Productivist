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

/** Closes the break modal and forgets the block that was pending. */
export function closeBreak(sportask: SportaskService): void {
  sportask.breakOpen.set(false);
  sportask.session.update((s) => (s?.pending ? { ...s, pending: null } : s));
}
