import type { Milestone, Project } from '../types/project';
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
}

export interface MilestoneWire extends WireRow {
  projectId: string;
  name: string;
  order: number;
  createdAt: number;
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
}

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
  }),
  fromWire: (w: ProjectWire): Project => ({
    id: w.id,
    icon: w.icon,
    name: w.name,
    description: w.description,
    notes: w.notes,
    order: w.order,
    createdAt: w.createdAt,
  }),
  tombstone: (id: string): Content<ProjectWire> => ({ id, icon: '', name: '', description: '', notes: '', order: 0, createdAt: 0 }),
};

export const milestoneCodec = {
  toWire: (m: Milestone): Content<MilestoneWire> => ({
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    order: m.order,
    createdAt: m.createdAt,
  }),
  fromWire: (w: MilestoneWire): Milestone => ({
    id: w.id,
    projectId: w.projectId,
    name: w.name,
    order: w.order,
    createdAt: w.createdAt,
  }),
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

/** Content hash of a row, independent of key order and of null-vs-absent optional fields. */
export function hashWith<T>(toWire: (item: T) => object): (item: T) => string {
  return (item) => hashString(JSON.stringify(toWire(item)));
}
