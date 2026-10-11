import { addDays } from './dates';
import { classify, comparePriority, type QuadrantCounts } from './eisenhower';
import type { Objective } from '../types/flow';
import type { Milestone, Project } from '../types/project';
import type { Todo } from '../types/todo';

/**
 * The numbers behind the Tasks and projects page, all pure. One pass over the todos produces everything a
 * project card (and the stat tiles) shows, keyed by project id, so the view does not re-scan the list per card.
 * Only the lazy projects view imports this file.
 */

export type ProjectsSort = 'manual' | 'urgency' | 'due' | 'name';
/** `productivist.projectsSort` held 'manual' | 'urgency' before; both stay valid. Anything else falls back to manual. */
export const PROJECTS_SORTS: readonly ProjectsSort[] = ['manual', 'urgency', 'due', 'name'];

export type TaskFilter = 'week' | 'overdue';

/** How many tasks a card lists under "Next up". */
export const NEXT_UP_LIMIT = 3;
/** "Due this week" is today and the six days after it. */
export const WEEK_DAYS = 7;

export interface ProjectStats {
  total: number;
  done: number;
  open: number;
  percent: number;
  quadrants: QuadrantCounts;
  overdue: number;
  /** The earliest due date among the open tasks, or null. */
  nextDue: string | null;
  milestones: number;
  objectives: number;
  /** The open tasks to work on next (see `compareNextUp`), at most `NEXT_UP_LIMIT`. */
  nextUp: Todo[];
}

export interface PageStats {
  byProject: Map<string, ProjectStats>;
  /** Open tasks with no project, in the app's usual order (the inbox). */
  inbox: Todo[];
  /** Every open task of each project in "next up" order: what the search and tile filters look through. */
  openByProject: Map<string, Todo[]>;
  quadrants: QuadrantCounts;
  open: number;
  overdue: number;
  dueWeek: number;
}

const emptyCounts = (): QuadrantCounts => ({ doFirst: 0, schedule: 0, delegate: 0, eliminate: 0 });

/**
 * In progress first, then overdue, then importance/urgency, then the earlier due date (no date last), then the
 * stored order. A plain comparator so it can feed `Array.sort` (which is stable).
 */
export function compareNextUp(today: string): (a: Todo, b: Todo) => number {
  const rank = (todo: Todo): number => (todo.status === 'inProgress' ? 0 : todo.dueDate && todo.dueDate < today ? 1 : 2);
  return (a, b) =>
    rank(a) - rank(b) ||
    comparePriority(a, b) ||
    (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') ||
    a.order - b.order;
}

/** Everything the page shows, in one pass over `todos` plus one over the milestones and objectives. */
export function buildPageStats(
  todos: readonly Todo[],
  projects: readonly Project[],
  milestones: readonly Milestone[],
  objectivesByProject: ReadonlyMap<string, readonly Objective[]>,
  today: string,
  inboxOrder: (list: Todo[]) => Todo[],
): PageStats {
  const weekEnd = addDays(today, WEEK_DAYS - 1);
  const byProject = new Map<string, ProjectStats>();
  const openByProject = new Map<string, Todo[]>();
  for (const project of projects) {
    byProject.set(project.id, {
      total: 0,
      done: 0,
      open: 0,
      percent: 0,
      quadrants: emptyCounts(),
      overdue: 0,
      nextDue: null,
      milestones: 0,
      objectives: 0,
      nextUp: [],
    });
    openByProject.set(project.id, []);
  }

  const inbox: Todo[] = [];
  const quadrants = emptyCounts();
  let open = 0;
  let overdue = 0;
  let dueWeek = 0;

  for (const todo of todos) {
    const stats = todo.projectId ? byProject.get(todo.projectId) : undefined;
    if (stats) {
      stats.total++;
      if (todo.done) stats.done++;
    }
    if (todo.done) continue;

    open++;
    const quadrant = classify(todo);
    quadrants[quadrant]++;
    const late = !!todo.dueDate && todo.dueDate < today;
    if (late) overdue++;
    else if (todo.dueDate && todo.dueDate <= weekEnd) dueWeek++;

    if (!todo.projectId) {
      inbox.push(todo);
    } else if (stats) {
      stats.open++;
      stats.quadrants[quadrant]++;
      if (late) stats.overdue++;
      if (todo.dueDate && (!stats.nextDue || todo.dueDate < stats.nextDue)) stats.nextDue = todo.dueDate;
      openByProject.get(todo.projectId)!.push(todo);
    }
  }

  const byNextUp = compareNextUp(today);
  for (const [id, stats] of byProject) {
    stats.percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
    stats.nextUp = openByProject.get(id)!.sort(byNextUp).slice(0, NEXT_UP_LIMIT);
  }
  for (const milestone of milestones) {
    const stats = byProject.get(milestone.projectId);
    if (stats) stats.milestones++;
  }
  for (const [projectId, list] of objectivesByProject) {
    const stats = byProject.get(projectId);
    if (stats) stats.objectives = list.filter((o) => o.status !== 'dropped').length;
  }

  return { byProject, inbox: inboxOrder(inbox), openByProject, quadrants, open, overdue, dueWeek };
}

/** Lower-cases and strips accents, so "reunion" finds "Reunión". */
export function normalizeQuery(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Whether an open task shows under the active tile filter and search text (both may be off). */
export function taskMatches(todo: Todo, query: string, filter: TaskFilter | null, today: string): boolean {
  if (filter === 'overdue' && !(todo.dueDate && todo.dueDate < today)) return false;
  if (filter === 'week' && !(todo.dueDate && todo.dueDate >= today && todo.dueDate <= addDays(today, WEEK_DAYS - 1))) return false;
  if (!query) return true;
  return normalizeQuery(todo.title).includes(query) || todo.tags.some((tag) => normalizeQuery(tag).includes(query));
}

/** Orders cards by the chosen sort; ties keep the incoming (manual) order because `Array.sort` is stable. */
export function sortCards<T extends { project: Project; stats: ProjectStats }>(
  cards: T[],
  sort: ProjectsSort,
  locale: string,
): T[] {
  switch (sort) {
    case 'urgency':
      return cards.sort(
        (a, b) =>
          b.stats.quadrants.doFirst - a.stats.quadrants.doFirst ||
          b.stats.quadrants.delegate - a.stats.quadrants.delegate ||
          b.stats.quadrants.schedule - a.stats.quadrants.schedule ||
          b.stats.quadrants.eliminate - a.stats.quadrants.eliminate,
      );
    case 'due':
      return cards.sort((a, b) => (a.stats.nextDue ?? '9999-12-31').localeCompare(b.stats.nextDue ?? '9999-12-31'));
    case 'name': {
      const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
      return cards.sort((a, b) => collator.compare(a.project.name, b.project.name));
    }
    default:
      return cards;
  }
}

/**
 * A stable colour slot (0 to TINTS - 1) for a project, from a hash of its id. The page maps the slot to a theme
 * token (`data-tint`), so projects look different without a new data field and every theme keeps its palette.
 */
export const TINTS = 6;
export function tintOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % TINTS;
}

/** A task as a card or the inbox lists it: the todo plus its due date already formatted for display. */
export interface TaskRow {
  todo: Todo;
  /** The formatted due date, or null. */
  due: string | null;
  overdue: boolean;
}

/** One project card: the project, its numbers, and the tasks listed on it (next up, or the ones matching the filters). */
export interface ProjectCardView {
  project: Project;
  stats: ProjectStats;
  rows: TaskRow[];
  /** True when `rows` are the tasks matching the search / tile filter instead of the plain "next up". */
  matching: boolean;
}
