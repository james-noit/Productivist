import { addDays, startOfWeek } from '../../dates';
import type { MetricKind, SportBlock } from '../../../types/sportask';
import type { Catalog } from '../engine/context';
import { netKcal, workSecondsDone } from '../kcal';
import { counted, doneSteps } from './helpers';

export interface WeekStats {
  /** Blocks of this week the user did (done or partial) and blocks that were offered (also the skipped ones). */
  counted: number;
  offered: number;
  /** Seconds of work marked done, in minutes. */
  activeMinutes: number;
  /** Days in a row, ending today (or yesterday while today has none yet), with at least one counted block. */
  streak: number;
  /** Null without a body weight. */
  kcal: number | null;
}

/** The tiles of the Summary tab. `today` is passed in, so this stays pure. */
export function weekStats(blocks: readonly SportBlock[], today: string, catalog: Catalog, weightKg: number | null): WeekStats {
  const monday = startOfWeek(today);
  let countedBlocks = 0;
  let offered = 0;
  let seconds = 0;
  let kcal = 0;
  const days = new Set<string>();
  for (const b of blocks) {
    if (counted(b)) days.add(b.date);
    if (b.date < monday || b.date > today) continue;
    offered += 1;
    if (!counted(b)) continue;
    countedBlocks += 1;
    seconds += workSecondsDone(b);
    kcal += netKcal(b, catalog, weightKg);
  }
  let streak = 0;
  for (let d = days.has(today) ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) streak += 1;
  return { counted: countedBlocks, offered, activeMinutes: seconds / 60, streak, kcal: weightKg ? kcal : null };
}

export interface PersonalRecord {
  exerciseId: string;
  metric: Exclude<MetricKind, 'cm'>;
  value: number;
  /** The day it was set (the earliest one when equalled). */
  date: string;
  loadKg?: number;
}

/**
 * The best value per exercise and metric across every block the user did. A test records its assessment's metric (the 60 s cardio
 * test counts reps of an exercise whose own metric is seconds); distances (cm) have their own charts and are left out.
 */
export function personalRecords(blocks: readonly SportBlock[], catalog: Catalog): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  for (const b of [...blocks].sort((x, y) => x.startedAt - y.startedAt)) {
    if (!counted(b)) continue;
    const testMetric = b.kind === 'test' && b.assessmentId ? catalog.assessments.get(b.assessmentId)?.metric : undefined;
    for (const i of doneSteps(b)) {
      const step = b.steps[i]!;
      const result = b.results.find((r) => r.stepIndex === i);
      const metric = testMetric ?? catalog.exercises.get(step.exerciseId)?.metric;
      if (result?.value === undefined || (metric !== 'reps' && metric !== 'seconds')) continue;
      const key = `${step.exerciseId}|${metric}`;
      const current = best.get(key);
      if (current && current.value >= result.value) continue;
      const load = result.loadKg ?? step.loadKg;
      best.set(key, { exerciseId: step.exerciseId, metric, value: result.value, date: b.date, ...(load !== undefined && load > 0 ? { loadKg: load } : {}) });
    }
  }
  return [...best.values()];
}
