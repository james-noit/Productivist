import { buildFlowGraph, chainOf, objectiveKey, taskKey, milestoneKey, type FlowGraph, type Progress } from './flow-graph';
import { horizonRank } from './flow-rules';
import type { Milestone, Project } from '../types/project';
import type { Todo } from '../types/todo';
import type { FlowLink, Objective } from '../types/flow';

/**
 * The tree behind Plan my day's "Work on current objectives": per project, its active objectives from the
 * longest horizon down, each with the open work that feeds it. Pure and framework-free; lazy UI only.
 */

/** Tasks shown per node; the rest is a "+N more" count. */
export const TASKS_PER_NODE = 5;

export interface TreeInput {
  /** In display order. */
  projects: readonly Project[];
  objectives: readonly Objective[];
  links: readonly FlowLink[];
  milestones: readonly Milestone[];
  todos: readonly Todo[];
}

export interface TreeMilestone {
  milestone: Milestone;
  tasks: Todo[];
}

export interface ObjectiveNode {
  objective: Objective;
  progress: Progress;
  /** Active objectives of a shorter horizon that feed this one. */
  children: ObjectiveNode[];
  /** Open work linked straight to this objective. */
  milestones: TreeMilestone[];
  tasks: Todo[];
  /** Open tasks beyond the cap. */
  more: number;
}

export interface ProjectSection {
  project: Project;
  roots: ObjectiveNode[];
  graph: FlowGraph;
}

/** targetDate ascending (none last), then order, then title. */
export function compareObjectives(a: Objective, b: Objective): number {
  if (a.targetDate !== b.targetDate) {
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return a.targetDate < b.targetDate ? -1 : 1;
  }
  return a.order - b.order || a.title.localeCompare(b.title);
}

export function buildObjectiveTree(input: TreeInput): ProjectSection[] {
  const objectivesBy = groupBy(input.objectives, (o) => o.projectId);
  const linksBy = groupBy(input.links, (l) => l.projectId);
  const milestonesBy = groupBy(input.milestones, (m) => m.projectId);
  const todosBy = groupBy(input.todos, (t) => t.projectId ?? '');

  const sections: ProjectSection[] = [];
  for (const project of input.projects) {
    const objectives = objectivesBy.get(project.id) ?? [];
    if (!objectives.some((o) => o.status === 'active')) continue;
    const graph = buildFlowGraph({
      projectId: project.id,
      objectives,
      links: linksBy.get(project.id) ?? [],
      milestones: milestonesBy.get(project.id) ?? [],
      todos: todosBy.get(project.id) ?? [],
      showDone: true,
    });
    sections.push({ project, graph, roots: buildRoots(graph) });
  }

  // The project with the earliest short-term target date first; undated ones keep their order after.
  const nearest = (s: ProjectSection): string | null =>
    s.graph.objectives
      .filter((o) => o.status === 'active' && o.horizon === 'short' && o.targetDate)
      .reduce<string | null>((min, o) => (min === null || o.targetDate! < min ? o.targetDate! : min), null);
  const keyed = sections.map((s, index) => ({ s, index, date: nearest(s) }));
  keyed.sort((a, b) => {
    if (a.date === b.date) return a.index - b.index;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? -1 : 1;
  });
  return keyed.map((k) => k.s);
}

