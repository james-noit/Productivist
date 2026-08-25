import type { Priority, Todo } from '../types/todo'
import type { EisenhowerQuadrant } from '../types/eisenhower'

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export function sortByPriority(list: Todo[]): Todo[] {
  return [...list].sort((a, b) => {
    const importanceDiff = PRIORITY_RANK[a.importance] - PRIORITY_RANK[b.importance]
    if (importanceDiff !== 0) return importanceDiff
    return PRIORITY_RANK[a.urgency] - PRIORITY_RANK[b.urgency]
  })
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

export const QUADRANTS: { key: EisenhowerQuadrant; cssKey: string; labelKey: string }[] = [
  { key: 'doFirst', cssKey: 'do-first', labelKey: 'eisenhower.doFirst' },
  { key: 'schedule', cssKey: 'schedule', labelKey: 'eisenhower.schedule' },
  { key: 'delegate', cssKey: 'delegate', labelKey: 'eisenhower.delegate' },
  { key: 'eliminate', cssKey: 'eliminate', labelKey: 'eisenhower.eliminate' },
]
