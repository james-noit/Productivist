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

/** Screen px the diagram may be pushed past a canvas edge before the pan stops. */
export const OVERSCROLL = 96;
/** Screen px the lane headers may sit below the canvas's top edge at most (the diagram is top-aligned). */
export const PAD_TOP = 16;

/** Width of a collapsed horizon lane: just a strip with its name written vertically. */
export const COLLAPSED_LANE_WIDTH = 36;

/** One lane band of the diagram: where it starts, how wide it is, and whether it is only a strip. */
export interface LaneBox {
  key: LaneKey;
  x: number;
  width: number;
  collapsed: boolean;
}

/**
 * The lane bands for a set of hidden horizons: Work is always open; a hidden horizon shrinks to
 * `COLLAPSED_LANE_WIDTH` and the lanes after it move left. The lane x (and so the x of the cards in it) is a
 * function of this, never stored: collapsing a lane rewrites no card position.
 */
export function laneLayout(hidden: ReadonlySet<Horizon> | readonly Horizon[] = []): LaneBox[] {
  const set = new Set<Horizon>(hidden);
  let x = 0;
  return LANES.map((key) => {
    const collapsed = key !== 'work' && set.has(key);
    const width = collapsed ? COLLAPSED_LANE_WIDTH : LANE_WIDTH;
    const box = { key, x, width, collapsed };
    x += width;
    return box;
  });
}

/** Every lane open: what the geometry functions assume when no layout is passed. */
export const DEFAULT_LANES: readonly LaneBox[] = laneLayout();

/** Total width of the lane bands. */
export function lanesWidth(lanes: readonly LaneBox[] = DEFAULT_LANES): number {
  const last = lanes[lanes.length - 1];
  return last ? last.x + last.width : 0;
}

export function laneIndex(lane: LaneKey): number {
  return LANES.indexOf(lane);
}

/** Left edge of a lane's band. */
export function laneX(lane: LaneKey, lanes: readonly LaneBox[] = DEFAULT_LANES): number {
  return lanes.find((l) => l.key === lane)?.x ?? laneIndex(lane) * LANE_WIDTH;
}

/** X of the cards in a lane. */
export function cardX(lane: LaneKey, lanes: readonly LaneBox[] = DEFAULT_LANES): number {
  return laneX(lane, lanes) + CARD_INSET;
}

/** The lane a world x falls in (a collapsed strip included: the caller decides what that means), or null outside the bands. */
export function laneAt(worldX: number, lanes: readonly LaneBox[] = DEFAULT_LANES): LaneKey | null {
  if (worldX < 0) return null;
  return lanes.find((l) => worldX >= l.x && worldX < l.x + l.width)?.key ?? null;
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

/** Clamps a zoom to `[min, MAX_ZOOM]`; `min` defaults to the absolute minimum (a canvas passes `minZoomFor`). */
export function clampZoom(k: number, min = MIN_ZOOM): number {
  return Math.min(MAX_ZOOM, Math.max(min, k));
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

/**
 * Zooms by `factor` keeping the world point under the screen position (`cx`, `cy`) where it is. `min` is the lowest
 * zoom allowed; a viewport already below it is not pushed back up by a zoom-out.
 */
export function zoomAround(viewport: Viewport, factor: number, cx: number, cy: number, min = MIN_ZOOM): Viewport {
  const k = clampZoom(viewport.k * factor, factor < 1 ? Math.min(min, viewport.k) : min);
  const ratio = k / viewport.k;
  return { x: cx - (cx - viewport.x) * ratio, y: cy - (cy - viewport.y) * ratio, k };
}

/** The part of the world the lane bands and cards occupy: every lane as it is now, down to `bottom` (the lowest card). */
export function contentBounds(lanes: readonly LaneBox[], bottom: number): Rect {
  return { x: 0, y: 0, w: lanesWidth(lanes), h: bottom + CARD_GAP };
}

/** The zoom `fitViewport` picks for `bounds`: everything visible, never past 100%. */
export function fitZoom(bounds: Rect, width: number, height: number, padding = 32, insetLeft = 0): number {
  const availW = Math.max(1, width - insetLeft - padding * 2);
  const availH = Math.max(1, height - padding * 2);
  return clampZoom(Math.min(availW / Math.max(bounds.w, 1), availH / Math.max(bounds.h, 1), 1));
}

/**
 * The lowest zoom a canvas of `width` x `height` allows for `bounds`: 75% of the zoom that fits everything (never
 * above 100%), and never below `MIN_ZOOM`. Zooming out further would only add blank space.
 */
export function minZoomFor(bounds: Rect, width: number, height: number): number {
  return Math.max(MIN_ZOOM, Math.min(1, fitZoom(bounds, width, height, 16)) * 0.75);
}

/**
 * Keeps the diagram from leaving the canvas: `x` and `y` are clamped independently, `k` is never touched. Content
 * narrower than the canvas can only slide inside it; wider content may be pushed at most `margin` px past an edge.
 * Vertically the lane headers never sit more than `PAD_TOP` below the top, a tall diagram scrolls until its bottom
 * is `margin` px above the canvas bottom, and a short one is pinned to the top. Idempotent; returns `v` itself when
 * nothing changes.
 */
export function clampViewport(v: Viewport, bounds: Rect, width: number, height: number, margin = OVERSCROLL): Viewport {
  const startX = bounds.x * v.k;
  const sizeX = bounds.w * v.k;
  const loX = sizeX <= width ? -startX : width - sizeX - startX - margin;
  const hiX = sizeX <= width ? width - sizeX - startX : -startX + margin;
  const startY = bounds.y * v.k;
  const sizeY = bounds.h * v.k;
  const hiY = PAD_TOP - startY;
  const loY = Math.min(PAD_TOP, height - sizeY - margin) - startY;
  const x = Math.min(Math.max(v.x, loX), hiX);
  const y = Math.min(Math.max(v.y, loY), hiY);
  return x === v.x && y === v.y ? v : { x, y, k: v.k };
}

/**
 * The viewport that shows `bounds` entirely, centred horizontally, never zoomed in past 100%. `insetLeft` is screen
 * space on the left that something floats over (the controls cluster), so the content is centred in what remains.
 * `align` places content shorter than the canvas: `'center'` vertically centred, `'top'` against the top padding.
 */
export function fitViewport(bounds: Rect, width: number, height: number, padding = 32, insetLeft = 0, align: 'center' | 'top' = 'center'): Viewport {
  const k = fitZoom(bounds, width, height, padding, insetLeft);
  return {
    x: insetLeft + (width - insetLeft - bounds.w * k) / 2 - bounds.x * k,
    y: align === 'top' ? padding - bounds.y * k : (height - bounds.h * k) / 2 - bounds.y * k,
    k,
  };
}
