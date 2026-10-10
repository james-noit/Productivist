import type { FlowLink, FlowLinkKind, Horizon, Objective } from '../types/flow';

/**
 * The rules of the Flow diagram's links, kept pure so the store enforces them and the diagram can reuse
 * them to highlight valid targets while a link is being dragged.
 *
 * - a task or a milestone may feed any objective of its own project;
 * - an objective may feed only an objective of a strictly longer horizon (short → medium → long), which
 *   also makes cycles impossible;
 * - a link never crosses projects, never repeats, and never points at an objective that does not exist.
 */

/** Shortest first. */
export const HORIZONS: readonly Horizon[] = ['short', 'medium', 'long'];

const RANK: Record<Horizon, number> = { short: 0, medium: 1, long: 2 };

export function horizonRank(horizon: Horizon): number {
  return RANK[horizon];
}

/** True when `to` looks further ahead than `from`. */
export function isLongerHorizon(from: Horizon, to: Horizon): boolean {
  return RANK[to] > RANK[from];
}

/** The node a link would start from. `projectId` is needed for tasks and milestones; objectives carry their own. */
export interface FlowSource {
  kind: FlowLinkKind;
  id: string;
  projectId?: string;
}

/** Why a link was refused. */
export type LinkRefusal =
  /** The target objective, or the source objective, does not exist. */
  | 'missing'
  /** An objective cannot feed itself. */
  | 'self'
  /** Source and target are in different projects (or the source task has no project). */
  | 'project'
  /** An objective can only feed a strictly longer horizon. */
  | 'horizon'
  | 'duplicate';

/** Identity of a link ignoring its id: what makes two links duplicates. */
export function linkKey(fromKind: FlowLinkKind, fromId: string, toObjectiveId: string): string {
  return `${fromKind}:${fromId}>${toObjectiveId}`;
}

function refusal(
  from: FlowSource,
  fromObjective: Objective | undefined,
  target: Objective,
  existing: ReadonlySet<string>,
): LinkRefusal | null {
  if (from.kind === 'objective') {
    if (!fromObjective) return 'missing';
    if (fromObjective.id === target.id) return 'self';
    if (fromObjective.projectId !== target.projectId) return 'project';
    if (!isLongerHorizon(fromObjective.horizon, target.horizon)) return 'horizon';
  } else if (from.projectId !== target.projectId) {
    return 'project';
  }
  return existing.has(linkKey(from.kind, from.id, target.id)) ? 'duplicate' : null;
}

/** Null when `from` may be linked to the objective `toObjectiveId`, otherwise the reason it may not. */
export function validateLink(
  objectives: readonly Objective[],
  links: readonly FlowLink[],
  from: FlowSource,
  toObjectiveId: string,
): LinkRefusal | null {
  const target = objectives.find((o) => o.id === toObjectiveId);
  if (!target) return 'missing';
  const fromObjective = from.kind === 'objective' ? objectives.find((o) => o.id === from.id) : undefined;
  const existing = new Set(links.map((l) => linkKey(l.fromKind, l.fromId, l.toObjectiveId)));
  return refusal(from, fromObjective, target, existing);
}

/** Every objective `from` could be linked to right now (for highlighting while dragging from a port). */
export function validTargets(
  objectives: readonly Objective[],
  links: readonly FlowLink[],
  from: FlowSource,
): Objective[] {
  const fromObjective = from.kind === 'objective' ? objectives.find((o) => o.id === from.id) : undefined;
  const existing = new Set(links.map((l) => linkKey(l.fromKind, l.fromId, l.toObjectiveId)));
  return objectives.filter((target) => refusal(from, fromObjective, target, existing) === null);
}

/**
 * True when an existing link still obeys the structural rules (known target, same project, horizon order
 * for objective links). Used after a horizon change and by the load-time sweep; it ignores duplicates.
 */
export function isLinkCoherent(link: FlowLink, objectivesById: ReadonlyMap<string, Objective>): boolean {
  const target = objectivesById.get(link.toObjectiveId);
  if (!target || target.projectId !== link.projectId) return false;
  if (link.fromKind !== 'objective') return true;
  const source = objectivesById.get(link.fromId);
  return !!source && source.projectId === link.projectId && isLongerHorizon(source.horizon, target.horizon);
}
