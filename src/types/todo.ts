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
}

export interface TodoExport {
  version: 1
  todos: Todo[]
}
