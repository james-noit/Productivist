/** How far ahead an objective looks. Work flows from short to medium to long (see lib/flow-rules.ts). */
export type Horizon = 'short' | 'medium' | 'long';
export type ObjectiveStatus = 'active' | 'achieved' | 'dropped';

/**
 * An outcome a project's work is for. Not a task: it is never ticked off, its progress is derived from
 * the work linked to it. Not to be confused with the daily planner's free-text "today's objectives".
 */
export interface Objective {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  horizon: Horizon;
  status: ObjectiveStatus;
  /** Local calendar day as 'YYYY-MM-DD' (see lib/dates.ts). */
  targetDate?: string;
  order: number;
  createdAt: number;
}

export type FlowLinkKind = 'task' | 'milestone' | 'objective';

/** "`from` contributes to objective `toObjectiveId`". `from` is a task, a milestone or a shorter-horizon objective. */
export interface FlowLink {
  id: string;
  /** The project of the target objective; a link never crosses projects. */
  projectId: string;
  fromKind: FlowLinkKind;
  fromId: string;
  toObjectiveId: string;
  createdAt: number;
}

/** Position of one node on the diagram, in world coordinates. */
export interface FlowPosition {
  x: number;
  y: number;
}

/**
 * Hand-placed positions of one project's nodes, one row per project. Keys are `${kind}:${id}` with kind
 * `objective` or `milestone` (id = that entity's id), or `nomilestone` (id = the project id, for the card
 * of tasks without a milestone). Nodes without an entry are auto-laid out. Tasks are rows inside their
 * milestone card and have no position. Kept apart from tasks and milestones so dragging a node never
 * rewrites (and re-stamps) their rows.
 */
export interface FlowLayout {
  /** The project id: one layout per project. */
  id: string;
  positions: Record<string, FlowPosition>;
  /** Keys of the collapsed cards. */
  collapsed: string[];
}

export type FlowNodeKind = 'objective' | 'milestone' | 'nomilestone';

/** The Flow part of an export file (version 4). */
export interface FlowExport {
  objectives: Objective[];
  flowLinks: FlowLink[];
  flowLayouts: FlowLayout[];
}
