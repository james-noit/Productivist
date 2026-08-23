import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useLocalStorage } from '../composables/useLocalStorage'
import { useTodosStore } from './todos'
import type { Milestone, Project, ProjectExport } from '../types/project'

function createId(): string {
  return crypto.randomUUID()
}

export const useProjectsStore = defineStore('projects', () => {
  const todos = useTodosStore()

  const projects = useLocalStorage<Project[]>('productivist.projects', [])
  const milestones = useLocalStorage<Milestone[]>('productivist.milestones', [])

  const sortedProjects = computed(() => [...projects.value].sort((a, b) => a.order - b.order))

  function milestonesForProject(projectId: string): Milestone[] {
    return milestones.value
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => a.order - b.order)
  }

  function addProject(input: { icon: string; name: string; description: string; notes: string }) {
    const maxOrder = projects.value.reduce((max, p) => Math.max(max, p.order), -1)
    const project: Project = {
      id: createId(),
      icon: input.icon,
      name: input.name,
      description: input.description,
      notes: input.notes,
      order: maxOrder + 1,
      createdAt: Date.now(),
    }
    projects.value.push(project)
    return project
  }

  function updateProject(id: string, patch: Partial<Pick<Project, 'icon' | 'name' | 'description' | 'notes'>>) {
    const project = projects.value.find((p) => p.id === id)
    if (!project) return
    Object.assign(project, patch)
  }

  function removeProject(id: string) {
    const removedMilestoneIds = milestones.value.filter((m) => m.projectId === id).map((m) => m.id)
    milestones.value = milestones.value.filter((m) => m.projectId !== id)
    projects.value = projects.value.filter((p) => p.id !== id)
    todos.clearProjectRefs(id)
    for (const milestoneId of removedMilestoneIds) todos.clearMilestoneRefs(milestoneId)
  }

  function addMilestone(projectId: string, name: string) {
    const maxOrder = milestones.value
      .filter((m) => m.projectId === projectId)
      .reduce((max, m) => Math.max(max, m.order), -1)
    const milestone: Milestone = {
      id: createId(),
      projectId,
      name,
      order: maxOrder + 1,
      createdAt: Date.now(),
    }
    milestones.value.push(milestone)
    return milestone
  }

  function updateMilestone(id: string, patch: Partial<Pick<Milestone, 'name'>>) {
    const milestone = milestones.value.find((m) => m.id === id)
    if (!milestone) return
    Object.assign(milestone, patch)
  }

  function removeMilestone(id: string) {
    milestones.value = milestones.value.filter((m) => m.id !== id)
    todos.clearMilestoneRefs(id)
  }

  function exportProjects(): ProjectExport {
    return { projects: projects.value, milestones: milestones.value }
  }

  function importProjects(data: Partial<ProjectExport>) {
    projects.value = Array.isArray(data?.projects) ? data.projects : []
    milestones.value = Array.isArray(data?.milestones) ? data.milestones : []
  }

  function reset() {
    projects.value = []
    milestones.value = []
  }

  return {
    projects,
    milestones,
    sortedProjects,
    milestonesForProject,
    addProject,
    updateProject,
    removeProject,
    addMilestone,
    updateMilestone,
    removeMilestone,
    exportProjects,
    importProjects,
    reset,
  }
})
