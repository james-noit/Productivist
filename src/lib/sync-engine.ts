import type { ProjectSource } from '../types/forge';
import type { FlowLayout, FlowLink, FlowLinkKind, FlowPosition, Horizon, Objective, ObjectiveStatus } from '../types/flow';
import type { Milestone, Project } from '../types/project';
import type { Recurrence, RecurrenceMode, RecurrenceUnit } from '../types/recurrence';
import type { BlockKind, BlockStatus, BlockStep, Feedback, SportBlock, SportTemplate, StepResult, TemplateSlot } from '../types/sportask';
import type { Priority, TaskStatus, Todo } from '../types/todo';

/**
 * Pure sync logic. The app's stores know nothing about syncing (no `updatedAt`, no tombstones), so a
 * `RowMeta` per row records what was last seen: a hash of the content, when it last changed, and whether
 * the server has that version. Local edits and deletions are discovered by diffing against it.
 */

export interface RowMeta {
  /** Content hash at the time of the last local change or pull. */
  h: string;
  /** Edit time (epoch ms): the last-write-wins key sent to the server. */
  u: number;
  /** True when the server already holds this version. */
  p: boolean;
  /** Tombstone: the row no longer exists locally. */
  d?: boolean;
}
export type RowMetaMap = Record<string, RowMeta>;

export interface WireRow {
  id: string;
  updatedAt: number;
  deleted: boolean;
}

