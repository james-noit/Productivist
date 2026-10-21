import type { BodyZone, ExerciseDef, Level } from '../../../types/sportask';
import type { GenerationContext } from './context';

export interface PickOptions {
  avoidIds?: Iterable<string>;
  preferZones?: readonly BodyZone[];
  maxLevel?: Level;
}

function exerciseIds(blocks: readonly { steps: readonly { exerciseId: string }[] }[]): Set<string> {
  const ids = new Set<string>();
  for (const b of blocks) for (const s of b.steps) ids.add(s.exerciseId);
  return ids;
}

/**
 * Weighted pick (PLAN section 8.2): 1, x0.2 if used in the last 3 blocks, x0.5 if used today, x1.5 if it covers a preferred zone,
 * x1.2 if it needs owned equipment. `avoidIds` and `maxLevel` are dropped (in that order) rather than leaving nothing to pick.
 * Deterministic for a given `ctx.rng` state and candidate order. Returns null only for an empty candidate list.
 */
export function pickExercise(candidates: readonly ExerciseDef[], ctx: GenerationContext, opts: PickOptions = {}): ExerciseDef | null {
  let pool = candidates;
  if (opts.maxLevel !== undefined) {
    const limited = pool.filter((e) => e.level <= opts.maxLevel!);
    if (limited.length > 0) pool = limited;
  }
  if (opts.avoidIds) {
    const avoid = new Set(opts.avoidIds);
    const kept = pool.filter((e) => !avoid.has(e.id));
    if (kept.length > 0) pool = kept;
  }
  if (pool.length === 0) return null;
  const recent = exerciseIds(ctx.history.slice(-3));
  const today = exerciseIds(ctx.todayBlocks);
  const zones = opts.preferZones ?? [];
  const weights = pool.map((e) => {
    let w = 1;
    if (recent.has(e.id)) w *= 0.2;
    if (today.has(e.id)) w *= 0.5;
    if (zones.length > 0 && e.zones?.some((z) => zones.includes(z))) w *= 1.5;
    if (e.needsOneOf.length > 0) w *= 1.2;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = ctx.rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r < 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}
