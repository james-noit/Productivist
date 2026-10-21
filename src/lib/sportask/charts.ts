import { diffDays, startOfWeek } from '../dates';

/** Pure geometry for the Sportask charts (scales, ticks, bars, paths, the heatmap grid). No Angular, no DOM. */

/** Series colours, as tokens (the skins redefine them): the first four are the plan's, the rest cover the stacked pattern/zone charts. */
export const SERIES_TONES: readonly string[] = [
  'var(--color-primary)',
  'var(--color-quadrant-schedule)',
  'var(--color-capacity-safe)',
  'var(--color-capacity-high)',
  'var(--color-quadrant-delegate)',
  'var(--color-quadrant-do-first)',
  'var(--color-quadrant-eliminate)',
  'var(--color-low)',
  'var(--color-medium)',
];

export const toneOf = (index: number): string => SERIES_TONES[index % SERIES_TONES.length]!;

export interface Plot {
  width: number;
  height: number;
  /** The drawing area inside the margins. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function plotOf(width: number, height: number, margin = { left: 40, right: 12, top: 12, bottom: 28 }): Plot {
  return { width, height, left: margin.left, right: Math.max(margin.left + 1, width - margin.right), top: margin.top, bottom: Math.max(margin.top + 1, height - margin.bottom) };
}

export interface Ticks {
  values: number[];
  min: number;
  max: number;
}

/** A "nice" step (1, 2, 2.5, 5 times a power of ten) for splitting `span` into about `count` parts. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/** Ticks from `min` to a rounded-up max. A zero or empty span still gets a usable axis. */
export function niceTicks(min: number, max: number, count = 4): Ticks {
  const lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (!(hi > lo)) hi = lo + 1;
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const values: number[] = [];
  for (let v = start, i = 0; v <= end + step / 1e6 && i < 50; v += step, i++) values.push(Math.round(v * 1e6) / 1e6);
  return { values, min: values[0]!, max: values[values.length - 1]! };
}

/** Linear map from a domain to a range. A degenerate domain maps everything to the middle. */
export function scale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  return d1 === d0 ? () => (r0 + r1) / 2 : (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

export interface BarRect {
  group: number;
  index: number;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarLayoutInput {
  plot: Plot;
  /** groups[g][i]: the value of group g at category i (null counts as 0). */
  groups: readonly (readonly (number | null)[])[];
  stacked: boolean;
  /** Top of the y axis. */
  max: number;
}

/** Bars for a grouped or stacked chart: categories share the width evenly, with a gap between them. */
export function barRects({ plot, groups, stacked, max }: BarLayoutInput): BarRect[] {
  const count = groups[0]?.length ?? 0;
  if (count === 0 || max <= 0) return [];
  const slot = (plot.right - plot.left) / count;
  const gap = Math.min(8, slot * 0.25);
  const inner = Math.max(1, slot - gap);
  const y = scale(0, max, plot.bottom, plot.top);
  const rects: BarRect[] = [];
  for (let i = 0; i < count; i++) {
    let acc = 0;
    groups.forEach((values, g) => {
      const value = values[i] ?? 0;
      if (value <= 0) return;
      const width = stacked ? inner : inner / groups.length;
      const x = plot.left + i * slot + gap / 2 + (stacked ? 0 : g * width);
      const from = stacked ? acc : 0;
      const top = y(from + value);
      const bottom = y(from);
      rects.push({ group: g, index: i, value, x, y: top, width: Math.max(1, width - (stacked ? 0 : 1)), height: Math.max(0, bottom - top) });
      if (stacked) acc += value;
    });
  }
  return rects;
}

/** Height of the tallest stack (stacked) or bar (grouped), and of the targets, for choosing the axis. */
export function barMax(groups: readonly (readonly (number | null)[])[], stacked: boolean, targets?: readonly (number | null)[]): number {
  const count = groups[0]?.length ?? 0;
  let max = 0;
  for (let i = 0; i < count; i++) {
    const values = groups.map((g) => g[i] ?? 0);
    max = Math.max(max, stacked ? values.reduce((a, b) => a + b, 0) : Math.max(0, ...values));
  }
  for (const t of targets ?? []) if (t !== null && t !== undefined) max = Math.max(max, t);
  return max;
}

export interface Pt {
  x: number;
  y: number;
}

const f = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * SVG path data for a line. `null` points break it (a gap, not a drop to zero). With `stepped` the line holds each value until the
 * x of the next point and then jumps.
 */
export function linePath(points: readonly (Pt | null)[], stepped = false): string {
  let d = '';
  let prev: Pt | null = null;
  for (const p of points) {
    if (!p) {
      prev = null;
      continue;
    }
    if (!prev) d += `M${f(p.x)} ${f(p.y)}`;
    else d += stepped ? `H${f(p.x)}V${f(p.y)}` : `L${f(p.x)} ${f(p.y)}`;
    prev = p;
  }
  return d;
}

/** A target line: a step per category, as a horizontal segment across each category slot that has a target. */
export function targetPath(plot: Plot, targets: readonly (number | null)[], max: number): string {
  const count = targets.length;
  if (count === 0 || max <= 0) return '';
  const slot = (plot.right - plot.left) / count;
  const y = scale(0, max, plot.bottom, plot.top);
  let d = '';
  let prev: number | null = null;
  targets.forEach((t, i) => {
    if (t === null || t === undefined) {
      prev = null;
      return;
    }
    const x0 = plot.left + i * slot;
    const ty = y(t);
    d += prev === null ? `M${f(x0)} ${f(ty)}` : prev === ty ? '' : `V${f(ty)}`;
    d += `H${f(x0 + slot)}`;
    prev = ty;
  });
  return d;
}

/** x positions for date keys on a time scale (so unevenly spaced tests are drawn unevenly). One key sits in the middle. */
export function timeScaleX(keys: readonly string[], plot: Plot): (key: string) => number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined || first === last) return () => (plot.left + plot.right) / 2;
  const span = diffDays(first, last);
  const pad = Math.min(12, (plot.right - plot.left) * 0.04);
  return (key) => plot.left + pad + (diffDays(first, key) / span) * (plot.right - plot.left - 2 * pad);
}

/** Which of `count` category labels to print so at most `max` show (always the first). */
export function labelEvery(count: number, max: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, max)));
}

