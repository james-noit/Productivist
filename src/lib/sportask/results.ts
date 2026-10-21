import type { BlockStatus, MetricKind, SportBlock, StepResult } from '../../types/sportask';
import type { Catalog } from './engine/context';

/**
 * One line of the Results form (the break modal's end screen and the history's "Edit marks"): the steps of a block grouped
 * by exercise and side when the block repeats its circuit in rounds, otherwise one per step.
 */
export interface ResultRow {
  key: string;
  /** The step indexes this row stands for (several when the exercise repeats in rounds). */
  indexes: number[];
  name: string;
  side: 'left' | 'right' | null;
  metric: MetricKind;
  loadable: boolean;
  value: number | null;
  loadKg: number | null;
  done: boolean;
}

/** The rows of a stored block, filled from its results (a skipped block has none: every row starts undone). */
export function rowsFromBlock(block: SportBlock, catalog: Catalog, nameOf: (exerciseId: string) => string): ResultRow[] {
  const test = block.kind === 'test';
  const assessmentMetric = test && block.assessmentId ? catalog.assessments.get(block.assessmentId)?.metric : undefined;
  const grouped = block.steps.some((s) => s.round !== undefined);
  const rows: ResultRow[] = [];
  const byKey = new Map<string, ResultRow>();
  block.steps.forEach((step, index) => {
    const ex = catalog.exercises.get(step.exerciseId);
    const result = block.results.find((r) => r.stepIndex === index);
    const done = result?.done === true;
    const key = grouped ? `${step.exerciseId}|${step.side ?? ''}` : String(index);
    const existing = byKey.get(key);
    if (existing) {
      existing.indexes.push(index);
      existing.done = existing.done && done;
      if (existing.value === null && result?.value !== undefined) existing.value = result.value;
      return;
    }
    const row: ResultRow = {
      key,
      indexes: [index],
      name: nameOf(step.exerciseId),
      side: step.side ?? null,
      metric: assessmentMetric ?? ex?.metric ?? 'reps',
      loadable: ex?.loadable === true && !test,
      value: result?.value ?? null,
      loadKg: result?.loadKg ?? step.loadKg ?? null,
      done,
    };
    byKey.set(key, row);
    rows.push(row);
  });
  return rows;
}

/** The step results to store for the rows. A value or a weight is only written when it is set (the sync wire rule). */
export function resultsFromRows(rows: readonly ResultRow[]): StepResult[] {
  const results: StepResult[] = [];
  for (const row of rows) {
    for (const index of row.indexes) {
      const result: StepResult = { stepIndex: index, done: row.done };
      if (row.value !== null) result.value = row.value;
      if (row.loadable && row.loadKg !== null) result.loadKg = row.loadKg;
      results.push(result);
    }
  }
  return results.sort((a, b) => a.stepIndex - b.stepIndex);
}

/** Edited marks: nothing done is a skipped block, everything done is done, anything in between is partial. */
export function statusFromRows(rows: readonly ResultRow[]): BlockStatus {
  if (rows.length === 0 || rows.every((r) => !r.done)) return 'skipped';
  return rows.every((r) => r.done) ? 'done' : 'partial';
}
