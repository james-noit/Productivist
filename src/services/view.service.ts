import { Injectable } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';

export type AppView = 'planning-lab' | 'pomodoro' | 'eisenhower';
export type PlanningLabTab = 'daily' | 'general';

@Injectable({ providedIn: 'root' })
export class ViewService {
  readonly current = localStorageSignal<AppView>('productivist.activeView', 'planning-lab');

  /**
   * Lives here rather than on PlanningLabViewComponent because the Pomodoro view links
   * straight to a specific tab. While it was component state, that link had to write the
   * localStorage key directly, which left the in-memory signal stale for the rest of the
   * session if the Planning Lab had already been rendered once.
   */
  readonly planningLabTab = localStorageSignal<PlanningLabTab>('productivist.planningLabTab', 'daily');

  setView(view: AppView): void {
    this.current.set(view);
  }

  openPlanningLab(tab: PlanningLabTab): void {
    this.planningLabTab.set(tab);
    this.current.set('planning-lab');
  }

  reset(): void {
    this.current.set('planning-lab');
    this.planningLabTab.set('daily');
  }
}
