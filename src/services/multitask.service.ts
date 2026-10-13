import { Injectable, computed, inject } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { createId } from '../core/create-id';
import { TodosService } from './todos.service';
import { ClockService } from './clock.service';
import { DailyPlanService } from './daily-plan.service';
import { advanceLots, moveLotInPlan, moveTaskInPlan, unfinishedInActive, type CarryMode } from '../lib/execution-lots';
import type { AccomplishmentMark, MultitaskCard } from '../types/multitask';


const DISSOLVE_DELAY_MS = 5000;

@Injectable({ providedIn: 'root' })
export class MultitaskService {
  private readonly todos = inject(TodosService);
  private readonly clock = inject(ClockService);
  private readonly plan = inject(DailyPlanService);

  readonly enabled = localStorageSignal<boolean>('productivist.multitaskEnabled', false);
  readonly cards = localStorageSignal<MultitaskCard[]>('productivist.multitaskCards', []);
  /** "Research tips" switched off for good (the key predates the rotating tips, so earlier dismissals stay). */
  readonly researchTipsOff = localStorageSignal<boolean>('productivist.multitaskTipDismissed', false);
  /** Device-local tip state: the day the ✕ was pressed, and the ids of the last tips shown. */
  readonly tipHiddenOn = localStorageSignal<string | null>('productivist.multitaskTipHiddenOn', null);
  readonly tipRecent = localStorageSignal<string[]>('productivist.multitaskTipRecent', []);

  // Finishing/discarding a card removes it outright (see removeCard), which would
  // otherwise wipe its accomplishments from the effectivity totals. Archive the
  // counts here first so the totals survive the card's removal.
  readonly archivedGreen = localStorageSignal<number>('productivist.multitaskArchivedGreen', 0);
  readonly archivedRed = localStorageSignal<number>('productivist.multitaskArchivedRed', 0);

  private readonly dissolveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly assignedTaskIds = computed(() => {
    const ids = new Set<string>();
    for (const card of this.cards()) {
      if (card.taskId) ids.add(card.taskId);
    }
    return ids;
  });

  /** Tasks of the active lot that are not done and still on a card (what "Next lot" has to ask about). */
  readonly unfinishedInActiveLot = computed(() => {
    const open = new Set<string>();
    for (const todo of this.todos.todos()) if (!todo.done) open.add(todo.id);
    return unfinishedInActive(this.plan.executionLots(), this.plan.activeLotIndex(), (id) => !open.has(id), this.assignedTaskIds());
  });

  // Effectivity aggregation: currently-displayed cards plus everything archived
  // from cards that have since been finished or discarded.
  readonly greenBoxes = computed(
    () =>
      this.archivedGreen() +
      this.cards().reduce(
        (sum, card) => sum + (card.accomplishments?.filter((m) => m === 'green').length ?? 0),
        0,
      ),
  );
  readonly redBoxes = computed(
    () =>
      this.archivedRed() +
      this.cards().reduce(
        (sum, card) => sum + (card.accomplishments?.filter((m) => m === 'red').length ?? 0),
        0,
      ),
  );
  readonly totalBoxes = computed(() => this.greenBoxes() + this.redBoxes());
  // Fraction 0..1; null when there are no boxes at all (0/0 is undefined).
  readonly efficiency = computed(() => (this.totalBoxes() === 0 ? null : this.greenBoxes() / this.totalBoxes()));

  constructor() {
    // Cards persisted before the accomplishments/lastAnsweredPhaseEndAt fields existed
    // are missing them entirely (localStorageSignal has no migration step) — backfill
    // once on load so every read site downstream can assume the full shape.
    this.cards.update((list) =>
      list.map((card) => ({
        ...card,
        accomplishments: card.accomplishments ?? [],
        lastAnsweredPhaseEndAt: card.lastAnsweredPhaseEndAt ?? null,
      })),
    );
  }

  private patchCard(cardId: string, patch: Partial<MultitaskCard>): void {
    this.cards.update((list) => list.map((c) => (c.id === cardId ? { ...c, ...patch } : c)));
  }

