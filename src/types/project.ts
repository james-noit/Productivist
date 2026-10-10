export interface Project {
  id: string
  icon: string
  name: string
  description: string
  notes: string
  order: number
  createdAt: number
}

export interface Milestone {
  id: string
  projectId: string
  name: string
  order: number
  createdAt: number
  /** Local calendar days as 'YYYY-MM-DD' (see lib/dates.ts). */
  startDate?: string
  dueDate?: string
}

export interface ProjectExport {
  projects: Project[]
  milestones: Milestone[]
}
