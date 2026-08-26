import { Injectable, computed, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { createId } from '../core/create-id';

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


@Injectable({ providedIn: 'root' })
export class DailyPlanService {
  readonly stage = localStorageSignal<DailyPlanStage>('productivist.dailyPlanStage', 'prompt');
  readonly objectives = localStorageSignal<DailyObjective[]>('productivist.dailyPlanObjectives', []);
  /** objectiveId -> projectIds assigned to it. A project may belong to several objectives at once. */
  readonly projectAssignments = localStorageSignal<Record<string, string[]>>('productivist.dailyPlanProjectAssignments', {});
  readonly assignments = localStorageSignal<Record<string, string>>('productivist.dailyPlanAssignments', {});
  readonly draggedTaskId = signal<string | null>(null);
  readonly draggedProjectId = signal<string | null>(null);

  readonly assignedProjectIds = computed(() => {
    const set = new Set<string>();
    for (const ids of Object.values(this.projectAssignments())) for (const id of ids) set.add(id);
    return set;
  });

  readonly executionLots = localStorageSignal<ExecutionLot[]>('productivist.dailyPlanExecutionLots', []);
  readonly activeLotIndex = localStorageSignal<number>('productivist.dailyPlanActiveLotIndex', 0);

  /** Tasks committed to the Pomodoro view's "Planned tasks" list — survives startOver(), since it's a downstream artifact. */
  readonly committedPlannedTaskIds = localStorageSignal<string[]>('productivist.dailyPlanCommittedTaskIds', []);

  readonly plannedTaskIds = computed(() => Object.keys(this.assignments()));

  /**
   * Updates objective text while keeping each objective's id stable for any entry whose text
   * is unchanged (matched by exact text, each previous entry consumed at most once), so
   * project/task assignments made in later steps survive going back to tweak the wording of
   * objectives that aren't the one being changed. Assignments pointing at a dropped or
   * reworded objective are pruned, since there's no way to tell those apart from a fresh one.
   */
  updateObjectives(objectiveTexts: string[]): void {
    const remainingPrevious = [...this.objectives()];
    const next = objectiveTexts
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => {
        const matchIndex = remainingPrevious.findIndex((o) => o.text === text);
        if (matchIndex === -1) return { id: createId(), text };
        const [matched] = remainingPrevious.splice(matchIndex, 1);
        return { id: matched.id, text };
      });
    this.objectives.set(next);

    const validIds = new Set(next.map((o) => o.id));
    this.projectAssignments.update((map) => {
      const filtered: Record<string, string[]> = {};
      for (const [objectiveId, projectIds] of Object.entries(map)) {
        if (validIds.has(objectiveId)) filtered[objectiveId] = projectIds;
      }
      return filtered;
    });
    this.assignments.update((map) => {
      const filtered: Record<string, string> = {};
      for (const [taskId, objectiveId] of Object.entries(map)) {
        if (validIds.has(objectiveId)) filtered[taskId] = objectiveId;
      }
      return filtered;
    });
  }

  startPlanning(objectiveTexts: string[]): void {
    this.updateObjectives(objectiveTexts);
    if (!this.objectives().length) return;
    this.stage.set('chooseProjects');
  }

  backToPrompt(): void {
    this.stage.set('prompt');
  }

  backToChooseProjects(): void {
    this.stage.set('chooseProjects');
  }

  isProjectInObjective(projectId: string, objectiveId: string): boolean {
    return (this.projectAssignments()[objectiveId] ?? []).includes(projectId);
  }

  assignProjectToObjective(projectId: string, objectiveId: string): void {
    this.projectAssignments.update((map) => {
      const current = map[objectiveId] ?? [];
      if (current.includes(projectId)) return map;
      return { ...map, [objectiveId]: [...current, projectId] };
    });
  }

  unassignProjectFromObjective(projectId: string, objectiveId: string): void {
    this.projectAssignments.update((map) => ({
      ...map,
      [objectiveId]: (map[objectiveId] ?? []).filter((id) => id !== projectId),
    }));
  }

  startDragProject(projectId: string): void {
    this.draggedProjectId.set(projectId);
  }

  endDragProject(): void {
    this.draggedProjectId.set(null);
  }

  toggleArmedProject(projectId: string): void {
    this.draggedProjectId.set(this.draggedProjectId() === projectId ? null : projectId);
  }

  confirmProjects(): void {
    if (!this.assignedProjectIds().size) return;
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
    this.projectAssignments.set({});
    this.assignments.set({});
    this.draggedTaskId.set(null);
    this.draggedProjectId.set(null);
    this.executionLots.set([]);
    this.activeLotIndex.set(0);
  }

  reset(): void {
    this.startOver();
    this.committedPlannedTaskIds.set([]);
  }
}
