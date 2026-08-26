import type { Priority, Todo } from '../types/todo'
import type { EisenhowerQuadrant } from '../types/eisenhower'

export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

/**
 * Importance first, then urgency. The single comparator behind both this module's
 * `sortByPriority` and `TodosService.sortTasks`, which only adds the custom-order branch
 * on top of it.
 */
export function comparePriority(a: Todo, b: Todo): number {
  const importanceDiff = PRIORITY_RANK[a.importance] - PRIORITY_RANK[b.importance]
  if (importanceDiff !== 0) return importanceDiff
  return PRIORITY_RANK[a.urgency] - PRIORITY_RANK[b.urgency]
}

export function sortByPriority(list: Todo[]): Todo[] {
  return [...list].sort(comparePriority)
}

export type QuadrantCounts = Record<EisenhowerQuadrant, number>

export function isImportant(todo: Todo): boolean {
  return todo.importance === 'high'
}

export function isUrgent(todo: Todo): boolean {
  return todo.urgency === 'high'
}

export function classify(todo: Todo): EisenhowerQuadrant {
  if (isImportant(todo) && isUrgent(todo)) return 'doFirst'
  if (isImportant(todo) && !isUrgent(todo)) return 'schedule'
  if (!isImportant(todo) && isUrgent(todo)) return 'delegate'
  return 'eliminate'
}

export function countByQuadrant(list: Todo[]): QuadrantCounts {
  const counts: QuadrantCounts = { doFirst: 0, schedule: 0, delegate: 0, eliminate: 0 }
  for (const todo of list) counts[classify(todo)]++
  return counts
}

export interface QuadrantDef {
  key: EisenhowerQuadrant
  /** Modifier suffix for the quadrant's CSS classes. */
  cssKey: string
  labelKey: string
  /** The importance/urgency a task takes on when dropped into this quadrant. */
  importance: Priority
  urgency: Priority
}

/**
 * The one description of the four quadrants. Previously this existed three times: as
 * `QUADRANTS` here, as `QUADRANT_DEFS` in eisenhower-view, and as `QUADRANT_TARGETS` in
 * both eisenhower-view and new-task-modal.
 */
export const QUADRANTS: QuadrantDef[] = [
  { key: 'doFirst', cssKey: 'do-first', labelKey: 'eisenhower.doFirst', importance: 'high', urgency: 'high' },
  { key: 'schedule', cssKey: 'schedule', labelKey: 'eisenhower.schedule', importance: 'high', urgency: 'low' },
  { key: 'delegate', cssKey: 'delegate', labelKey: 'eisenhower.delegate', importance: 'low', urgency: 'high' },
  { key: 'eliminate', cssKey: 'eliminate', labelKey: 'eisenhower.eliminate', importance: 'low', urgency: 'low' },
]

export const QUADRANT_BY_KEY: Record<EisenhowerQuadrant, QuadrantDef> = Object.fromEntries(
  QUADRANTS.map((q) => [q.key, q]),
) as Record<EisenhowerQuadrant, QuadrantDef>
