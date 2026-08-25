import { effect, signal, type WritableSignal } from '@angular/core';

export function localStorageSignal<T>(key: string, defaultValue: T): WritableSignal<T> {
  const stored = localStorage.getItem(key);
  const data = signal<T>(stored ? (JSON.parse(stored) as T) : defaultValue);

  effect(() => {
    localStorage.setItem(key, JSON.stringify(data()));
  });

  return data;
}
