import { CATALOG } from '../catalog';
import { createRegistry } from '../registry';
import { activeMinutes, adherence, assessmentMetric, density, heatmap, ladderLevel, netKcalMetric, setsPerPattern, zonesCovered } from './defs';
import type { MetricDef } from './types';

export { PATTERN_ORDER, ZONE_ORDER } from './defs';
export type { AssessmentSummary, ChartKind, DateRange, MetricDef, MetricEnv, Series, SeriesGroup } from './types';

/** Every metric (PLAN section 10): the fixed ones plus one `assessment:<id>` per assessment of the catalog. */
export const METRICS = createRegistry<MetricDef>([
  adherence,
  activeMinutes,
  netKcalMetric,
  heatmap,
  setsPerPattern,
  ladderLevel,
  zonesCovered,
  density,
  ...CATALOG.assessments.all.map(assessmentMetric),
]);

/** What the panel charts when the user follows no goal (free training). */
export const FREE_METRIC_IDS: readonly string[] = ['adherence', 'activeMinutes', 'netKcal'];
