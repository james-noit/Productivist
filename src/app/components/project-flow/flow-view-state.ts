import { Injectable, computed, inject, signal } from '@angular/core';
import { localStorageSignal } from '../../../core/local-storage-signal';
import { HORIZONS } from '../../../lib/flow-rules';
import { ViewService } from '../../../services/view.service';
import type { Horizon, Objective } from '../../../types/flow';

/**
 * What the Flow presentation shows, shared by its pieces (the top bar, the filters drawer, the diagram and the
 * outline). Provided by `ProjectFlowComponent` (`providers`), not at the root, so it lives with the presentation
 * and stays out of the initial bundle. Device-local and never synced, like the viewport:
 *
 * - `hiddenHorizons`, per project (`productivist.flowHiddenHorizons`): a hidden horizon is a collapsed lane in
 *   the diagram and is left out of the outline. Same state, two views of it.
 * - `showAchieved` (default on) and `showDropped` (default off), global.
 * - the "Show done tasks" switch is the shared `ViewService.showDoneTasks`.
 *
 * `activeCount` counts how far that is from the defaults; `reset()` goes back to them.
 */
@Injectable()
export class FlowViewState {
  private readonly view = inject(ViewService);

  /** The project the horizons belong to; the presentation binds it to its `project` input. */
  private projectId: () => string = () => '';

  private readonly storedHidden = localStorageSignal<Record<string, readonly Horizon[]>>('productivist.flowHiddenHorizons', {});
  readonly showAchieved = localStorageSignal<boolean>('productivist.flowShowAchieved', true);
  readonly showDropped = localStorageSignal<boolean>('productivist.flowShowDropped', false);
  /** Persisted: the one-time "drag from the port to link" tip, once dismissed. */
  readonly linkTipDismissed = localStorageSignal<boolean>('productivist.flowLinkTipDismissed', false);

  readonly showDone = this.view.showDoneTasks;
  readonly filtersOpen = signal(false);
  /** The control that opened the filters drawer, where focus goes back to when it closes. */
  filtersOpener: HTMLElement | null = null;

  openFilters(opener: HTMLElement | null = null): void {
    const active = document.activeElement;
    this.filtersOpener = opener ?? (active instanceof HTMLElement && active !== document.body ? active : null);
    this.filtersOpen.set(true);
  }

  closeFilters(): void {
    this.filtersOpen.set(false);
  }

  /** Binds the project (call once, from the presentation's constructor). */
  bind(projectId: () => string): void {
    this.projectId = projectId;
  }

  /** The hidden horizons of the current project, only the valid ones, in horizon order. */
  readonly hiddenList = computed<readonly Horizon[]>(() => {
    const stored = this.storedHidden()[this.projectId()];
    return Array.isArray(stored) ? HORIZONS.filter((h) => stored.includes(h)) : [];
  });
  readonly hiddenHorizons = computed<ReadonlySet<Horizon>>(() => new Set(this.hiddenList()));

  /** The count shown on the Filters button: every setting that differs from its default. */
  readonly activeCount = computed(
    () => this.hiddenList().length + (this.showAchieved() === false ? 1 : 0) + (this.showDropped() === true ? 1 : 0) + (this.showDone() ? 1 : 0),
  );

  setHorizonHidden(horizon: Horizon, hidden: boolean): void {
    const id = this.projectId();
    if (!id) return;
    const next = HORIZONS.filter((h) => (h === horizon ? hidden : this.hiddenHorizons().has(h)));
    this.storedHidden.update((all) => {
      const { [id]: _previous, ...others } = all;
      return next.length ? { ...others, [id]: next } : others;
    });
  }

  toggleHorizon(horizon: Horizon): void {
    this.setHorizonHidden(horizon, !this.hiddenHorizons().has(horizon));
  }

  /** The objective's status passes the achieved / dropped filters (its horizon is not looked at). */
  statusShown(objective: Objective): boolean {
    if (objective.status === 'achieved') return this.showAchieved() !== false;
    if (objective.status === 'dropped') return this.showDropped() === true;
    return true;
  }

  /** The objective passes the horizon and status filters. */
  shows(objective: Objective): boolean {
    return !this.hiddenHorizons().has(objective.horizon) && this.statusShown(objective);
  }

  /** Makes sure a just-created objective is not filtered out of sight: whatever hid it is switched back on. */
  reveal(objective: Objective): void {
    if (this.hiddenHorizons().has(objective.horizon)) this.setHorizonHidden(objective.horizon, false);
    if (objective.status === 'achieved' && this.showAchieved() === false) this.showAchieved.set(true);
    if (objective.status === 'dropped' && this.showDropped() !== true) this.showDropped.set(true);
  }

  reset(): void {
    const id = this.projectId();
    if (id && this.storedHidden()[id]) {
      this.storedHidden.update((all) => {
        const { [id]: _previous, ...others } = all;
        return others;
      });
    }
    this.showAchieved.set(true);
    this.showDropped.set(false);
    this.showDone.set(false);
  }
}
