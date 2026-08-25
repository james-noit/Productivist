import type { Todo } from '../types/todo'
import type { EisenhowerQuadrant } from '../types/eisenhower'

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
