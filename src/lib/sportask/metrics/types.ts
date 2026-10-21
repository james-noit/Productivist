import type { Constraints, Enrolment, EquipmentInventory, LocalizedText, SportBlock, SportProfile } from '../../../types/sportask';
import type { Catalog } from '../engine/context';

/** Inclusive local days ('YYYY-MM-DD'). */
export interface DateRange {
  from: string;
  to: string;
}

/** What a metric may need besides the blocks. Everything is a plain value, so metrics stay pure. */
export interface MetricEnv {
  catalog: Catalog;
  /** Body weight in kg, or null: the calorie metric is then flagged `missing: 'weight'`. */
  weightKg: number | null;
  enrolment: Enrolment | null;
  /** The user's status (0.25): the ladder replay starts from it and the weekly targets scale with it. */
  profile?: SportProfile;
  /** The effective inventory and limits, for the ladder replay (a rung counts only when an alternative is usable). */
  equipment: EquipmentInventory;
  constraints: Constraints;
}

export type ChartKind = 'line' | 'bars' | 'stackedBars' | 'heatmap' | 'stat';

/** First, last and best value of an assessment series, and whether the change since the first test is an improvement. */
export interface AssessmentSummary {
  first: number;
  last: number;
  best: number;
  /** last - first. */
  delta: number;
  /** null when nothing changed. */
  improved: boolean | null;
}

/** One series: `values` is aligned with `Series.keys`; null = no data at that key (a gap in a line). */
export interface SeriesGroup {
  /** A stable id the UI turns into a label: 'done', 'push', 'hips', 'left', ... */
  id: string;
  values: (number | null)[];
  summary?: AssessmentSummary;
}

export interface Series {
  kind: ChartKind;
  /** x keys: the Monday of each week for weekly series, a day for the heatmap and the assessments. */
  keys: string[];
  groups: SeriesGroup[];
  /** A target line, aligned with `keys` (null = none that week). */
  targets?: (number | null)[];
  /** A line that holds its value until the next point (levels). */
  stepped?: boolean;
  /** The data this metric needs is not there: show a hint instead of a chart. */
  missing?: 'weight';
  /** Assessments: the exercises used over time, in order of first use; more than one means the test changed. */
  exerciseIds?: string[];
}

export interface MetricDef {
  id: string;
  name: LocalizedText;
  unit: LocalizedText;
  chart: ChartKind;
  compute(blocks: readonly SportBlock[], range: DateRange, env: MetricEnv): Series;
}