  cancelDissolve(cardId: string): void {
    const timer = this.dissolveTimers.get(cardId);
    if (timer) {
      clearTimeout(timer);
      this.dissolveTimers.delete(cardId);
    }
  }

  scheduleDissolveIfEmpty(cardId: string): void {
    this.cancelDissolve(cardId);
    const card = this.cards().find((c) => c.id === cardId);
    if (!card || card.taskId !== null) return;
    this.dissolveTimers.set(
      cardId,
      setTimeout(() => {
        this.dissolveTimers.delete(cardId);
        this.removeCard(cardId);
      }, DISSOLVE_DELAY_MS),
    );
  }

  addCard(taskId: string | null = null): void {
    const id = createId();
    // A task attached right away shouldn't be asked about a focus phase that ended
    // before it ever joined this card — stamp it as already answered for that phase.
    const card: MultitaskCard = {
      id,
      taskId,
      createdAt: Date.now(),
      accomplishments: [],
      lastAnsweredPhaseEndAt: taskId === null ? null : this.clock.lastFocusEndAt(),
    };
    this.cards.update((list) => [...list, card]);
    if (taskId === null) this.scheduleDissolveIfEmpty(id);
  }

  /** Adds a card for each task that has none (and is not done) in one write; their marks start empty. */
  private addCardsFor(taskIds: readonly string[]): void {
    const have = this.assignedTaskIds();
    const open = new Set<string>();
    for (const todo of this.todos.todos()) if (!todo.done) open.add(todo.id);
    const phaseEndAt = this.clock.lastFocusEndAt();
    const added = taskIds
      .filter((id) => open.has(id) && !have.has(id))
      .map<MultitaskCard>((taskId) => ({ id: createId(), taskId, createdAt: Date.now(), accomplishments: [], lastAnsweredPhaseEndAt: phaseEndAt }));
    if (added.length) this.cards.update((list) => [...list, ...added]);
  }

  /** Removes the cards of these tasks in one write, archiving their marks like removeCard does. */
  private removeCardsOf(taskIds: readonly string[]): void {
    const gone = new Set(taskIds);
    const removed = this.cards().filter((card) => card.taskId !== null && gone.has(card.taskId));
    if (!removed.length) return;
    let green = 0;
    let red = 0;
    for (const card of removed) {
      this.cancelDissolve(card.id);
      for (const mark of card.accomplishments ?? []) {
        if (mark === 'green') green++;
        else red++;
      }
    }
    if (green) this.archivedGreen.update((v) => v + green);
    if (red) this.archivedRed.update((v) => v + red);
    const ids = new Set(removed.map((card) => card.id));
    this.cards.update((list) => list.filter((card) => !ids.has(card.id)));
  }

  /**
   * Moves on to the next lot (or finishes the plan on the last one). The unfinished tasks of the lot either
   * come along (their cards and marks stay, and they lead the next lot) or are let go (their cards go, with
   * the marks archived and no penalty). The next lot's tasks get their cards.
   */
  advanceLot(mode: CarryMode): void {
    const unfinished = this.unfinishedInActiveLot();
    const result = advanceLots(this.plan.executionLots(), this.plan.activeLotIndex(), unfinished, mode);
    this.plan.executionLots.set(result.lots);
    this.plan.activeLotIndex.set(result.activeIndex);
    if (mode === 'drop') this.removeCardsOf(unfinished);
    if (!result.finished) this.addCardsFor(result.lots[result.activeIndex]?.taskIds ?? []);
  }

  /** Edits the running plan; the cards follow the active lot: tasks that enter it get one, tasks that leave lose it. */
  moveLotTask(taskId: string, target: { lotId: string } | 'newLot'): void {
    const lots = this.plan.executionLots();
    const index = this.plan.activeLotIndex();
    const result = moveTaskInPlan(lots, index, taskId, target, createId);
    if (result.lots === lots) return;
    this.plan.executionLots.set(result.lots);
    this.plan.activeLotIndex.set(result.activeIndex);
    const before = lots[index]?.taskIds ?? [];
    const after = result.lots[result.activeIndex]?.taskIds ?? [];
    this.removeCardsOf(before.filter((id) => !after.includes(id)));
    this.addCardsFor(after.filter((id) => !before.includes(id)));
  }

