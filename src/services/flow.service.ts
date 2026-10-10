import { Injectable, computed } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { createId } from '../core/create-id';
import { isIsoDate } from '../lib/dates';
import { HORIZONS, isLinkCoherent, linkKey, validateLink, type FlowSource, type LinkRefusal } from '../lib/flow-rules';
import type {
  FlowExport,
  FlowLayout,
  FlowLink,
  FlowLinkKind,
  FlowPosition,
  Horizon,
  Objective,
  ObjectiveStatus,
} from '../types/flow';

export type ObjectivePatch = Partial<Pick<Objective, 'title' | 'description' | 'horizon' | 'status' | 'targetDate'>>;

/** What still exists elsewhere; `ProjectsService.sweepFlow()` builds it from the live stores. */
export interface FlowRefs {
  projectIds: ReadonlySet<string>;
  /** Milestone id → the project it belongs to. */
  milestoneProjects: ReadonlyMap<string, string>;
  /** Task id → its project (undefined when it has none). */
  taskProjects: ReadonlyMap<string, string | undefined>;
}

const STATUSES: readonly ObjectiveStatus[] = ['active', 'achieved', 'dropped'];
const LINK_KINDS: readonly FlowLinkKind[] = ['task', 'milestone', 'objective'];
/** Mirrors the backend caps, so an oversized import cannot wedge sync. */
const MAX_POSITIONS = 2000;
const MAX_TEXT = 1000;