// ---- heatmap -----------------------------------------------------------------------------------------------------------------

export interface HeatCell {
  date: string;
  value: number;
  /** 0 (none) to 4. */
  level: number;
  col: number;
  /** 0 = Monday ... 6 = Sunday. */
  row: number;
}

export interface HeatLayout {
  cells: HeatCell[];
  cols: number;
  /** The first column of each month, for the labels above the grid. */
  monthStarts: { col: number; date: string }[];
}

/** 0 for none, then four buckets up to `max`, so one block is already visible and the busiest day is the darkest. */
export function heatLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
}

/** Weeks as columns (oldest left), Monday to Sunday as rows. Days outside the keys are simply not cells. */
export function heatLayout(keys: readonly string[], values: readonly (number | null)[]): HeatLayout {
  const first = keys[0];
  if (first === undefined) return { cells: [], cols: 0, monthStarts: [] };
  const origin = startOfWeek(first);
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  const cells: HeatCell[] = [];
  const monthStarts: { col: number; date: string }[] = [];
  let lastMonth = '';
  keys.forEach((date, i) => {
    const offset = diffDays(origin, date);
    const col = Math.floor(offset / 7);
    const value = values[i] ?? 0;
    cells.push({ date, value, level: heatLevel(value, max), col, row: offset - col * 7 });
    const month = date.slice(0, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      if (monthStarts[monthStarts.length - 1]?.col !== col) monthStarts.push({ col, date });
    }
  });
  const last = cells[cells.length - 1]!;
  return { cells, cols: last.col + 1, monthStarts };
}