  moveLot(lotId: string, dir: -1 | 1): void {
    const lots = this.plan.executionLots();
    const next = moveLotInPlan(lots, this.plan.activeLotIndex(), lotId, dir);
    if (next !== lots) this.plan.executionLots.set(next);
  }

  removeCard(cardId: string): void {
    this.cancelDissolve(cardId);
    const card = this.cards().find((c) => c.id === cardId);
    if (card?.accomplishments) {
      this.archivedGreen.update((v) => v + (card.accomplishments?.filter((m) => m === 'green').length ?? 0));
      this.archivedRed.update((v) => v + (card.accomplishments?.filter((m) => m === 'red').length ?? 0));
    }
    this.cards.update((list) => list.filter((c) => c.id !== cardId));
  }

  assignTask(cardId: string, taskId: string | null): void {
    const card = this.cards().find((c) => c.id === cardId);
    if (!card) return;
    if (taskId !== null) {
      this.cancelDissolve(cardId);
      // Same reasoning as addCard: a task picked now shouldn't retroactively trigger
      // the iteration check for a phase that already ended before it was assigned.
      this.patchCard(cardId, { taskId, lastAnsweredPhaseEndAt: this.clock.lastFocusEndAt() });
    } else {
      this.patchCard(cardId, { taskId });
    }
  }

  // Finish/Clear both retire the row entirely now (the row animates itself out,
  // then calls these) — unlike the old "clear the task but keep the empty card"
  // behavior, there is no longer an empty-but-kept state reachable from either action.
  // Finishing counts as two effectivity hits, discarding as one miss.
  clearCard(cardId: string): void {
    const card = this.cards().find((c) => c.id === cardId);
    if (card && card.taskId) {
      this.patchCard(cardId, { accomplishments: [...(card.accomplishments ?? []), 'red'] });
    }
    this.removeCard(cardId);
  }

  finishCard(cardId: string): void {
    const card = this.cards().find((c) => c.id === cardId);
    if (!card || !card.taskId) return;
    this.patchCard(cardId, { accomplishments: [...(card.accomplishments ?? []), 'green', 'green'] });
    this.todos.toggleDone(card.taskId);
    this.removeCard(cardId);
  }

  recordAccomplishment(cardId: string, marks: AccomplishmentMark[], phaseEndAt: number): void {
    const card = this.cards().find((c) => c.id === cardId);
    if (!card) return;
    this.patchCard(cardId, {
      accomplishments: [...(card.accomplishments ?? []), ...marks],
      lastAnsweredPhaseEndAt: phaseEndAt,
    });
  }

  addAccomplishment(cardId: string, mark: AccomplishmentMark): void {
    const card = this.cards().find((c) => c.id === cardId);
    if (!card) return;
    this.patchCard(cardId, { accomplishments: [...(card.accomplishments ?? []), mark] });
  }

  removeAccomplishment(cardId: string, index: number): void {
    const card = this.cards().find((c) => c.id === cardId);
    if (!card || !card.accomplishments) return;
    const accomplishments = [...card.accomplishments];
    accomplishments.splice(index, 1);
    this.patchCard(cardId, { accomplishments });
  }

  resetAccomplishments(): void {
    this.archivedGreen.set(0);
    this.archivedRed.set(0);
    this.cards.update((list) => list.map((card) => ({ ...card, accomplishments: [] })));
  }

  setEnabled(val: boolean): void {
    this.enabled.set(val);
  }

  enableWithCurrentTask(): void {
    if (this.enabled()) return;
    this.enabled.set(true);
    const currentTask = this.todos.currentTask();
    if (this.cards().length === 0 && currentTask) {
      this.addCard(currentTask.id);
    }
  }


  reset(): void {
    for (const cardId of Array.from(this.dissolveTimers.keys())) this.cancelDissolve(cardId);
    this.enabled.set(false);
    this.cards.set([]);
    this.researchTipsOff.set(false);
    this.tipHiddenOn.set(null);
    this.tipRecent.set([]);
    this.archivedGreen.set(0);
    this.archivedRed.set(0);
  }
}
