import {
  CARD_GAP,
  LANE_TOP,
  OBJECTIVE_HEIGHT,
  cardX,
  headerPort,
  rowPort,
  workCardHeight,
  type Point,
} from './flow-geometry';
import type { FlowPosition, Horizon } from '../types/flow';

/**
 * Places the diagram's cards. Columns are fixed by the lanes (Work | Short | Medium | Long), so only the
 * y of each card is decided here. Cards with a stored position keep it; the others are stacked into the
 * free space, objectives near the average height of what feeds them (a light barycentre pass, left to
 * right) so links stay short and cross little. Pure; only the lazy Flow components import it.
 */

export interface LayoutCard {
  key: string;
  /** Visible task rows. */
  rows: number;
  collapsed: boolean;
}

export interface LayoutObjective {
  key: string;
  horizon: Horizon;
  order: number;
}

export interface LayoutInput {
  /** In display order. */
  cards: readonly LayoutCard[];
  objectives: readonly LayoutObjective[];
  /** Task key → the card it sits in and its row index (visible rows only). */
  rowOf: ReadonlyMap<string, { cardKey: string; index: number }>;
  /** Links as source key (`task:…`, `milestone:…`, `objective:…`) to the target objective's key. */
  edges: readonly { from: string; to: string }[];
  /** Stored positions by node key; only their y is used, the x always comes from the lane. */
  stored: Readonly<Record<string, FlowPosition>>;
}

export interface Placement {
  /** Final top-left of every card, by node key. */
  positions: Map<string, Point>;
  /** Height of every Work card, by key (objectives all share `OBJECTIVE_HEIGHT`). */
  heights: Map<string, number>;
  /** Lowest edge of anything placed (`LANE_TOP` when the diagram is empty). */
  bottom: number;
}

interface Interval {
  top: number;
  bottom: number;
}

/** The lowest y at or after `from` where a card of height `h` clears every interval by `CARD_GAP`. */
function firstFree(taken: readonly Interval[], from: number, h: number): number {
  let y = Math.max(LANE_TOP, from);
  for (let moved = true; moved; ) {
    moved = false;
    for (const t of taken) {
      if (y < t.bottom + CARD_GAP && y + h + CARD_GAP > t.top) {
        y = t.bottom + CARD_GAP;
        moved = true;
      }
    }
  }
  return y;
}

const storedY = (stored: LayoutInput['stored'], key: string): number | undefined => {
  const y = stored[key]?.y;
  return typeof y === 'number' && Number.isFinite(y) ? y : undefined;
};

export function layoutFlow(input: LayoutInput): Placement {
  const positions = new Map<string, Point>();
  const heights = new Map<string, number>();
  let bottom = LANE_TOP;

  // ---- Work lane: stored cards stay where they are, the rest stack in order.
  const workX = cardX('work');
  const workTaken: Interval[] = [];
  const cardIndex = new Map(input.cards.map((c) => [c.key, c]));
  for (const card of input.cards) {
    const h = workCardHeight(card.rows, card.collapsed);
    heights.set(card.key, h);
    const y = storedY(input.stored, card.key);
    if (y !== undefined) {
      positions.set(card.key, { x: workX, y });
      workTaken.push({ top: y, bottom: y + h });
    }
  }
  let cursor = LANE_TOP;
  for (const card of input.cards) {
    if (positions.has(card.key)) continue;
    const h = heights.get(card.key)!;
    const y = firstFree(workTaken, cursor, h);
    positions.set(card.key, { x: workX, y });
    workTaken.push({ top: y, bottom: y + h });
    cursor = y + h + CARD_GAP;
  }
  for (const card of input.cards) bottom = Math.max(bottom, positions.get(card.key)!.y + heights.get(card.key)!);

  // Height at which a link leaves its source, once the source is placed.
  const sourceY = (key: string): number | undefined => {
    if (key.startsWith('task:')) {
      const row = input.rowOf.get(key);
      const card = row && cardIndex.get(row.cardKey);
      const pos = row && positions.get(row.cardKey);
      if (!row || !card || !pos) return undefined;
      return (card.collapsed ? headerPort(pos) : rowPort(pos, row.index)).y;
    }
    const pos = positions.get(key);
    if (!pos) return undefined;
    if (key.startsWith('objective:')) return pos.y + OBJECTIVE_HEIGHT / 2;
    return headerPort(pos).y;
  };

  // ---- Objective lanes, shortest first so a lane can follow the heights of what feeds it.
  const feeders = new Map<string, string[]>();
  for (const edge of input.edges) {
    const list = feeders.get(edge.to);
    if (list) list.push(edge.from);
    else feeders.set(edge.to, [edge.from]);
  }
  for (const horizon of ['short', 'medium', 'long'] as const) {
    const lane = input.objectives.filter((o) => o.horizon === horizon);
    const x = cardX(horizon);
    const taken: Interval[] = [];
    const loose: { objective: LayoutObjective; wanted: number | undefined }[] = [];
    for (const objective of lane) {
      const y = storedY(input.stored, objective.key);
      if (y !== undefined) {
        positions.set(objective.key, { x, y });
        taken.push({ top: y, bottom: y + OBJECTIVE_HEIGHT });
        continue;
      }
      const heightsOfFeeders = (feeders.get(objective.key) ?? []).map(sourceY).filter((v): v is number => v !== undefined);
      const wanted = heightsOfFeeders.length ? heightsOfFeeders.reduce((a, b) => a + b, 0) / heightsOfFeeders.length : undefined;
      loose.push({ objective, wanted });
    }
    // Fed objectives first, ordered by where their feeders are; the unfed ones go below them.
    loose.sort((a, b) => (a.wanted ?? Infinity) - (b.wanted ?? Infinity) || a.objective.order - b.objective.order);
    for (const { objective, wanted } of loose) {
      const bottom = taken.reduce((max, t) => Math.max(max, t.bottom), LANE_TOP - CARD_GAP);
      const y = firstFree(taken, wanted === undefined ? bottom + CARD_GAP : wanted - OBJECTIVE_HEIGHT / 2, OBJECTIVE_HEIGHT);
      positions.set(objective.key, { x, y });
      taken.push({ top: y, bottom: y + OBJECTIVE_HEIGHT });
    }
    for (const objective of lane) bottom = Math.max(bottom, positions.get(objective.key)!.y + OBJECTIVE_HEIGHT);
  }

  return { positions, heights, bottom };
}

export interface SettleCard {
  key: string;
  y: number;
  h: number;
  /** Has a hand-placed (stored) position. */
  stored: boolean;
}

/**
 * After the Work card `grownKey` got taller (a task was added, the card was expanded), the hand-placed cards
 * below it that it now overlaps are pushed down, in order, until every gap is `CARD_GAP` again. Cards
 * without a stored position never need this (the layout already restacks them) and cards that do not
 * overlap keep their position. Returns the new y of the cards that moved.
 */
export function pushDownOverlaps(cards: readonly SettleCard[], grownKey: string): Map<string, number> {
  const moved = new Map<string, number>();
  const sorted = [...cards].sort((a, b) => a.y - b.y);
  const start = sorted.findIndex((c) => c.key === grownKey);
  if (start < 0) return moved;
  let floor = sorted[start].y + sorted[start].h + CARD_GAP;
  for (const card of sorted.slice(start + 1)) {
    let y = card.y;
    if (card.stored && y < floor) {
      y = floor;
      moved.set(card.key, y);
    }
    floor = Math.max(floor, y + card.h + CARD_GAP);
  }
  return moved;
}