/**
 * The persisted data behind the Flow view: objectives, the links that feed them and the hand-placed
 * node positions. It has no dependencies (TodosService and ProjectsService call into it for cascades),
 * holds no layout maths, and never touches tasks or milestones. The diagram state (viewport, drag,
 * geometry) belongs to the lazy Flow components, not here: this service is in the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class FlowService {
  readonly objectives = localStorageSignal<Objective[]>('productivist.objectives', []);
  readonly links = localStorageSignal<FlowLink[]>('productivist.flowLinks', []);
  readonly layouts = localStorageSignal<FlowLayout[]>('productivist.flowLayouts', []);

  /** Each project's objectives sorted by `order`. */
  readonly objectivesByProject = computed(() => {
    const map = new Map<string, Objective[]>();
    for (const o of [...this.objectives()].sort((a, b) => a.order - b.order)) {
      const list = map.get(o.projectId);
      if (list) list.push(o);
      else map.set(o.projectId, [o]);
    }
    return map;
  });

  readonly linksByProject = computed(() => {
    const map = new Map<string, FlowLink[]>();
    for (const l of this.links()) {
      const list = map.get(l.projectId);
      if (list) list.push(l);
      else map.set(l.projectId, [l]);
    }
    return map;
  });

  readonly layoutsByProject = computed(() => new Map(this.layouts().map((l) => [l.id, l])));

  // ---- objectives ---------------------------------------------------------------------------------------------

  /** Returns null (and adds nothing) for a blank title. */
  addObjective(input: {
    projectId: string;
    title: string;
    horizon: Horizon;
    description?: string;
    status?: ObjectiveStatus;
    targetDate?: string;
  }): Objective | null {
    const title = input.title.trim();
    if (!title) return null;
    const maxOrder = this.objectives()
      .filter((o) => o.projectId === input.projectId)
      .reduce((max, o) => Math.max(max, o.order), -1);
    const objective: Objective = {
      id: createId(),
      projectId: input.projectId,
      title,
      horizon: input.horizon,
      status: input.status ?? 'active',
      order: maxOrder + 1,
      createdAt: Date.now(),
      ...(input.description ? { description: input.description } : {}),
      ...(input.targetDate && isIsoDate(input.targetDate) ? { targetDate: input.targetDate } : {}),
    };
    this.objectives.update((list) => [...list, objective]);
    return objective;
  }

  /**
   * Edits an objective. A blank title and a malformed target date are ignored (the server would reject
   * them and wedge sync). Changing the horizon drops the objective-to-objective links that no longer
   * point to a longer horizon.
   */
  updateObjective(id: string, patch: ObjectivePatch): void {
    const current = this.objectives().find((o) => o.id === id);
    if (!current) return;
    const next: ObjectivePatch = { ...patch };
    if (next.title !== undefined) {
      next.title = next.title.trim();
      if (!next.title) delete next.title;
    }
    if (next.targetDate !== undefined && !isIsoDate(next.targetDate)) next.targetDate = undefined;
    const updated: Objective = { ...current, ...next };
    this.objectives.update((list) => list.map((o) => (o.id === id ? updated : o)));

    if (updated.horizon !== current.horizon) {
      const byId = new Map(this.objectives().map((o) => [o.id, o]));
      const stale = (l: FlowLink) =>
        l.fromKind === 'objective' && (l.fromId === id || l.toObjectiveId === id) && !isLinkCoherent(l, byId);
      if (this.links().some(stale)) this.links.update((list) => list.filter((l) => !stale(l)));
    }
  }

  /** Removes the objective, every link into or out of it and its card position. */
  removeObjective(id: string): void {
    this.objectives.update((list) => list.filter((o) => o.id !== id));
    const touches = (l: FlowLink) => l.toObjectiveId === id || (l.fromKind === 'objective' && l.fromId === id);
    if (this.links().some(touches)) this.links.update((list) => list.filter((l) => !touches(l)));
    this.dropNodeKeys([`objective:${id}`]);
  }

  // ---- links --------------------------------------------------------------------------------------------------

  /**
   * Links `from` to the objective `toObjectiveId` after checking the rules of `lib/flow-rules.ts`.
   * Returns null on success, otherwise why it was refused (nothing is changed). For a task or milestone the
   * caller passes its `projectId`; the link is stored under the target objective's project.
   */
  link(from: FlowSource, toObjectiveId: string): LinkRefusal | null {
    const objectives = this.objectives();
    const refused = validateLink(objectives, this.links(), from, toObjectiveId);
    if (refused) return refused;
    const target = objectives.find((o) => o.id === toObjectiveId)!;
    const link: FlowLink = {
      id: createId(),
      projectId: target.projectId,
      fromKind: from.kind,
      fromId: from.id,
      toObjectiveId,
      createdAt: Date.now(),
    };
    this.links.update((list) => [...list, link]);
    return null;
  }

  unlink(linkId: string): void {
    if (this.links().some((l) => l.id === linkId)) this.links.update((list) => list.filter((l) => l.id !== linkId));
  }

  /**
   * Cascade for a deleted task or milestone: drops the links that start at it (one id or several in one
   * write). A milestone also loses its card position and collapsed flag.
   */
  removeLinksFrom(kind: 'task' | 'milestone', ids: string | readonly string[]): void {
    const gone = new Set(typeof ids === 'string' ? [ids] : ids);
    if (!gone.size) return;
    const matches = (l: FlowLink) => l.fromKind === kind && gone.has(l.fromId);
    if (this.links().some(matches)) this.links.update((list) => list.filter((l) => !matches(l)));
    if (kind === 'milestone') this.dropNodeKeys([...gone].map((id) => `milestone:${id}`));
  }

  /** Cascade for a deleted project: its objectives, links and layout. */
  removeForProject(projectId: string): void {
    if (this.objectives().some((o) => o.projectId === projectId)) {
      this.objectives.update((list) => list.filter((o) => o.projectId !== projectId));
    }
    if (this.links().some((l) => l.projectId === projectId)) {
      this.links.update((list) => list.filter((l) => l.projectId !== projectId));
    }
    if (this.layouts().some((l) => l.id === projectId)) {
      this.layouts.update((list) => list.filter((l) => l.id !== projectId));
    }
  }

  // ---- layout -------------------------------------------------------------------------------------------------

  /** Stores one node's position (`key` is `${kind}:${id}`). Call once on pointer-up, not per pointermove. */
  setPosition(projectId: string, key: string, x: number, y: number): void {
    this.setPositions(projectId, { [key]: { x, y } });
  }

  /** Several positions in one write (e.g. after moving a selection). */
  setPositions(projectId: string, positions: Readonly<Record<string, FlowPosition>>): void {
    this.editLayout(projectId, (layout) => {
      const next = { ...layout.positions };
      for (const [key, p] of Object.entries(positions)) {
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) next[key] = { x: Math.round(p.x), y: Math.round(p.y) };
      }
      return { ...layout, positions: next };
    });
  }

  /** Forgets every hand-placed position of the project (the diagram's "Tidy up"); collapsed cards stay collapsed. */
  clearPositions(projectId: string): void {
    this.editLayout(projectId, (layout) => ({ ...layout, positions: {} }));
  }

  setCollapsed(projectId: string, key: string, collapsed: boolean): void {
    this.editLayout(projectId, (layout) => {
      const has = layout.collapsed.includes(key);
      if (collapsed === has) return layout;
      return { ...layout, collapsed: collapsed ? [...layout.collapsed, key] : layout.collapsed.filter((k) => k !== key) };
    });
  }

  /** Applies `edit` to the project's layout (a blank one if missing); a layout left empty is removed. */
  private editLayout(projectId: string, edit: (layout: FlowLayout) => FlowLayout): void {
    const existing = this.layouts().find((l) => l.id === projectId);
    const base: FlowLayout = existing ?? { id: projectId, positions: {}, collapsed: [] };
    const next = edit(base);
    if (next === base || (existing && JSON.stringify(next) === JSON.stringify(existing))) return;
    const empty = !Object.keys(next.positions).length && !next.collapsed.length;
    if (empty && !existing) return;
    this.layouts.update((list) => {
      const others = list.filter((l) => l.id !== projectId);
      return empty ? others : existing ? list.map((l) => (l.id === projectId ? next : l)) : [...others, next];
    });
  }

  /** Forgets the positions and collapsed flags stored under these node keys, in every layout. */
  private dropNodeKeys(keys: readonly string[]): void {
    const doomed = new Set(keys);
    const touched = (l: FlowLayout) =>
      l.collapsed.some((k) => doomed.has(k)) || Object.keys(l.positions).some((k) => doomed.has(k));
    if (!this.layouts().some(touched)) return;
    this.layouts.update((list) =>
      list
        .map((l) =>
          touched(l)
            ? {
                ...l,
                positions: Object.fromEntries(Object.entries(l.positions).filter(([k]) => !doomed.has(k))),
                collapsed: l.collapsed.filter((k) => !doomed.has(k)),
              }
            : l,
        )
        .filter((l) => l.collapsed.length || Object.keys(l.positions).length),
    );
  }

  // ---- housekeeping -------------------------------------------------------------------------------------------

  /**
   * Drops what points at something that no longer exists or moved to another project: objectives and
   * layouts of vanished projects, links with a missing or foreign endpoint or that broke the horizon rule,
   * and layout keys of vanished milestones/objectives. Runs on load and after a pull, so rows left behind by
   * an older client or another device's deletion do not accumulate. A no-op when nothing is stale.
   */
  sweep(refs: FlowRefs): void {
    const objectives = this.objectives().filter((o) => refs.projectIds.has(o.projectId));
    if (objectives.length !== this.objectives().length) this.objectives.set(objectives);

    const byId = new Map(objectives.map((o) => [o.id, o]));
    const endpointAlive = (l: FlowLink) =>
      l.fromKind === 'task'
        ? refs.taskProjects.get(l.fromId) === l.projectId
        : l.fromKind === 'milestone'
          ? refs.milestoneProjects.get(l.fromId) === l.projectId
          : true;
    const links = this.links().filter((l) => isLinkCoherent(l, byId) && endpointAlive(l));
    if (links.length !== this.links().length) this.links.set(links);

    const alive = (l: FlowLayout) => refs.projectIds.has(l.id);
    const nodeAlive = (projectId: string, key: string): boolean => {
      const sep = key.indexOf(':');
      const kind = key.slice(0, sep);
      const id = key.slice(sep + 1);
      if (kind === 'objective') return byId.get(id)?.projectId === projectId;
      if (kind === 'milestone') return refs.milestoneProjects.get(id) === projectId;
      return kind === 'nomilestone' && id === projectId;
    };
    const clean = (l: FlowLayout): FlowLayout => {
      const positions = Object.entries(l.positions).filter(([k]) => nodeAlive(l.id, k));
      const collapsed = l.collapsed.filter((k) => nodeAlive(l.id, k));
      return positions.length === Object.keys(l.positions).length && collapsed.length === l.collapsed.length
        ? l
        : { ...l, positions: Object.fromEntries(positions), collapsed };
    };
    const layouts = this.layouts()
      .filter(alive)
      .map(clean)
      .filter((l) => l.collapsed.length || Object.keys(l.positions).length);
    const current = this.layouts();
    if (layouts.length !== current.length || layouts.some((l, i) => l !== current[i])) this.layouts.set(layouts);
  }

  // ---- export / import / reset --------------------------------------------------------------------------------

  exportFlow(): FlowExport {
    return { objectives: this.objectives(), flowLinks: this.links(), flowLayouts: this.layouts() };
  }

  /**
   * Replaces the Flow data with an export's (missing or malformed parts become empty; bad rows are skipped,
   * target dates must be valid days, links must join imported objectives). Links to tasks and milestones
   * can only be checked against the imported tasks, so call `ProjectsService.sweepFlow()` afterwards.
   */
  importFlow(data: Partial<FlowExport> | null | undefined): void {
    const now = Date.now();
    const objectives: Objective[] = [];
    const seen = new Set<string>();
    asArray(data?.objectives).forEach((raw, index) => {
      if (!isObject(raw) || !text(raw['id']) || !text(raw['projectId']) || seen.has(raw['id'] as string)) return;
      const title = text(raw['title'])?.trim();
      if (!title) return;
      seen.add(raw['id'] as string);
      const description = text(raw['description']);
      const targetDate = raw['targetDate'];
      objectives.push({
        id: raw['id'] as string,
        projectId: raw['projectId'] as string,
        title: title.slice(0, MAX_TEXT),
        horizon: HORIZONS.find((h) => h === raw['horizon']) ?? 'short',
        status: STATUSES.find((s) => s === raw['status']) ?? 'active',
        order: finite(raw['order']) ?? index,
        createdAt: finite(raw['createdAt']) ?? now,
        ...(description ? { description } : {}),
        ...(isIsoDate(targetDate) ? { targetDate } : {}),
      });
    });

    const byId = new Map(objectives.map((o) => [o.id, o]));
    const links: FlowLink[] = [];
    const keys = new Set<string>();
    for (const raw of asArray(data?.flowLinks)) {
      if (!isObject(raw) || !text(raw['id']) || !text(raw['fromId'])) continue;
      const fromKind = LINK_KINDS.find((k) => k === raw['fromKind']);
      const target = byId.get(raw['toObjectiveId'] as string);
      if (!fromKind || !target) continue;
      const link: FlowLink = {
        id: raw['id'] as string,
        projectId: target.projectId,
        fromKind,
        fromId: raw['fromId'] as string,
        toObjectiveId: target.id,
        createdAt: finite(raw['createdAt']) ?? now,
      };
      const key = linkKey(fromKind, link.fromId, target.id);
      if (keys.has(key) || !isLinkCoherent(link, byId)) continue;
      keys.add(key);
      links.push(link);
    }

    const layouts: FlowLayout[] = [];
    for (const raw of asArray(data?.flowLayouts)) {
      if (!isObject(raw) || !text(raw['id']) || layouts.some((l) => l.id === raw['id'])) continue;
      const positions: Record<string, FlowPosition> = {};
      if (isObject(raw['positions'])) {
        for (const [key, p] of Object.entries(raw['positions']).slice(0, MAX_POSITIONS)) {
          if (isObject(p) && finite(p['x']) !== undefined && finite(p['y']) !== undefined) {
            positions[key] = { x: p['x'] as number, y: p['y'] as number };
          }
        }
      }
      const collapsed = asArray(raw['collapsed']).filter((k): k is string => typeof k === 'string').slice(0, MAX_POSITIONS);
      layouts.push({ id: raw['id'] as string, positions, collapsed });
    }

    this.objectives.set(objectives);
    this.links.set(links);
    this.layouts.set(layouts);
  }

  reset(): void {
    this.objectives.set([]);
    this.links.set([]);
    this.layouts.set([]);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
