import { isIsoDate, sanitizeDates, toIso } from './dates';
import { hashString } from './sync-engine';
import type { Milestone, Project } from '../types/project';
import type { Priority, TaskStatus, Todo } from '../types/todo';
import type {
  ExternalRef,
  ForgeConnection,
  ForgeKind,
  ProjectSource,
  RemoteIssue,
  RemoteMilestone,
  RemoteRepo,
  RepoSourceOptions,
} from '../types/forge';

/**
 * Pure mapping between what a Git forge returns (already normalised by `forge-adapters.ts`) and Productivist's
 * projects, milestones and tasks, plus the merge rules of a refresh. No `fetch` and no Angular here. Lazy: only the
 * Forge services and UI import it.
 */

const MAX_DESCRIPTION = 100_000;
const MAX_PROJECT_DESCRIPTION = 5000;
const MAX_TITLE = 1000;
const MAX_TAGS = 100;
const MAX_TAG = 100;

// ---- Ids and URLs ---------------------------------------------------------------------------------------------

/** Deterministic row id from a remote identity, so two devices importing the same issue produce the same todo. */
export function forgeId(parts: readonly string[]): string {
  return 'fg-' + hashString(parts.join('|'));
}

/**
 * Lower-cases scheme and host, drops the query, the fragment, a trailing slash and anything from `/api` on, and
 * assumes https when no scheme was typed. Null when the result is not an http(s) URL.
 */
export function normalizeBaseUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  let path = url.pathname;
  const api = path.search(/\/api(\/|$)/i);
  if (api !== -1) path = path.slice(0, api);
  return url.origin + path.replace(/\/+$/, '');
}

/** Root of the REST API of a connection. */
export function apiBase(conn: Pick<ForgeConnection, 'kind' | 'baseUrl'>): string {
  const base = conn.baseUrl;
  switch (conn.kind) {
    case 'github':
      return new URL(base).hostname === 'github.com' ? 'https://api.github.com' : `${base}/api/v3`;
    case 'gitlab':
      return `${base}/api/v4`;
    case 'gitea':
      return `${base}/api/v1`;
  }
}

/** What each platform has: due dates on issues, start dates on milestones. */
export function ruleOf(kind: ForgeKind): { dueDates: boolean; milestoneStart: boolean } {
  // GitHub issues have no due date and GitHub milestones have no start date; Gitea milestones have no start date either.
  return { dueDates: kind !== 'github', milestoneStart: kind === 'gitlab' };
}

// ---- Dates ----------------------------------------------------------------------------------------------------

/** A plain 'YYYY-MM-DD' is kept; a timestamp becomes its local calendar day. Undefined for anything else. */
export function toLocalDay(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  if (isIsoDate(value)) return value;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : toIso(new Date(time));
}

function toEpoch(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
}

// ---- Labels ---------------------------------------------------------------------------------------------------

interface LabelRule<T> {
  test: RegExp;
  value: T;
}

// Labels are normalised first: lower case, "::", ":", "/", "-" and "_" become a space ("Priority::High" -> "priority high").
const URGENCY_RULES: LabelRule<Priority>[] = [
  { test: /^(priority )?(p0|p1|critical|urgent|blocker|highest|high)$/, value: 'high' },
  { test: /^(priority )?(p3|p4|lowest|low)$/, value: 'low' },
];
const IMPORTANCE_RULES: LabelRule<Priority>[] = [{ test: /^important$/, value: 'high' }];
const STATUS_RULES: LabelRule<TaskStatus>[] = [
  { test: /^(status |workflow )?(in progress|doing|in dev|wip)$/, value: 'inProgress' },
  { test: /^(status |workflow )?(review|needs review|in review)$/, value: 'review' },
];

const normalizeLabel = (label: string): string => label.toLowerCase().replace(/[:/_-]+/g, ' ').replace(/\s+/g, ' ').trim();

function firstMatch<T>(labels: readonly string[], rules: readonly LabelRule<T>[]): T | undefined {
  for (const label of labels) {
    const text = normalizeLabel(label);
    for (const rule of rules) if (rule.test.test(text)) return rule.value;
  }
  return undefined;
}