function buildRoots(graph: FlowGraph): ObjectiveNode[] {
  const active = graph.objectives.filter((o) => o.status === 'active');
  const activeIds = new Set(active.map((o) => o.id));
  const todoById = new Map<string, Todo>();
  for (const card of graph.cards) for (const todo of card.rows) todoById.set(todo.id, todo);

  // Objectives that feed an active, longer one are children, not roots.
  const hasParent = new Set<string>();
  for (const link of graph.links) {
    if (link.fromKind === 'objective' && activeIds.has(link.fromId) && activeIds.has(link.toObjectiveId)) hasParent.add(link.fromId);
  }

  const nodeOf = (objective: Objective): ObjectiveNode => {
    const links = graph.byTarget.get(objective.id) ?? [];
    const children = links
      .filter((l) => l.fromKind === 'objective' && activeIds.has(l.fromId))
      .map((l) => graph.objectives.find((o) => o.id === l.fromId)!)
      .sort(compareObjectives)
      .map(nodeOf);

    const seen = new Set<string>();
    let shown = 0;
    let more = 0;
    const take = (todo: Todo | undefined): Todo | null => {
      if (!todo || todo.done || seen.has(todo.id)) return null;
      seen.add(todo.id);
      if (shown >= TASKS_PER_NODE) {
        more++;
        return null;
      }
      shown++;
      return todo;
    };
    const milestones: TreeMilestone[] = [];
    for (const link of links) {
      if (link.fromKind !== 'milestone') continue;
      const card = graph.cards.find((c) => c.key === milestoneKey(link.fromId));
      if (!card?.milestone) continue;
      const tasks = card.rows.map(take).filter((t): t is Todo => t !== null);
      if (tasks.length || card.rows.some((t) => !t.done)) milestones.push({ milestone: card.milestone, tasks });
    }
    const tasks = links
      .filter((l) => l.fromKind === 'task')
      .map((l) => take(todoById.get(l.fromId)))
      .filter((t): t is Todo => t !== null);

    return {
      objective,
      progress: graph.progress.get(objective.id) ?? { done: 0, total: 0, percent: 0 },
      children,
      milestones,
      tasks,
      more,
    };
  };

  const byHorizon = (horizon: Objective['horizon']) => active.filter((o) => o.horizon === horizon).sort(compareObjectives);
  const roots = [
    ...byHorizon('long'),
    ...byHorizon('medium').filter((o) => !hasParent.has(o.id)),
    ...byHorizon('short').filter((o) => !hasParent.has(o.id)),
  ];
  return roots.map(nodeOf);
}

/** The active objectives above `objectiveId`, nearest first, following the first parent by precedence at each step. */
export function chainUp(graph: FlowGraph, objectiveId: string): Objective[] {
  const byId = new Map(graph.objectives.map((o) => [o.id, o] as const));
  const out: Objective[] = [];
  const seen = new Set([objectiveId]);
  let current = objectiveId;
  for (;;) {
    const next = (graph.bySource.get(objectiveKey(current)) ?? [])
      .map((l) => byId.get(l.toObjectiveId))
      .filter((o): o is Objective => !!o && o.status === 'active' && !seen.has(o.id))
      .sort(compareObjectives)[0];
    if (!next) return out;
    out.push(next);
    seen.add(next.id);
    current = next.id;
  }
}

/** The first short-term active objective a task's chain reaches (by precedence), or null. */
export function shortObjectiveOfTask(graph: FlowGraph, taskId: string): Objective | null {
  const { nodes } = chainOf(graph, taskKey(taskId));
  return (
    graph.objectives
      .filter((o) => o.status === 'active' && o.horizon === 'short' && nodes.has(objectiveKey(o.id)))
      .sort(compareObjectives)[0] ?? null
  );
}

/** Ids of every task that feeds `objectiveId` (directly, through milestones or through shorter objectives). */
export function taskIdsFeeding(graph: FlowGraph, objectiveId: string): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const link of graph.byTarget.get(id) ?? []) {
      if (link.fromKind === 'task') out.add(link.fromId);
      else if (link.fromKind === 'milestone') for (const t of graph.tasksOfCard.get(milestoneKey(link.fromId)) ?? []) out.add(t);
      else visit(link.fromId);
    }
  };
  visit(objectiveId);
  return out;
}

/** Shortest horizon first, for a stable list of short-term objectives. */
export const byHorizonThenPrecedence = (a: Objective, b: Objective): number =>
  horizonRank(a.horizon) - horizonRank(b.horizon) || compareObjectives(a, b);

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
