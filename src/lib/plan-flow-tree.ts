import { buildFlowGraph, chainOf, objectiveKey, taskKey, milestoneKey, type FlowGraph } from './flow-graph';
import { horizonRank } from './flow-rules';
import type { Milestone, Project } from '../types/project';
import type { Todo } from '../types/todo';
import type { FlowLink, Objective } from '../types/flow';

/**
 * The drill-down behind Plan my day's "Work on current objectives": per project, the chain long -> medium -> short ->
 * open tasks, one level at a time. Pure and framework-free; lazy UI only.
 */

export interface TreeInput {
  /** In display order. */
  projects: readonly Project[];
  objectives: readonly Objective[];
  links: readonly FlowLink[];
  milestones: readonly Milestone[];
  todos: readonly Todo[];
}

export interface ProjectEntry {
  project: Project;
  graph: FlowGraph;
}

export interface WorkGroup {
  milestone: Milestone;
  tasks: Todo[];
}

/** The open work feeding a short-term objective: tasks by linked milestone, then tasks linked directly. */
export interface Work {
  groups: WorkGroup[];
  direct: Todo[];
  count: number;
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

/** One entry per project that has at least one active objective; the one with the earliest short-term date first. */
export function projectsWithObjectives(input: TreeInput): ProjectEntry[] {
  const objectivesBy = groupBy(input.objectives, (o) => o.projectId);
  const linksBy = groupBy(input.links, (l) => l.projectId);
  const milestonesBy = groupBy(input.milestones, (m) => m.projectId);
  const todosBy = groupBy(input.todos, (t) => t.projectId ?? '');

  const entries: ProjectEntry[] = [];
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
    entries.push({ project, graph });
  }

  const nearest = (e: ProjectEntry): string | null =>
    e.graph.objectives
      .filter((o) => o.status === 'active' && o.horizon === 'short' && o.targetDate)
      .reduce<string | null>((min, o) => (min === null || o.targetDate! < min ? o.targetDate! : min), null);
  const keyed = entries.map((e, index) => ({ e, index, date: nearest(e) }));
  keyed.sort((a, b) => {
    if (a.date === b.date) return a.index - b.index;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? -1 : 1;
  });
  return keyed.map((k) => k.e);
}

const activeOf = (graph: FlowGraph) => graph.objectives.filter((o) => o.status === 'active');

/** Ids of active objectives that feed an active, longer one. */
function withParent(graph: FlowGraph, active: readonly Objective[]): Set<string> {
  const ids = new Set(active.map((o) => o.id));
  const out = new Set<string>();
  for (const link of graph.links) {
    if (link.fromKind === 'objective' && ids.has(link.fromId) && ids.has(link.toObjectiveId)) out.add(link.fromId);
  }
  return out;
}

/** The active long-term objectives. */
export function rootsOf(graph: FlowGraph): Objective[] {
  return activeOf(graph)
    .filter((o) => o.horizon === 'long')
    .sort(compareObjectives);
}

/** Active medium/short objectives that sit under no active longer one: they enter the path at their own level. */
export function orphansOf(graph: FlowGraph): Objective[] {
  const active = activeOf(graph);
  const parented = withParent(graph, active);
  return active
    .filter((o) => o.horizon !== 'long' && !parented.has(o.id))
    .sort((a, b) => horizonRank(b.horizon) - horizonRank(a.horizon) || compareObjectives(a, b));
}

/** The active objectives of a shorter horizon linked straight to `parent` (a long one also lists short ones with no medium between). */
export function childrenOf(graph: FlowGraph, parent: Objective): Objective[] {
  const byId = new Map(graph.objectives.map((o) => [o.id, o] as const));
  const own = (id: string): Objective[] => {
    const seen = new Set<string>();
    const out: Objective[] = [];
    for (const l of graph.byTarget.get(id) ?? []) {
      const o = l.fromKind === 'objective' ? byId.get(l.fromId) : undefined;
      if (o && o.status === 'active' && horizonRank(o.horizon) < horizonRank(byId.get(id)!.horizon) && !seen.has(o.id)) {
        seen.add(o.id);
        out.push(o);
      }
    }
    return out;
  };
  const direct = own(parent.id);
  if (parent.horizon !== 'long') return direct.sort(compareObjectives);
  const mediums = direct.filter((o) => o.horizon === 'medium');
  const viaMedium = new Set(mediums.flatMap((m) => own(m.id).map((o) => o.id)));
  return [...mediums, ...direct.filter((o) => o.horizon === 'short' && !viaMedium.has(o.id))].sort(compareObjectives);
}

/** The longest prefix of `path` that is still a valid, active walk down from the top level. */
export function validPath(graph: FlowGraph, path: readonly string[]): string[] {
  const byId = new Map(graph.objectives.map((o) => [o.id, o] as const));
  const out: string[] = [];
  let allowed: Objective[] = [...rootsOf(graph), ...orphansOf(graph)];
  for (const id of path) {
    const o = byId.get(id);
    if (!o || !allowed.some((a) => a.id === id)) break;
    out.push(id);
    allowed = o.horizon === 'short' ? [] : childrenOf(graph, o);
  }
  return out;
}

/** Open tasks that feed `shortId`: through linked milestones (grouped), then linked directly. */
export function workOf(graph: FlowGraph, shortId: string): Work {
  const links = graph.byTarget.get(shortId) ?? [];
  const todoById = new Map<string, Todo>();
  for (const card of graph.cards) for (const todo of card.rows) todoById.set(todo.id, todo);
  const seen = new Set<string>();
  const groups: WorkGroup[] = [];
  for (const link of links) {
    if (link.fromKind !== 'milestone') continue;
    const card = graph.cards.find((c) => c.key === milestoneKey(link.fromId));
    if (!card?.milestone) continue;
    const tasks = card.rows.filter((t) => !t.done && !seen.has(t.id));
    for (const t of tasks) seen.add(t.id);
    if (tasks.length) groups.push({ milestone: card.milestone, tasks });
  }
  const direct: Todo[] = [];
  for (const link of links) {
    const todo = link.fromKind === 'task' ? todoById.get(link.fromId) : undefined;
    if (todo && !todo.done && !seen.has(todo.id)) {
      seen.add(todo.id);
      direct.push(todo);
    }
  }
  return { groups, direct, count: seen.size };
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
