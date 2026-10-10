import { isLinkCoherent } from './flow-rules';
import type { Milestone } from '../types/project';
import type { Todo } from '../types/todo';
import type { FlowLink, Objective } from '../types/flow';

/**
 * The Flow diagram's graph, derived from the stores: the cards of the Work lane, each objective's
 * progress rolled up from the work linked to it, and the upstream/downstream chain of a node for
 * highlighting. Pure and framework-free; only the lazy Flow components import it.
 *
 * Node keys are the ones FlowLayout positions use, plus `task:<id>` for the rows inside cards:
 * `objective:<id>`, `milestone:<id>`, `nomilestone:<projectId>`, `task:<id>`. The key of a link's source
 * is `${fromKind}:${fromId}`, which is the same string, so sources and nodes share one id space.
 */

export const objectiveKey = (id: string): string => `objective:${id}`;
export const milestoneKey = (id: string): string => `milestone:${id}`;
export const noMilestoneKey = (projectId: string): string => `nomilestone:${projectId}`;
export const taskKey = (id: string): string => `task:${id}`;

export interface Progress {
  done: number;
  total: number;
  percent: number;
}

/** A card of the Work lane: a milestone, or the pseudo-card of the tasks that have none. */
export interface WorkCard {
  key: string;
  /** Null for the "No milestone" card. */
  milestone: Milestone | null;
  /** The rows shown: every task, or only the open ones while "Show done" is off. Ordered by `order`. */
  rows: Todo[];
  done: number;
  total: number;
}

export interface FlowGraphInput {
  projectId: string;
  objectives: readonly Objective[];
  links: readonly FlowLink[];
  /** The project's milestones, in display order. */
  milestones: readonly Milestone[];
  /** The project's tasks only. */
  todos: readonly Todo[];
  showDone: boolean;
}

export interface FlowGraph {
  /** "No milestone" first (only when the project has such tasks), then the milestones in order. */
  cards: WorkCard[];
  /** Sorted by `order`. */
  objectives: Objective[];
  /** Links that are still coherent and whose source exists (dangling ones are skipped). */
  links: FlowLink[];
  /** Objective id → progress rolled up from its linked work (deduplicated by task). */
  progress: Map<string, Progress>;
  /** Task id → key of the card it sits in. */
  cardOfTask: Map<string, string>;
  /** Task id → index among its card's visible rows (absent when the row is hidden). */
  rowOfTask: Map<string, number>;
  /** Card key → the ids of all its tasks (hidden rows included). */
  tasksOfCard: Map<string, string[]>;
  /** Link ids by source key and by target objective id, for chain walks. */
  bySource: Map<string, FlowLink[]>;
  byTarget: Map<string, FlowLink[]>;
}

/** What the selected node serves and what feeds it. `nodes` holds node keys (cards, rows and objectives). */
export interface Chain {
  nodes: Set<string>;
  links: Set<string>;
}

const percentOf = (done: number, total: number): number => (total ? Math.round((done / total) * 100) : 0);

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildFlowGraph(input: FlowGraphInput): FlowGraph {
  const { projectId, milestones, showDone } = input;
  const knownMilestones = new Set(milestones.map((m) => m.id));
  const todoById = new Map<string, Todo>();

  // One pass over the tasks: group them by card, in `order`.
  const ordered = [...input.todos].sort((a, b) => a.order - b.order);
  const loose: Todo[] = [];
  const byMilestone = new Map<string, Todo[]>();
  for (const todo of ordered) {
    todoById.set(todo.id, todo);
    if (todo.milestoneId && knownMilestones.has(todo.milestoneId)) push(byMilestone, todo.milestoneId, todo);
    else loose.push(todo);
  }

  const cards: WorkCard[] = [];
  const cardOfTask = new Map<string, string>();
  const rowOfTask = new Map<string, number>();
  const tasksOfCard = new Map<string, string[]>();
  const addCard = (key: string, milestone: Milestone | null, tasks: readonly Todo[]) => {
    const rows = showDone ? [...tasks] : tasks.filter((t) => !t.done);
    cards.push({ key, milestone, rows, done: tasks.filter((t) => t.done).length, total: tasks.length });
    tasksOfCard.set(key, tasks.map((t) => t.id));
    rows.forEach((t, index) => rowOfTask.set(t.id, index));
    for (const t of tasks) cardOfTask.set(t.id, key);
  };
  if (loose.length) addCard(noMilestoneKey(projectId), null, loose);
  for (const m of milestones) addCard(milestoneKey(m.id), m, byMilestone.get(m.id) ?? []);

  const objectives = [...input.objectives].sort((a, b) => a.order - b.order);
  const byId = new Map(objectives.map((o) => [o.id, o]));

  const links = input.links.filter((link) => {
    if (!isLinkCoherent(link, byId)) return false;
    if (link.fromKind === 'task') return todoById.has(link.fromId);
    if (link.fromKind === 'milestone') return knownMilestones.has(link.fromId);
    return true;
  });
  const bySource = new Map<string, FlowLink[]>();
  const byTarget = new Map<string, FlowLink[]>();
  for (const link of links) {
    push(bySource, `${link.fromKind}:${link.fromId}`, link);
    push(byTarget, link.toObjectiveId, link);
  }

  // Progress: the union of the task sets feeding an objective, so a task reachable twice counts once.
  // Objective links only run toward longer horizons, so the recursion ends; `visiting` guards bad data.
  const taskSets = new Map<string, Set<string>>();
  const visiting = new Set<string>();
  const taskSetOf = (objectiveId: string): Set<string> => {
    const cached = taskSets.get(objectiveId);
    if (cached) return cached;
    const set = new Set<string>();
    if (visiting.has(objectiveId)) return set;
    visiting.add(objectiveId);
    for (const link of byTarget.get(objectiveId) ?? []) {
      if (link.fromKind === 'task') set.add(link.fromId);
      else if (link.fromKind === 'milestone') for (const id of tasksOfCard.get(milestoneKey(link.fromId)) ?? []) set.add(id);
      else for (const id of taskSetOf(link.fromId)) set.add(id);
    }
    visiting.delete(objectiveId);
    taskSets.set(objectiveId, set);
    return set;
  };
  const progress = new Map<string, Progress>();
  for (const objective of objectives) {
    let done = 0;
    const tasks = taskSetOf(objective.id);
    for (const id of tasks) if (todoById.get(id)?.done) done++;
    progress.set(objective.id, { done, total: tasks.size, percent: percentOf(done, tasks.size) });
  }

  return { cards, objectives, links, progress, cardOfTask, rowOfTask, tasksOfCard, bySource, byTarget };
}

