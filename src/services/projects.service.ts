import { Injectable, computed, inject } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { createId } from '../core/create-id';
import { TodosService } from './todos.service';
import type { Milestone, Project, ProjectExport } from '../types/project';


@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly todos = inject(TodosService);

  readonly projects = localStorageSignal<Project[]>('productivist.projects', []);
  readonly milestones = localStorageSignal<Milestone[]>('productivist.milestones', []);

  readonly sortedProjects = computed(() => [...this.projects()].sort((a, b) => a.order - b.order));

  milestonesForProject(projectId: string): Milestone[] {
    return this.milestones()
      .filter((m) => m.projectId === projectId)
      .sort((a, b) => a.order - b.order);
  }

  addProject(input: { icon: string; name: string; description: string; notes: string }): Project {
    const maxOrder = this.projects().reduce((max, p) => Math.max(max, p.order), -1);
    const project: Project = {
      id: createId(),
      icon: input.icon,
      name: input.name,
      description: input.description,
      notes: input.notes,
      order: maxOrder + 1,
      createdAt: Date.now(),
    };
    this.projects.update((list) => [...list, project]);
    return project;
  }

  updateProject(id: string, patch: Partial<Pick<Project, 'icon' | 'name' | 'description' | 'notes'>>): void {
    this.projects.update((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  removeProject(id: string): void {
    const removedMilestoneIds = this.milestones()
      .filter((m) => m.projectId === id)
      .map((m) => m.id);
    this.milestones.update((list) => list.filter((m) => m.projectId !== id));
    this.projects.update((list) => list.filter((p) => p.id !== id));
    this.todos.clearProjectRefs(id);
    for (const milestoneId of removedMilestoneIds) this.todos.clearMilestoneRefs(milestoneId);
  }

  addMilestone(projectId: string, name: string): Milestone {
    const maxOrder = this.milestones()
      .filter((m) => m.projectId === projectId)
      .reduce((max, m) => Math.max(max, m.order), -1);
    const milestone: Milestone = {
      id: createId(),
      projectId,
      name,
      order: maxOrder + 1,
      createdAt: Date.now(),
    };
    this.milestones.update((list) => [...list, milestone]);
    return milestone;
  }

  updateMilestone(id: string, patch: Partial<Pick<Milestone, 'name'>>): void {
    this.milestones.update((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  removeMilestone(id: string): void {
    this.milestones.update((list) => list.filter((m) => m.id !== id));
    this.todos.clearMilestoneRefs(id);
  }

  exportProjects(): ProjectExport {
    return { projects: this.projects(), milestones: this.milestones() };
  }

  importProjects(data: Partial<ProjectExport>): void {
    this.projects.set(Array.isArray(data?.projects) ? data.projects : []);
    this.milestones.set(Array.isArray(data?.milestones) ? data.milestones : []);
  }

  reset(): void {
    this.projects.set([]);
    this.milestones.set([]);
  }
}
