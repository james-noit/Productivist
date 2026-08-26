import { effect, signal, type WritableSignal } from '@angular/core';

/**
 * A signal whose value is mirrored into localStorage under `key`.
 *
 * Two things it deliberately avoids:
 *
 * - **Writing on load.** The backing effect always runs once when it is created. Writing
 *   then would re-serialize every persisted key on every page load for no reason, so the
 *   first run only records the serialized form it read and returns.
 * - **Writing once per `.set()`.** A single user action often produces a burst of updates
 *   (reordering todos rewrites the whole list; starting a new plan clears seven keys), and
 *   each write is a full `JSON.stringify` of the value. Writes are coalesced into one per
 *   key per microtask, and skipped entirely when the serialized value is unchanged.
 */
export function localStorageSignal<T>(key: string, defaultValue: T): WritableSignal<T> {
  const stored = localStorage.getItem(key);
  const data = signal<T>(stored === null ? defaultValue : parseOr(stored, defaultValue));

  let lastWritten = stored;
  let flushQueued = false;

  effect(() => {
    const serialized = JSON.stringify(data());
    if (serialized === lastWritten) return;
    lastWritten = serialized;
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(() => {
      flushQueued = false;
      try {
        localStorage.setItem(key, lastWritten as string);
      } catch {
        // Quota exceeded or storage disabled — the in-memory signal stays authoritative.
      }
    });
  });

  return data;
}

/** A hand-edited or truncated value must not take down bootstrap, so fall back to the default. */
function parseOr<T>(raw: string, defaultValue: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}
