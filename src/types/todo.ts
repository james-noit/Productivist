export type Priority = 'low' | 'medium' | 'high'

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
}

export interface TodoExport {
  version: 1
  todos: Todo[]
}
