import { Injectable, computed, inject } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { createId } from '../core/create-id';
import { TodosService } from './todos.service';
import { ClockService } from './clock.service';
import type { AccomplishmentMark, MultitaskCard } from '../types/multitask';


const DISSOLVE_DELAY_MS = 5000;

@Injectable({ providedIn: 'root' })
export class MultitaskService {
  private readonly todos = inject(TodosService);
  private readonly clock = inject(ClockService);

  readonly enabled = localStorageSignal<boolean>('productivist.multitaskEnabled', false);
  readonly cards = localStorageSignal<MultitaskCard[]>('productivist.multitaskCards', []);
  readonly capacityTipDismissed = localStorageSignal<boolean>('productivist.multitaskTipDismissed', false);

  // Finishing/discarding a card removes it outright (see removeCard), which would
  // otherwise wipe its accomplishments from the effectivity totals. Archive the
  // counts here first so the totals survive the card's removal.
  private readonly archivedGreen = localStorageSignal<number>('productivist.multitaskArchivedGreen', 0);
  private readonly archivedRed = localStorageSignal<number>('productivist.multitaskArchivedRed', 0);

  private readonly dissolveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly assignedTaskIds = computed(() => {
    const ids = new Set<string>();
    for (const card of this.cards()) {
      if (card.taskId) ids.add(card.taskId);
    }
    return ids;
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

  dismissCapacityTip(): void {
    this.capacityTipDismissed.set(true);
  }

  reset(): void {
    for (const cardId of Array.from(this.dissolveTimers.keys())) this.cancelDissolve(cardId);
    this.enabled.set(false);
    this.cards.set([]);
    this.capacityTipDismissed.set(false);
    this.archivedGreen.set(0);
    this.archivedRed.set(0);
  }
}