export function priorityFromLabels(labels: readonly string[]): { importance: Priority; urgency: Priority } {
  return {
    importance: firstMatch(labels, IMPORTANCE_RULES) ?? 'medium',
    urgency: firstMatch(labels, URGENCY_RULES) ?? 'medium',
  };
}

export function statusFromLabels(labels: readonly string[]): TaskStatus | undefined {
  return firstMatch(labels, STATUS_RULES);
}

// ---- Import context -------------------------------------------------------------------------------------------

/** What identifies the repository being imported; everything the builders need besides the remote item itself. */
export interface RepoRef {
  kind: ForgeKind;
  host: string;
  repoId: string;
  repoPath: string;
  /** Web URL of the repository. */
  url: string;
}

export function repoRefOf(conn: Pick<ForgeConnection, 'kind' | 'baseUrl'>, repo: RemoteRepo): RepoRef {
  return { kind: conn.kind, host: conn.baseUrl, repoId: repo.id, repoPath: repo.path, url: repo.url };
}

export const projectIdOf = (r: Pick<RepoRef, 'kind' | 'host' | 'repoId'>): string => forgeId([r.kind, r.host, r.repoId]);
export const milestoneIdOf = (r: Pick<RepoRef, 'kind' | 'host' | 'repoId'>, remoteId: number): string =>
  forgeId([r.kind, r.host, r.repoId, 'm', String(remoteId)]);
export const todoIdOf = (r: Pick<RepoRef, 'kind' | 'host' | 'repoId'>, number: number): string =>
  forgeId([r.kind, r.host, r.repoId, 'i', String(number)]);

const refOf = (r: RepoRef): ExternalRef => ({ kind: r.kind, host: r.host, repoId: r.repoId, repoPath: r.repoPath, url: r.url });

// ---- Builders -------------------------------------------------------------------------------------------------

export function buildProject(r: RepoRef, repo: RemoteRepo, options: RepoSourceOptions, now: number): Project {
  return {
    id: projectIdOf(r),
    icon: 'code',
    name: repo.name || repo.path,
    description: repo.description.slice(0, MAX_PROJECT_DESCRIPTION),
    notes: '',
    order: 0,
    createdAt: now,
    source: { ...refOf(r), options },
  };
}

export function buildMilestone(r: RepoRef, remote: RemoteMilestone, now: number): Milestone {
  const rules = ruleOf(r.kind);
  const milestone: Milestone = sanitizeDates({
    id: milestoneIdOf(r, remote.id),
    projectId: projectIdOf(r),
    name: remote.title.slice(0, 500) || `#${remote.id}`,
    order: 0,
    createdAt: now,
    startDate: rules.milestoneStart ? toLocalDay(remote.startDate) : undefined,
    dueDate: toLocalDay(remote.dueDate),
    source: { ...refOf(r), number: remote.id, url: remote.url, ...(remote.updatedAt ? { remoteUpdatedAt: remote.updatedAt } : {}) },
  });
  if (milestone.startDate === undefined) delete milestone.startDate;
  if (milestone.dueDate === undefined) delete milestone.dueDate;
  return milestone;
}

