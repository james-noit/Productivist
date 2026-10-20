import type { ExerciseDef } from '../../../types/sportask';
import type { GenerationContext } from './context';

export function isOwned(ctx: Pick<GenerationContext, 'equipment'>, equipmentId: string): boolean {
  return ctx.equipment[equipmentId]?.owned === true;
}

/** Whether the exercise can be done with the effective equipment and constraints (PLAN section 8.2). space/wall/chair are hints only. */
export function available(ex: ExerciseDef, ctx: Pick<GenerationContext, 'equipment' | 'constraints'>): boolean {
  if (ex.retired) return false;
  if (ex.needsOneOf.length > 0 && !ex.needsOneOf.some((id) => isOwned(ctx, id))) return false;
  if (ctx.constraints.lowImpact && ex.impact === 'high') return false;
  if (ctx.constraints.noFloor && ex.floor) return false;
  return true;
}

/** Owned weights (kg, ascending, unique) the exercise can be loaded with. */
export function ownedWeights(ex: ExerciseDef, ctx: Pick<GenerationContext, 'equipment'>): number[] {
  if (!ex.loadable) return [];
  const weights = new Set<number>();
  for (const id of ex.needsOneOf) {
    const item = ctx.equipment[id];
    if (item?.owned && item.weightsKg) for (const w of item.weightsKg) if (w > 0) weights.add(w);
  }
  return [...weights].sort((a, b) => a - b);
}
