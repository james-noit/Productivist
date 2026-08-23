import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useLocalStorage } from '../composables/useLocalStorage'
import { useTodosStore } from './todos'
import { useClockStore } from './clock'
import type { AccomplishmentMark, MultitaskCard } from '../types/multitask'

function createId(): string {
  return crypto.randomUUID()
}

const DISSOLVE_DELAY_MS = 5000

export const useMultitaskStore = defineStore('multitask', () => {
  const todos = useTodosStore()
  const clock = useClockStore()

  const enabled = useLocalStorage<boolean>('productivist.multitaskEnabled', false)
  const cards = useLocalStorage<MultitaskCard[]>('productivist.multitaskCards', [])
  const capacityTipDismissed = useLocalStorage<boolean>('productivist.multitaskTipDismissed', false)

  // Finishing/discarding a card removes it outright (see removeCard), which would
  // otherwise wipe its accomplishments from the effectivity totals. Archive the
  // counts here first so the totals survive the card's removal.
  const archivedGreen = useLocalStorage<number>('productivist.multitaskArchivedGreen', 0)
  const archivedRed = useLocalStorage<number>('productivist.multitaskArchivedRed', 0)

  // Cards persisted before the accomplishments/lastAnsweredPhaseEndAt fields existed
  // are missing them entirely (useLocalStorage has no migration step) — backfill once
  // on load so every read site downstream can assume the full shape.
  for (const card of cards.value) {
    if (!card.accomplishments) card.accomplishments = []
    if (card.lastAnsweredPhaseEndAt === undefined) card.lastAnsweredPhaseEndAt = null
  }

  const dissolveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function cancelDissolve(cardId: string) {
    const timer = dissolveTimers.get(cardId)
    if (timer) {
      clearTimeout(timer)
      dissolveTimers.delete(cardId)
    }
  }

  function scheduleDissolveIfEmpty(cardId: string) {
    cancelDissolve(cardId)
    const card = cards.value.find((c) => c.id === cardId)
    if (!card || card.taskId !== null) return
    dissolveTimers.set(
      cardId,
      setTimeout(() => {
        dissolveTimers.delete(cardId)
        removeCard(cardId)
      }, DISSOLVE_DELAY_MS),
    )
  }

  const assignedTaskIds = computed(() => {
    const ids = new Set<string>()
    for (const card of cards.value) {
      if (card.taskId) ids.add(card.taskId)
    }
    return ids
  })

  // Effectivity aggregation: currently-displayed cards plus everything archived
  // from cards that have since been finished or discarded.
  const greenBoxes = computed(
    () =>
      archivedGreen.value +
      cards.value.reduce((sum, card) => sum + (card.accomplishments?.filter((m) => m === 'green').length ?? 0), 0),
  )
  const redBoxes = computed(
    () =>
      archivedRed.value +
      cards.value.reduce((sum, card) => sum + (card.accomplishments?.filter((m) => m === 'red').length ?? 0), 0),
  )
  const totalBoxes = computed(() => greenBoxes.value + redBoxes.value)
  // Fraction 0..1; null when there are no boxes at all (0/0 is undefined).
  const efficiency = computed(() => (totalBoxes.value === 0 ? null : greenBoxes.value / totalBoxes.value))

  function addCard(taskId: string | null = null) {
    const id = createId()
    // A task attached right away shouldn't be asked about a focus phase that ended
    // before it ever joined this card — stamp it as already answered for that phase.
    cards.value.push({
      id,
      taskId,
      createdAt: Date.now(),
      accomplishments: [],
      lastAnsweredPhaseEndAt: taskId === null ? null : clock.lastFocusEndAt,
    })
    if (taskId === null) scheduleDissolveIfEmpty(id)
  }

  function removeCard(cardId: string) {
    cancelDissolve(cardId)
    const card = cards.value.find((c) => c.id === cardId)
    if (card?.accomplishments) {
      archivedGreen.value += card.accomplishments.filter((m) => m === 'green').length
      archivedRed.value += card.accomplishments.filter((m) => m === 'red').length
    }
    cards.value = cards.value.filter((c) => c.id !== cardId)
  }

  function assignTask(cardId: string, taskId: string | null) {
    const card = cards.value.find((c) => c.id === cardId)
    if (!card) return
    card.taskId = taskId
    if (taskId !== null) {
      cancelDissolve(cardId)
      // Same reasoning as addCard: a task picked now shouldn't retroactively trigger
      // the iteration check for a phase that already ended before it was assigned.
      card.lastAnsweredPhaseEndAt = clock.lastFocusEndAt
    }
  }

  // Finish/Clear both retire the row entirely now (the row animates itself out,
  // then calls these) — unlike the old "clear the task but keep the empty card"
  // behavior, there is no longer an empty-but-kept state reachable from either action.
  // Finishing counts as two effectivity hits, discarding as one miss.
  function clearCard(cardId: string) {
    const card = cards.value.find((c) => c.id === cardId)
    if (card && card.taskId) {
      if (!card.accomplishments) card.accomplishments = []
      card.accomplishments.push('red')
    }
    removeCard(cardId)
  }

  function finishCard(cardId: string) {
    const card = cards.value.find((c) => c.id === cardId)
    if (!card || !card.taskId) return
    if (!card.accomplishments) card.accomplishments = []
    card.accomplishments.push('green', 'green')
    todos.toggleDone(card.taskId)
    removeCard(cardId)
  }

  function recordAccomplishment(cardId: string, marks: AccomplishmentMark[], phaseEndAt: number) {
    const card = cards.value.find((c) => c.id === cardId)
    if (!card) return
    if (!card.accomplishments) card.accomplishments = []
    card.accomplishments.push(...marks)
    card.lastAnsweredPhaseEndAt = phaseEndAt
  }

  function addAccomplishment(cardId: string, mark: AccomplishmentMark) {
    const card = cards.value.find((c) => c.id === cardId)
    if (!card) return
    if (!card.accomplishments) card.accomplishments = []
    card.accomplishments.push(mark)
  }

  function removeAccomplishment(cardId: string, index: number) {
    const card = cards.value.find((c) => c.id === cardId)
    if (!card || !card.accomplishments) return
    card.accomplishments.splice(index, 1)
  }

  function resetAccomplishments() {
    archivedGreen.value = 0
    archivedRed.value = 0
    for (const card of cards.value) {
      if (!card.accomplishments) card.accomplishments = []
      else card.accomplishments.splice(0, card.accomplishments.length)
    }
  }

  function setEnabled(val: boolean) {
    enabled.value = val
  }

  function enableWithCurrentTask() {
    if (enabled.value) return
    enabled.value = true
    if (cards.value.length === 0 && todos.currentTask) {
      addCard(todos.currentTask.id)
    }
  }

  function dismissCapacityTip() {
    capacityTipDismissed.value = true
  }

  function reset() {
    for (const cardId of Array.from(dissolveTimers.keys())) cancelDissolve(cardId)
    enabled.value = false
    cards.value = []
    capacityTipDismissed.value = false
    archivedGreen.value = 0
    archivedRed.value = 0
  }

  return {
    enabled,
    cards,
    capacityTipDismissed,
    assignedTaskIds,
    greenBoxes,
    redBoxes,
    totalBoxes,
    efficiency,
    addCard,
    removeCard,
    assignTask,
    clearCard,
    finishCard,
    recordAccomplishment,
    addAccomplishment,
    removeAccomplishment,
    resetAccomplishments,
    cancelDissolve,
    scheduleDissolveIfEmpty,
    setEnabled,
    enableWithCurrentTask,
    dismissCapacityTip,
    reset,
  }
})