function cleanTags(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const label of labels) {
    const tag = label.trim().slice(0, MAX_TAG);
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

export interface IssueOptions {
  labelsAsTags: boolean;
  /** Remote milestone ids that exist as milestones of the project (empty when milestones are not imported). */
  milestones: ReadonlySet<number>;
}

export function buildTodo(r: RepoRef, issue: RemoteIssue, opts: IssueOptions, now: number): Todo {
  const done = issue.state === 'closed';
  const todo: Todo = {
    id: todoIdOf(r, issue.number),
    title: issue.title.trim().slice(0, MAX_TITLE) || `#${issue.number}`,
    ...(issue.body.trim() ? { description: issue.body.slice(0, MAX_DESCRIPTION) } : {}),
    ...priorityFromLabels(issue.labels),
    tags: opts.labelsAsTags ? cleanTags(issue.labels) : [],
    done,
    order: 0,
    createdAt: toEpoch(issue.createdAt) ?? now,
    ...(done ? { completedAt: toEpoch(issue.closedAt) ?? toEpoch(issue.updatedAt) ?? now } : {}),
    projectId: projectIdOf(r),
    ...(issue.milestoneId !== undefined && opts.milestones.has(issue.milestoneId)
      ? { milestoneId: milestoneIdOf(r, issue.milestoneId) }
      : {}),
    source: sourceOf(r, issue),
  };
  const status = statusFromLabels(issue.labels);
  if (status) todo.status = status;
  const due = ruleOf(r.kind).dueDates ? toLocalDay(issue.dueDate) : undefined;
  if (due) todo.dueDate = due;
  return sanitizeDates(todo);
}

const sourceOf = (r: RepoRef, issue: RemoteIssue): ExternalRef => ({
  ...refOf(r),
  number: issue.number,
  url: issue.url,
  remoteUpdatedAt: issue.updatedAt,
  remoteState: issue.state,
});

// ---- Merge ----------------------------------------------------------------------------------------------------

/**
 * What a refresh does with one issue. Returns the row to write, or null when there is nothing to do:
 * - not here yet: created (a closed issue only with `includeClosed`);
 * - the remote `updated_at` is the one imported last time: untouched, so local edits win;
 * - the remote changed: the remote-owned fields (title, description, tags, milestone, due date, and `done` only when
 *   the remote *state* changed) are overwritten; importance, urgency, status, order, startDate, pomodoros and
 *   projectId always stay as they are.
 */
export function mergeIssue(
  local: Todo | undefined,
  r: RepoRef,
  issue: RemoteIssue,
  opts: IssueOptions & { includeClosed: boolean },
  now: number,
): Todo | null {
  if (!local) return issue.state === 'closed' && !opts.includeClosed ? null : buildTodo(r, issue, opts, now);
  if (local.source?.remoteUpdatedAt === issue.updatedAt) return null;
  const remote = buildTodo(r, issue, opts, now);
  const next: Todo = { ...local, title: remote.title, source: remote.source };
  setOrDrop(next, 'description', remote.description);
  if (opts.labelsAsTags) next.tags = remote.tags;
  if (opts.milestones.size) setOrDrop(next, 'milestoneId', remote.milestoneId);
  if (ruleOf(r.kind).dueDates) setOrDrop(next, 'dueDate', remote.dueDate);
  if (local.source?.remoteState !== issue.state) {
    next.done = remote.done;
    setOrDrop(next, 'completedAt', remote.completedAt);
  }
  return next;
}

function setOrDrop<K extends 'description' | 'milestoneId' | 'dueDate' | 'completedAt'>(
  todo: Todo,
  key: K,
  value: Todo[K],
): void {
  if (value === undefined) delete todo[key];
  else todo[key] = value;
}

/**
 * Milestones keep their order and creation time; name and dates follow the remote only when its `updated_at`
 * moved (so a local edit survives until the remote changes), and a platform without start dates never clears one.
 */
export function mergeMilestone(local: Milestone | undefined, remote: Milestone): Milestone | null {
  if (!local) return remote;
  if (local.source?.remoteUpdatedAt && local.source.remoteUpdatedAt === remote.source?.remoteUpdatedAt) return null;
  const next: Milestone = { ...local, name: remote.name, source: remote.source };
  if (remote.dueDate) next.dueDate = remote.dueDate;
  else delete next.dueDate;
  // Only GitLab has milestone start dates; elsewhere a start date set locally is the user's.
  if (remote.source?.kind === 'gitlab') {
    if (remote.startDate) next.startDate = remote.startDate;
    else delete next.startDate;
  }
  return next;
}

// ---- A whole import / refresh ---------------------------------------------------------------------------------

export interface ImportSummary {
  projectCreated: boolean;
  milestonesCreated: number;
  milestonesUpdated: number;
  tasksCreated: number;
  tasksUpdated: number;
}

export interface ImportPlan {
  project: Project;
  milestones: Milestone[];
  todos: Todo[];
  summary: ImportSummary;
}

/**
 * Everything one import or refresh writes, computed from the local rows and the remote ones. `project` is always
 * returned (it carries the new `lastSyncedAt`); `milestones` and `todos` only hold rows that are new or changed.
 */
export function planImport(input: {
  repoRef: RepoRef;
  repo: RemoteRepo;
  options: RepoSourceOptions;
  /** Epoch ms the refresh started: becomes `lastSyncedAt`. */
  startedAt: number;
  localProject: Project | undefined;
  localMilestones: readonly Milestone[];
  localTodos: readonly Todo[];
  remoteMilestones: readonly RemoteMilestone[];
  remoteIssues: readonly RemoteIssue[];
}): ImportPlan {
  const { repoRef: r, options, startedAt } = input;
  const base = input.localProject ?? buildProject(r, input.repo, options, startedAt);
  const project: Project = {
    ...base,
    source: { ...(base.source as ProjectSource), repoPath: r.repoPath, url: r.url, options: { ...options, lastSyncedAt: startedAt } },
  };

  const localMilestones = new Map(input.localMilestones.map((m) => [m.id, m]));
  const milestones: Milestone[] = [];
  let milestonesCreated = 0;
  let milestonesUpdated = 0;
  if (options.importMilestones) {
    for (const remote of input.remoteMilestones) {
      const built = buildMilestone(r, remote, startedAt);
      const local = localMilestones.get(built.id);
      const merged = mergeMilestone(local, built);
      if (!merged) continue;
      milestones.push(merged);
      if (local) milestonesUpdated++;
      else milestonesCreated++;
    }
  }

  const issueOpts: IssueOptions & { includeClosed: boolean } = {
    labelsAsTags: options.labelsAsTags,
    includeClosed: options.includeClosed,
    milestones: options.importMilestones ? new Set(input.remoteMilestones.map((m) => m.id)) : new Set(),
  };
  const localTodos = new Map(input.localTodos.map((t) => [t.id, t]));
  const todos: Todo[] = [];
  let tasksCreated = 0;
  let tasksUpdated = 0;
  for (const issue of input.remoteIssues) {
    const local = localTodos.get(todoIdOf(r, issue.number));
    const merged = mergeIssue(local, r, issue, issueOpts, startedAt);
    if (!merged) continue;
    todos.push(merged);
    if (local) tasksUpdated++;
    else tasksCreated++;
  }
  return {
    project,
    milestones,
    todos,
    summary: { projectCreated: !input.localProject, milestonesCreated, milestonesUpdated, tasksCreated, tasksUpdated },
  };
}

// ---- Writing the plan into the stores' lists ------------------------------------------------------------------

/** Replaces rows by id and appends the rest, each new one at `next(list, item)` order; the list is returned as it is when nothing is given. */
function upsert<T extends { id: string; order: number }>(
  list: readonly T[],
  items: readonly T[],
  nextOrder: (all: readonly T[], item: T) => number,
): T[] {
  if (!items.length) return list as T[];
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const next = list.map((row) => {
    const replacement = byId.get(row.id);
    if (!replacement) return row;
    seen.add(row.id);
    return replacement;
  });
  for (const item of items) if (!seen.has(item.id)) next.push({ ...item, order: nextOrder(next, item) });
  return next;
}

const maxOrder = (rows: readonly { order: number }[]): number => rows.reduce((max, row) => Math.max(max, row.order), -1);

/** Insert-or-replace; a new todo goes to the end of the order. A replaced one keeps the `order` the merge preserved. */
export const upsertTodos = (list: readonly Todo[], items: readonly Todo[]): Todo[] => {
  let order = maxOrder(list) + 1;
  return upsert(list, items, () => order++);
};

/** Insert-or-replace; a new milestone goes to the end of its project's order. */
export const upsertMilestones = (list: readonly Milestone[], items: readonly Milestone[]): Milestone[] =>
  upsert(list, items, (all, m) => maxOrder(all.filter((x) => x.projectId === m.projectId && x.id !== m.id)) + 1);

/** Insert-or-replace; a new project goes to the end of the order. */
export const upsertProject = (list: readonly Project[], project: Project): Project[] =>
  upsert(list, [project], (all) => maxOrder(all) + 1);
