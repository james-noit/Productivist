import type { Horizon } from '../types/flow';

/**
 * Geometry of the Flow diagram. Every card has a fixed width and fixed row heights, so the position of a
 * port is computed from the card's position instead of being measured from the DOM: no ResizeObserver per
 * card, fully deterministic, and an edge can follow a card that is being dragged without touching layout.
 * The components bind these same numbers as inline sizes, so the markup and the maths cannot drift apart.
 *
 * Pure and framework-free. Only the lazy Flow components import it (never the initial bundle).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pan and zoom of the canvas: `screen = world * k + (x, y)`. */
export interface Viewport {
  x: number;
  y: number;
  k: number;
}

export type LaneKey = 'work' | Horizon;

/** Left to right: the work flows into the outcomes. */
export const LANES: readonly LaneKey[] = ['work', 'short', 'medium', 'long'];

export const LANE_WIDTH = 380;
/** Gap between a lane's left edge and its cards; the lane's width minus the card minus this is the gutter edges run through. */
export const CARD_INSET = 28;
/** Y of the first card of a lane (below the lane label). */
export const LANE_TOP = 64;
export const CARD_GAP = 24;

export const WORK_CARD_WIDTH = 264;
export const OBJECTIVE_WIDTH = 248;
export const OBJECTIVE_HEIGHT = 104;

/** Milestone card: header, one row per visible task, an "Add task" row and a little bottom padding. */
export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 30;
export const ADD_ROW_HEIGHT = 30;
export const BODY_PADDING = 6;

export const PORT_RADIUS = 6;

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

export function laneIndex(lane: LaneKey): number {
  return LANES.indexOf(lane);
}

/** Left edge of a lane's band. */
export function laneX(lane: LaneKey): number {
  return laneIndex(lane) * LANE_WIDTH;
}

/** X of the cards in a lane. */
export function cardX(lane: LaneKey): number {
  return laneX(lane) + CARD_INSET;
}

/** The lane a world x falls in, or null outside the four bands. */
export function laneAt(worldX: number): LaneKey | null {
  if (worldX < 0 || worldX >= LANES.length * LANE_WIDTH) return null;
  return LANES[Math.floor(worldX / LANE_WIDTH)];
}

/** Height of a milestone (or "No milestone") card showing `rows` task rows. A collapsed card is its header only. */
export function workCardHeight(rows: number, collapsed: boolean): number {
  return collapsed ? HEADER_HEIGHT : HEADER_HEIGHT + rows * ROW_HEIGHT + ADD_ROW_HEIGHT + BODY_PADDING;
}

export function objectiveRect(pos: Point): Rect {
  return { x: pos.x, y: pos.y, w: OBJECTIVE_WIDTH, h: OBJECTIVE_HEIGHT };
}

export function workCardRect(pos: Point, height: number): Rect {
  return { x: pos.x, y: pos.y, w: WORK_CARD_WIDTH, h: height };
}

/** Where links arrive at an objective (left edge, middle). */
export function objectiveInPort(pos: Point): Point {
  return { x: pos.x, y: pos.y + OBJECTIVE_HEIGHT / 2 };
}

/** Where links leave an objective (right edge, middle). */
export function objectiveOutPort(pos: Point): Point {
  return { x: pos.x + OBJECTIVE_WIDTH, y: pos.y + OBJECTIVE_HEIGHT / 2 };
}

/** Port of a milestone card's header; also where the links of hidden or collapsed task rows attach. */
export function headerPort(pos: Point): Point {
  return { x: pos.x + WORK_CARD_WIDTH, y: pos.y + HEADER_HEIGHT / 2 };
}

/** Port of the task row at `index` (0 = first visible row). */
export function rowPort(pos: Point, index: number): Point {
  return { x: pos.x + WORK_CARD_WIDTH, y: pos.y + HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2 };
}

/** Cubic Bézier between two ports, leaving `a` to the right and arriving at `b` from the left. */
export function linkPath(a: Point, b: Point): string {
  const dx = Math.max(48, Math.abs(b.x - a.x) * 0.5);
  return `M${a.x} ${a.y}C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
}

/** Midpoint of `linkPath` (the symmetric curve passes through the average of its end points). */
export function linkMid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function rectContains(rect: Rect, p: Point, margin = 0): boolean {
  return p.x >= rect.x - margin && p.x <= rect.x + rect.w + margin && p.y >= rect.y - margin && p.y <= rect.y + rect.h + margin;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Smallest rect holding all of `rects`, or null when there are none. */
export function unionRects(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function clampZoom(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

/** The part of the world a viewport of `width` x `height` pixels shows, grown by `margin` world units on each side. */
export function visibleWorldRect(viewport: Viewport, width: number, height: number, margin = 0): Rect {
  return {
    x: -viewport.x / viewport.k - margin,
    y: -viewport.y / viewport.k - margin,
    w: width / viewport.k + margin * 2,
    h: height / viewport.k + margin * 2,
  };
}

/** Zooms by `factor` keeping the world point under the screen position (`cx`, `cy`) where it is. */
export function zoomAround(viewport: Viewport, factor: number, cx: number, cy: number): Viewport {
  const k = clampZoom(viewport.k * factor);
  const ratio = k / viewport.k;
  return { x: cx - (cx - viewport.x) * ratio, y: cy - (cy - viewport.y) * ratio, k };
}

/** The viewport that shows `bounds` entirely, centred, never zoomed in past 100%. */
export function fitViewport(bounds: Rect, width: number, height: number, padding = 32): Viewport {
  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);
  const k = clampZoom(Math.min(availW / Math.max(bounds.w, 1), availH / Math.max(bounds.h, 1), 1));
  return {
    x: (width - bounds.w * k) / 2 - bounds.x * k,
    y: (height - bounds.h * k) / 2 - bounds.y * k,
    k,
  };
}