/** 53-bit string hash (cyrb53): collisions are negligible at this scale and the hashes stay small in storage. */
export function hashString(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Diffs the live items against the last known metadata: new/edited rows become unpushed, vanished rows tombstones. */
export function reconcileLocal<T extends { id: string }>(
  items: readonly T[],
  meta: RowMetaMap,
  hash: (item: T) => string,
  now: number,
): RowMetaMap {
  const next: RowMetaMap = {};
  const live = new Set<string>();
  for (const item of items) {
    live.add(item.id);
    const h = hash(item);
    const prev = meta[item.id];
    next[item.id] = prev && !prev.d && prev.h === h ? prev : { h, u: now, p: false };
  }
  for (const [id, prev] of Object.entries(meta)) {
    if (live.has(id)) continue;
    next[id] = prev.d ? prev : { h: prev.h, u: now, p: false, d: true };
  }
  return next;
}

/** Rows the server does not have yet: live ones serialised by `toWire`, deleted ones as bare tombstones. */
export function pendingRows<T extends { id: string }, W extends WireRow>(
  items: readonly T[],
  meta: RowMetaMap,
  toWire: (item: T) => Omit<W, 'updatedAt' | 'deleted'>,
  tombstone: (id: string) => Omit<W, 'updatedAt' | 'deleted'>,
): { rows: W[]; sent: Record<string, number> } {
  const byId = new Map(items.map((item) => [item.id, item]));
  const rows: W[] = [];
  const sent: Record<string, number> = {};
  for (const [id, m] of Object.entries(meta)) {
    if (m.p) continue;
    const item = byId.get(id);
    if (m.d) rows.push({ ...tombstone(id), updatedAt: m.u, deleted: true } as W);
    else if (item) rows.push({ ...toWire(item), updatedAt: m.u, deleted: false } as W);
    else continue;
    sent[id] = m.u;
  }
  return { rows, sent };
}

/** After a successful push: mark what was sent as stored, unless it changed again meanwhile; drop settled tombstones. */
export function markPushed(meta: RowMetaMap, sent: Record<string, number>): RowMetaMap {
  const next: RowMetaMap = {};
  for (const [id, m] of Object.entries(meta)) {
    if (sent[id] === m.u && !m.p) {
      if (m.d) continue;
      next[id] = { ...m, p: true };
    } else {
      next[id] = m;
    }
  }
  return next;
}

/**
 * Merges rows pulled from the server. A local edit the server has not seen yet and that is newer than the
 * incoming row wins (it is pushed right after); in every other case the server row is applied.
 */
export function applyPulled<T extends { id: string }, W extends WireRow>(
  items: readonly T[],
  meta: RowMetaMap,
  pulled: readonly W[],
  fromWire: (row: W) => T,
  hash: (item: T) => string,
): { items: T[]; meta: RowMetaMap } {
  if (pulled.length === 0) return { items: items as T[], meta };
  const byId = new Map(items.map((item) => [item.id, item]));
  const nextMeta: RowMetaMap = { ...meta };
  for (const row of pulled) {
    const local = nextMeta[row.id];
    if (local && !local.p && local.u > row.updatedAt) continue;
    // Our own push coming back: already applied.
    if (local?.p && local.u === row.updatedAt && !row.deleted) continue;
    if (row.deleted) {
      byId.delete(row.id);
      delete nextMeta[row.id];
    } else {
      const item = fromWire(row);
      byId.set(row.id, item);
      nextMeta[row.id] = { h: hash(item), u: row.updatedAt, p: true };
    }
  }
  // Keep existing positions; new items go to the end.
  const ordered: T[] = [];
  for (const item of items) {
    const kept = byId.get(item.id);
    if (kept) {
      ordered.push(kept);
      byId.delete(item.id);
    }
  }
  ordered.push(...byId.values());
  return { items: ordered, meta: nextMeta };
}

// ---- Wire shapes (mirror backend SyncDtos) -------------------------------------------------------------------

export interface ProjectWire extends WireRow {
  icon: string;
  name: string;
  description: string;
  notes: string;
  order: number;
  createdAt: number;
  /** Optional on the wire: set only on rows imported from a Git forge (the backend sends null otherwise). */
  source?: SourceWire | null;
}

/** The synced `source`; components the client did not set come back as null from the backend. */
export type SourceWire = { [K in keyof ProjectSource]?: ProjectSource[K] | null };

export interface MilestoneWire extends WireRow {
  projectId: string;
  name: string;
  order: number;
  createdAt: number;
  /** Optional on the wire: absent or null means no date. */
  startDate?: string | null;
  dueDate?: string | null;
  source?: SourceWire | null;
}

export interface TodoWire extends WireRow {
  title: string;
  description: string | null;
  importance: Priority;
  urgency: Priority;
  tags: string[];
  done: boolean;
  order: number;
  createdAt: number;
  completedAt: number | null;
  projectId: string | null;
  milestoneId: string | null;
  pomodorosForTermination: number | null;
  /** Optional on the wire: absent or null means 'todo'. */
  status?: TaskStatus | null;
  startDate?: string | null;
  dueDate?: string | null;
  /** Optional on the wire: the recurring series this task is an occurrence of. */
  recurrenceId?: string | null;
  source?: SourceWire | null;
}

export interface ObjectiveWire extends WireRow {
  projectId: string;
  title: string;
  horizon: Horizon;
  status: ObjectiveStatus;
  order: number;
  createdAt: number;
  /** Optional on the wire: absent or null means none. */
  description?: string | null;
  targetDate?: string | null;
}

export interface FlowLinkWire extends WireRow {
  projectId: string;
  fromKind: FlowLinkKind;
  fromId: string;
  toObjectiveId: string;
  createdAt: number;
}

/** One row per project: the id is the project id. */
export interface FlowLayoutWire extends WireRow {
  positions: Record<string, FlowPosition>;
  collapsed: string[];
}

export interface RecurrenceWire extends WireRow {
  title: string;
  importance: Priority;
  urgency: Priority;
  tags: string[];
  every: number;
  unit: RecurrenceUnit;
  mode: RecurrenceMode;
  startDate: string;
  order: number;
  createdAt: number;
  /** Optional on the wire: absent or null means none (the backend also sends `paused: false`). */
  description?: string | null;
  projectId?: string | null;
  milestoneId?: string | null;
  pomodorosForTermination?: number | null;
  weekdays?: number[] | null;
  endDate?: string | null;
  paused?: boolean | null;
  lastDate?: string | null;
}

export interface SportBlockWire extends WireRow {
  startedAt: number;
  date: string;
  origin: 'goal' | 'free';
  kind: BlockKind;
  blockSeconds: number;
  prepSeconds: number;
  steps: unknown[];
  results: unknown[];
  status: BlockStatus;
  catalogVersion: number;
  createdAt: number;
  /** Optional on the wire: absent or null means none (the backend sends null for unset ones). */
  goalId?: string | null;
  programId?: string | null;
  programWeek?: number | null;
  templateId?: string | null;
  assessmentId?: string | null;
  rpe?: number | null;
  feedback?: Feedback | null;
}

export interface SportTemplateWire extends WireRow {
  name: string;
  slots: unknown[];
  format: SportTemplate['format'];
  order: number;
  createdAt: number;
  /** Optional on the wire: absent or null means none. */
  workSeconds?: number | null;
  restSeconds?: number | null;
  minSeconds?: number | null;
}

const KEYS = ['kind', 'host', 'repoId', 'repoPath', 'number', 'url', 'remoteUpdatedAt', 'remoteState'] as const;
const OPTION_KEYS = ['includeClosed', 'onlyAssignedToMe', 'importMilestones', 'labelsAsTags', 'lastSyncedAt'] as const;

type Loose = Record<string, unknown>;

/**
 * The `source` of an imported row as it travels (sync, in `forge-sanitize.ts` for import files): the source with its keys in a fixed order and no `null`s (the backend returns them for unset components), so the content
 * hash of a row is the same before and after a round trip through Postgres JSONB. Assumes `s` came from this app or
 * passed `sanitizeSource`.
 */
export function canonicalSource(s: object): ProjectSource {
  const x = s as Loose;
  const out: Loose = {};
  for (const key of KEYS) if (x[key] != null) out[key] = x[key];
  const options = x['options'] as Loose | null | undefined;
  if (options) {
    const o: Loose = {};
    for (const key of OPTION_KEYS) if (options[key] != null) o[key] = options[key];
    out['options'] = o;
  }
  return out as unknown as ProjectSource;
}

/**
 * Sportask's JSON arrays (`steps`, `results`, `slots`) are stored as Postgres JSONB, which reorders object keys and the
 * backend returns `null` for nothing, so each element is rebuilt here with its keys in a fixed order and optionals only
 * when set: a row's content hash is then the same before and after a round trip. These duplicate the shape knowledge of
 * `lib/sportask/sanitize.ts` on purpose (importing it would pull lazy code into the initial bundle); they assume the
 * elements came from this app or passed the sanitiser, and carry through only the keys they know.
 */
const DOSE_KEYS = ['reps', 'seconds'];
const STEP_KEYS = ['exerciseId', 'workSeconds', 'restSeconds', 'target', 'side', 'loadKg', 'round'];
const RESULT_KEYS = ['stepIndex', 'done', 'value', 'loadKg'];
const SLOT_KEYS = ['exerciseId', 'dose', 'pattern', 'tag', 'zone', 'maxLevel'];
const BLOCK_OPTIONAL = ['goalId', 'programId', 'programWeek', 'templateId', 'assessmentId', 'rpe', 'feedback'];
const TEMPLATE_OPTIONAL = ['workSeconds', 'restSeconds', 'minSeconds'];

/** The listed keys of `o`, in that order, skipping unset ones (`null` too); a dose (`target`, `dose`) is picked the same way. */
function pick(o: object, keys: readonly string[]): Loose {
  const x = o as Loose;
  const out: Loose = {};
  for (const key of keys) if (x[key] != null) out[key] = key === 'target' || key === 'dose' ? pick(x[key] as object, DOSE_KEYS) : x[key];
  return out;
}

export const canonicalSteps = (steps: readonly BlockStep[]): BlockStep[] => steps.map((s) => pick(s, STEP_KEYS) as unknown as BlockStep);
export const canonicalResults = (results: readonly StepResult[]): StepResult[] => results.map((r) => pick(r, RESULT_KEYS) as unknown as StepResult);
export const canonicalSlots = (slots: readonly TemplateSlot[]): TemplateSlot[] => slots.map((s) => pick(s, SLOT_KEYS) as unknown as TemplateSlot);

type Content<W extends WireRow> = Omit<W, 'updatedAt' | 'deleted'>;

export const projectCodec = {
  toWire: (p: Project): Content<ProjectWire> => ({
    id: p.id,
    icon: p.icon,
    name: p.name,
    description: p.description,
    notes: p.notes,
    order: p.order,
    createdAt: p.createdAt,
    // Only when set (imported from a Git forge): an always-present key would change every project's hash.
    ...(p.source ? { source: canonicalSource(p.source) } : {}),
  }),
  fromWire: (w: ProjectWire): Project => {
    const project: Project = {
      id: w.id,
      icon: w.icon,
      name: w.name,
      description: w.description,
      notes: w.notes,
      order: w.order,
      createdAt: w.createdAt,
    };
    if (w.source) project.source = canonicalSource(w.source);
    return project;
  },
  tombstone: (id: string): Content<ProjectWire> => ({ id, icon: '', name: '', description: '', notes: '', order: 0, createdAt: 0 }),
};

export const milestoneCodec = {
  toWire: (m: Milestone): Content<MilestoneWire> => ({
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    order: m.order,
    createdAt: m.createdAt,
    // Only when set, like Todo.status: an always-present key would change every existing row's hash.
    ...(m.startDate ? { startDate: m.startDate } : {}),
    ...(m.dueDate ? { dueDate: m.dueDate } : {}),
    ...(m.source ? { source: canonicalSource(m.source) } : {}),
  }),
  fromWire: (w: MilestoneWire): Milestone => {
    const milestone: Milestone = {
      id: w.id,
      projectId: w.projectId,
      name: w.name,
      order: w.order,
      createdAt: w.createdAt,
    };
    if (w.startDate) milestone.startDate = w.startDate;
    if (w.dueDate) milestone.dueDate = w.dueDate;
    if (w.source) milestone.source = canonicalSource(w.source);
    return milestone;
  },
  tombstone: (id: string): Content<MilestoneWire> => ({ id, projectId: '', name: '', order: 0, createdAt: 0 }),
};

export const todoCodec = {
  toWire: (t: Todo): Content<TodoWire> => ({
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    importance: t.importance,
    urgency: t.urgency,
    tags: t.tags,
    done: t.done,
    order: t.order,
    createdAt: t.createdAt,
    completedAt: t.completedAt ?? null,
    projectId: t.projectId ?? null,
    milestoneId: t.milestoneId ?? null,
    pomodorosForTermination: t.pomodorosForTermination ?? null,
    // Only when set: an always-present key would change every existing todo's content hash.
    ...(t.status ? { status: t.status } : {}),
    ...(t.startDate ? { startDate: t.startDate } : {}),
    ...(t.dueDate ? { dueDate: t.dueDate } : {}),
    ...(t.recurrenceId ? { recurrenceId: t.recurrenceId } : {}),
    ...(t.source ? { source: canonicalSource(t.source) } : {}),
  }),
  fromWire: (w: TodoWire): Todo => {
    const todo: Todo = {
      id: w.id,
      title: w.title,
      importance: w.importance,
      urgency: w.urgency,
      tags: w.tags,
      done: w.done,
      order: w.order,
      createdAt: w.createdAt,
    };
    if (w.description !== null) todo.description = w.description;
    if (w.completedAt !== null) todo.completedAt = w.completedAt;
    if (w.projectId !== null) todo.projectId = w.projectId;
    if (w.milestoneId !== null) todo.milestoneId = w.milestoneId;
    if (w.pomodorosForTermination !== null) todo.pomodorosForTermination = w.pomodorosForTermination;
    if (w.status) todo.status = w.status;
    if (w.startDate) todo.startDate = w.startDate;
    if (w.dueDate) todo.dueDate = w.dueDate;
    if (w.recurrenceId) todo.recurrenceId = w.recurrenceId;
    if (w.source) todo.source = canonicalSource(w.source);
    return todo;
  },
  tombstone: (id: string): Content<TodoWire> => ({
    id,
    title: '',
    description: null,
    importance: 'medium',
    urgency: 'medium',
    tags: [],
    done: false,
    order: 0,
    createdAt: 0,
    completedAt: null,
    projectId: null,
    milestoneId: null,
    pomodorosForTermination: null,
  }),
};

export const objectiveCodec = {
  toWire: (o: Objective): Content<ObjectiveWire> => ({
    id: o.id,
    projectId: o.projectId,
    title: o.title,
    horizon: o.horizon,
    status: o.status,
    order: o.order,
    createdAt: o.createdAt,
    // Only when set, like Todo.status.
    ...(o.description ? { description: o.description } : {}),
    ...(o.targetDate ? { targetDate: o.targetDate } : {}),
  }),
  fromWire: (w: ObjectiveWire): Objective => {
    const objective: Objective = {
      id: w.id,
      projectId: w.projectId,
      title: w.title,
      horizon: w.horizon,
      status: w.status,
      order: w.order,
      createdAt: w.createdAt,
    };
    if (w.description) objective.description = w.description;
    if (w.targetDate) objective.targetDate = w.targetDate;
    return objective;
  },
  tombstone: (id: string): Content<ObjectiveWire> => ({
    id,
    projectId: '',
    title: '',
    horizon: 'short',
    status: 'active',
    order: 0,
    createdAt: 0,
  }),
};

export const flowLinkCodec = {
  toWire: (l: FlowLink): Content<FlowLinkWire> => ({
    id: l.id,
    projectId: l.projectId,
    fromKind: l.fromKind,
    fromId: l.fromId,
    toObjectiveId: l.toObjectiveId,
    createdAt: l.createdAt,
  }),
  fromWire: (w: FlowLinkWire): FlowLink => ({
    id: w.id,
    projectId: w.projectId,
    fromKind: w.fromKind,
    fromId: w.fromId,
    toObjectiveId: w.toObjectiveId,
    createdAt: w.createdAt,
  }),
  tombstone: (id: string): Content<FlowLinkWire> => ({
    id,
    projectId: '',
    fromKind: 'task',
    fromId: '',
    toObjectiveId: '',
    createdAt: 0,
  }),
};

export const flowLayoutCodec = {
  // Keys are sorted so the content hash does not depend on insertion order (Postgres JSONB reorders keys).
  toWire: (l: FlowLayout): Content<FlowLayoutWire> => ({
    id: l.id,
    positions: Object.fromEntries(Object.entries(l.positions).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    collapsed: [...l.collapsed].sort(),
  }),
  fromWire: (w: FlowLayoutWire): FlowLayout => ({
    id: w.id,
    positions: w.positions ?? {},
    collapsed: w.collapsed ?? [],
  }),
  tombstone: (id: string): Content<FlowLayoutWire> => ({ id, positions: {}, collapsed: [] }),
};

export const recurrenceCodec = {
  toWire: (r: Recurrence): Content<RecurrenceWire> => ({
    id: r.id,
    title: r.title,
    importance: r.importance,
    urgency: r.urgency,
    tags: r.tags,
    every: r.every,
    unit: r.unit,
    mode: r.mode,
    startDate: r.startDate,
    order: r.order,
    createdAt: r.createdAt,
    // Only when set, like Todo.status: an always-present key would change the hash of every row.
    ...(r.description ? { description: r.description } : {}),
    ...(r.projectId ? { projectId: r.projectId } : {}),
    ...(r.milestoneId ? { milestoneId: r.milestoneId } : {}),
    ...(r.pomodorosForTermination ? { pomodorosForTermination: r.pomodorosForTermination } : {}),
    ...(r.weekdays?.length ? { weekdays: r.weekdays } : {}),
    ...(r.endDate ? { endDate: r.endDate } : {}),
    ...(r.paused ? { paused: true } : {}),
    ...(r.lastDate ? { lastDate: r.lastDate } : {}),
  }),
  fromWire: (w: RecurrenceWire): Recurrence => {
    const rec: Recurrence = {
      id: w.id,
      title: w.title,
      importance: w.importance,
      urgency: w.urgency,
      tags: w.tags ?? [],
      every: w.every,
      unit: w.unit,
      mode: w.mode,
      startDate: w.startDate,
      order: w.order,
      createdAt: w.createdAt,
    };
    if (w.description) rec.description = w.description;
    if (w.projectId) rec.projectId = w.projectId;
    if (w.milestoneId) rec.milestoneId = w.milestoneId;
    if (w.pomodorosForTermination) rec.pomodorosForTermination = w.pomodorosForTermination;
    if (w.weekdays?.length) rec.weekdays = w.weekdays;
    if (w.endDate) rec.endDate = w.endDate;
    if (w.paused) rec.paused = true;
    if (w.lastDate) rec.lastDate = w.lastDate;
    return rec;
  },
  tombstone: (id: string): Content<RecurrenceWire> => ({
    id,
    title: '',
    importance: 'medium',
    urgency: 'medium',
    tags: [],
    every: 1,
    unit: 'day',
    mode: 'schedule',
    startDate: '1970-01-01',
    order: 0,
    createdAt: 0,
  }),
};

export const sportBlockCodec = {
  toWire: (b: SportBlock): Content<SportBlockWire> => ({
    id: b.id,
    startedAt: b.startedAt,
    date: b.date,
    origin: b.origin,
    kind: b.kind,
    blockSeconds: b.blockSeconds,
    prepSeconds: b.prepSeconds,
    steps: canonicalSteps(b.steps),
    results: canonicalResults(b.results),
    status: b.status,
    catalogVersion: b.catalogVersion,
    createdAt: b.createdAt,
    // Only when set, like Todo.status: an always-present key would change the hash of every row.
    ...pick(b, BLOCK_OPTIONAL),
  }),
  fromWire: (w: SportBlockWire): SportBlock =>
    ({
      id: w.id,
      startedAt: w.startedAt,
      date: w.date,
      origin: w.origin,
      kind: w.kind,
      blockSeconds: w.blockSeconds,
      prepSeconds: w.prepSeconds,
      steps: canonicalSteps((w.steps ?? []) as BlockStep[]),
      results: canonicalResults((w.results ?? []) as StepResult[]),
      status: w.status,
      catalogVersion: w.catalogVersion,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      ...pick(w, BLOCK_OPTIONAL),
    }) as SportBlock,
  // Valid placeholders: the backend's checks apply to tombstones too.
  tombstone: (id: string): Content<SportBlockWire> => ({
    id,
    startedAt: 0,
    date: '1970-01-01',
    origin: 'free',
    kind: 'train',
    blockSeconds: 1,
    prepSeconds: 0,
    steps: [],
    results: [],
    status: 'skipped',
    catalogVersion: 0,
    createdAt: 0,
  }),
};

export const sportTemplateCodec = {
  toWire: (t: SportTemplate): Content<SportTemplateWire> => ({
    id: t.id,
    name: t.name,
    slots: canonicalSlots(t.slots),
    format: t.format,
    order: t.order,
    createdAt: t.createdAt,
    ...pick(t, TEMPLATE_OPTIONAL),
  }),
  fromWire: (w: SportTemplateWire): SportTemplate =>
    ({
      id: w.id,
      name: w.name,
      slots: canonicalSlots((w.slots ?? []) as TemplateSlot[]),
      format: w.format,
      order: w.order,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      ...pick(w, TEMPLATE_OPTIONAL),
    }) as SportTemplate,
  tombstone: (id: string): Content<SportTemplateWire> => ({
    id,
    name: '-',
    slots: [{ pattern: 'core' }],
    format: 'sequence',
    order: 0,
    createdAt: 0,
  }),
};

/** Content hash of a row, independent of key order and of null-vs-absent optional fields. */
export function hashWith<T>(toWire: (item: T) => object): (item: T) => string {
  return (item) => hashString(JSON.stringify(toWire(item)));
}
