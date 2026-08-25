import { Injectable, computed, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';

export type DailyPlanStage = 'prompt' | 'chooseProjects' | 'planning' | 'groupingParallel';

export const UNASSIGNED_GROUP_ID = '__unassigned__';

export interface DailyObjective {
  id: string;
  text: string;
}

export interface ExecutionLot {
  id: string;
  taskIds: string[];
}

function createId(): string {
  return crypto.randomUUID();
}

@Injectable({ providedIn: 'root' })
export class DailyPlanService {
  readonly stage = localStorageSignal<DailyPlanStage>('productivist.dailyPlanStage', 'prompt');
  readonly objectives = localStorageSignal<DailyObjective[]>('productivist.dailyPlanObjectives', []);
  readonly selectedProjectIds = localStorageSignal<string[]>('productivist.dailyPlanProjectIds', []);
  readonly assignments = localStorageSignal<Record<string, string>>('productivist.dailyPlanAssignments', {});
  readonly draggedTaskId = signal<string | null>(null);

  readonly executionLots = localStorageSignal<ExecutionLot[]>('productivist.dailyPlanExecutionLots', []);
  readonly activeLotIndex = localStorageSignal<number>('productivist.dailyPlanActiveLotIndex', 0);

  /** Tasks committed to the Pomodoro view's "Planned tasks" list — survives startOver(), since it's a downstream artifact. */
  readonly committedPlannedTaskIds = localStorageSignal<string[]>('productivist.dailyPlanCommittedTaskIds', []);

  readonly plannedTaskIds = computed(() => Object.keys(this.assignments()));

  startPlanning(objectiveTexts: string[]): void {
    const objectives = objectiveTexts
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ id: createId(), text }));
    if (!objectives.length) return;
    this.objectives.set(objectives);
    this.selectedProjectIds.set([]);
    this.assignments.set({});
    this.stage.set('chooseProjects');
  }

  toggleProject(id: string): void {
    const current = this.selectedProjectIds();
    this.selectedProjectIds.set(current.includes(id) ? current.filter((p) => p !== id) : [...current, id]);
  }

  confirmProjects(): void {
    if (!this.selectedProjectIds().length) return;
    this.stage.set('planning');
  }

  backToPlanning(): void {
    this.stage.set('planning');
  }

  assignTask(taskId: string, objectiveId: string): void {
    this.assignments.update((map) => ({ ...map, [taskId]: objectiveId }));
  }

  unassignTask(taskId: string): void {
    this.assignments.update((map) => {
      const next = { ...map };
      delete next[taskId];
      return next;
    });
  }

  startDrag(taskId: string): void {
    this.draggedTaskId.set(taskId);
  }

  endDrag(): void {
    this.draggedTaskId.set(null);
  }

  /** Tap-to-place fallback for touch devices, where HTML5 drag-and-drop isn't available. */
  toggleArmed(taskId: string): void {
    this.draggedTaskId.set(this.draggedTaskId() === taskId ? null : taskId);
  }

  startGroupingParallel(): void {
    this.executionLots.set(this.plannedTaskIds().map((id) => ({ id: createId(), taskIds: [id] })));
    this.activeLotIndex.set(0);
    this.draggedTaskId.set(null);
    this.stage.set('groupingParallel');
  }

  moveTaskToLot(taskId: string, targetLotId: string): void {
    this.executionLots.update((lots) => {
      const withoutTask = lots
        .map((lot) => ({ ...lot, taskIds: lot.taskIds.filter((id) => id !== taskId) }))
        .filter((lot) => lot.taskIds.length > 0 || lot.id === targetLotId);
      return withoutTask.map((lot) => (lot.id === targetLotId ? { ...lot, taskIds: [...lot.taskIds, taskId] } : lot));
    });
  }

  createLotWithTask(taskId: string): void {
    this.executionLots.update((lots) => [
      ...lots.map((lot) => ({ ...lot, taskIds: lot.taskIds.filter((id) => id !== taskId) })).filter((lot) => lot.taskIds.length > 0),
      { id: createId(), taskIds: [taskId] },
    ]);
  }

  moveLot(lotId: string, direction: -1 | 1): void {
    this.executionLots.update((lots) => {
      const index = lots.findIndex((lot) => lot.id === lotId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= lots.length) return lots;
      const next = [...lots];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  setActiveLotIndex(index: number): void {
    this.activeLotIndex.set(index);
  }

  commitPlannedTasks(): void {
    this.committedPlannedTaskIds.set(this.plannedTaskIds());
  }

  startOver(): void {
    this.stage.set('prompt');
    this.objectives.set([]);
    this.selectedProjectIds.set([]);
    this.assignments.set({});
    this.draggedTaskId.set(null);
    this.executionLots.set([]);
    this.activeLotIndex.set(0);
  }

  reset(): void {
    this.startOver();
    this.committedPlannedTaskIds.set([]);
  }
}
