import { Injectable } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';

export type AppView = 'planning-lab' | 'pomodoro' | 'eisenhower';

@Injectable({ providedIn: 'root' })
export class ViewService {
  readonly current = localStorageSignal<AppView>('productivist.activeView', 'planning-lab');

  setView(view: AppView): void {
    this.current.set(view);
  }

  reset(): void {
    this.current.set('planning-lab');
  }
}
