import type { ExternalRef } from './forge'

export type Priority = 'low' | 'medium' | 'high'

/** Workflow column of the project board. Absent means 'todo'; completion is the separate `done` flag. */
export type TaskStatus = 'todo' | 'inProgress' | 'review'

export interface Todo {
  id: string
  title: string
  description?: string
  importance: Priority
  urgency: Priority
  tags: string[]
  done: boolean
  order: number
  createdAt: number
  completedAt?: number
  projectId?: string
  milestoneId?: string
  pomodorosForTermination?: number
  status?: TaskStatus
  /** Local calendar days as 'YYYY-MM-DD' (see lib/dates.ts); never epoch values, which shift across timezones. */
  startDate?: string
  dueDate?: string
  /** The recurring series this task is an occurrence of (see types/recurrence.ts); absent for ordinary tasks. */
  recurrenceId?: string
  /** Set when imported from a Git forge issue (see types/forge.ts); absent otherwise. */
  source?: ExternalRef
}

export interface TodoExport {
  version: 1
  todos: Todo[]
}
