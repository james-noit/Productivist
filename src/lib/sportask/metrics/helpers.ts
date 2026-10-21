import { addDays, startOfWeek } from '../../dates';
import type { SportBlock } from '../../../types/sportask';
import type { DateRange } from './types';

/** A block that counts as training: done or partial (the same rule the engine uses for a goal's training days). */
export const counted = (b: Pick<SportBlock, 'status'>): boolean => b.status === 'done' || b.status === 'partial';

export const inRange = (b: Pick<SportBlock, 'date'>, range: DateRange): boolean => b.date >= range.from && b.date <= range.to;

/** The Monday of every week that overlaps the range, oldest first. */
export function weekKeys(range: DateRange): string[] {
  const keys: string[] = [];
  for (let w = startOfWeek(range.from); w <= range.to && keys.length < 600; w = addDays(w, 7)) keys.push(w);
  return keys;
}

/** The days of the range, oldest first. */
export function dayKeys(range: DateRange): string[] {
  const keys: string[] = [];
  for (let d = range.from; d <= range.to && keys.length < 4000; d = addDays(d, 1)) keys.push(d);
  return keys;
}

/** Index (into `keys`, the Mondays) of the week a day falls in, or -1. */
export function weekIndexer(keys: readonly string[]): (date: string) => number {
  const index = new Map(keys.map((k, i) => [k, i]));
  return (date) => index.get(startOfWeek(date)) ?? -1;
}

/** The indexes of the steps the user marked done. */
export function doneSteps(block: Pick<SportBlock, 'steps' | 'results'>): number[] {
  const done = new Set(block.results.filter((r) => r.done).map((r) => r.stepIndex));
  return block.steps.map((_, i) => i).filter((i) => done.has(i));
}

/**
 * A set is a step the user marked done in a training block (tests do not count). The two sides of a per-side exercise are
 * one set, so the right-side step that follows its left twin adds nothing.
 */
export function setExerciseIds(block: SportBlock): string[] {
  if (block.kind === 'test') return [];
  const done = new Set(doneSteps(block));
  const out: string[] = [];
  block.steps.forEach((step, i) => {
    if (!done.has(i)) return;
    const prev = block.steps[i - 1];
    if (step.side === 'right' && prev?.side === 'left' && prev.exerciseId === step.exerciseId && done.has(i - 1)) return;
    out.push(step.exerciseId);
  });
  return out;
}
