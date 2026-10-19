import type { ExternalRef, ProjectSource } from './forge'

export interface Project {
  id: string
  icon: string
  name: string
  description: string
  notes: string
  order: number
  createdAt: number
  /** Set when imported from a Git forge (see types/forge.ts); absent otherwise. */
  source?: ProjectSource
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
  source?: ExternalRef
}

export interface ProjectExport {
  projects: Project[]
  milestones: Milestone[]
}