/**
 * The chain of a node, for highlighting: everything it feeds (downstream, through objective-to-objective
 * links up to the longest horizon) and, for an objective, everything feeding it (upstream). A task also
 * serves what its milestone is linked to, and a milestone also what its tasks are linked to.
 */
export function chainOf(graph: FlowGraph, key: string): Chain {
  const chain: Chain = { nodes: new Set([key]), links: new Set() };

  const walkDown = (starts: readonly string[]) => {
    const seen = new Set<string>(starts);
    const queue = [...starts];
    while (queue.length) {
      const source = queue.shift()!;
      for (const link of graph.bySource.get(source) ?? []) {
        chain.links.add(link.id);
        const target = objectiveKey(link.toObjectiveId);
        chain.nodes.add(target);
        if (!seen.has(target)) {
          seen.add(target);
          queue.push(target);
        }
      }
    }
  };

  const walkUp = (objectiveId: string) => {
    const seen = new Set<string>([objectiveId]);
    const queue = [objectiveId];
    while (queue.length) {
      const target = queue.shift()!;
      for (const link of graph.byTarget.get(target) ?? []) {
        chain.links.add(link.id);
        const source = `${link.fromKind}:${link.fromId}`;
        chain.nodes.add(source);
        if (link.fromKind === 'objective') {
          if (!seen.has(link.fromId)) {
            seen.add(link.fromId);
            queue.push(link.fromId);
          }
        } else if (link.fromKind === 'milestone') {
          for (const id of graph.tasksOfCard.get(source) ?? []) chain.nodes.add(taskKey(id));
        } else {
          const card = graph.cardOfTask.get(link.fromId);
          if (card) chain.nodes.add(card);
        }
      }
    }
  };

  const sep = key.indexOf(':');
  const kind = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if (kind === 'objective') {
    walkDown([key]);
    walkUp(id);
  } else if (kind === 'task') {
    const card = graph.cardOfTask.get(id);
    const starts = [key];
    if (card) {
      chain.nodes.add(card);
      if (card.startsWith('milestone:')) starts.push(card);
    }
    walkDown(starts);
  } else if (kind === 'milestone' || kind === 'nomilestone') {
    const tasks = (graph.tasksOfCard.get(key) ?? []).map(taskKey);
    for (const t of tasks) chain.nodes.add(t);
    walkDown([key, ...tasks]);
  }
  return chain;
}

/**
 * Task id → titles of the open objectives it serves (directly, through its milestone or through the
 * objectives those feed), for the read-only 🎯 chips of the Kanban cards and List rows. Tasks that serve
 * nothing are absent. Dropped objectives do not count. Cheap when the project has no links.
 */
export function objectivesServing(input: Omit<FlowGraphInput, 'showDone'>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!input.objectives.length || !input.links.length) return out;
  const graph = buildFlowGraph({ ...input, showDone: true });
  const served = graph.objectives.filter((o) => o.status !== 'dropped');
  for (const taskId of graph.cardOfTask.keys()) {
    const { nodes } = chainOf(graph, taskKey(taskId));
    const titles = served.filter((o) => nodes.has(objectiveKey(o.id))).map((o) => o.title);
    if (titles.length) out.set(taskId, titles);
  }
  return out;
}
