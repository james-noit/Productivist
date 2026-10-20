import type { SportBlock } from '../../types/sportask';
import type { Catalog } from './engine/context';

/** Work seconds of the steps the user marked done. Rest is not counted. */
export function workSecondsDone(block: Pick<SportBlock, 'steps' | 'results'>): number {
  let total = 0;
  block.steps.forEach((step, i) => {
    if (block.results.some((r) => r.stepIndex === i && r.done)) total += step.workSeconds;
  });
  return total;
}

/**
 * Estimated net kcal: (MET - 1) x kg x hours of work. 0 without a body weight. Always an estimate: the UI says "approx.".
 */
export function netKcal(block: Pick<SportBlock, 'steps' | 'results'>, catalog: Catalog, kg: number | null | undefined): number {
  if (!kg || !Number.isFinite(kg) || kg <= 0) return 0;
  let kcal = 0;
  block.steps.forEach((step, i) => {
    if (!block.results.some((r) => r.stepIndex === i && r.done)) return;
    const met = catalog.exercises.get(step.exerciseId)?.met;
    if (!met || met <= 1) return;
    kcal += (met - 1) * kg * (step.workSeconds / 3600);
  });
  return kcal;
}
