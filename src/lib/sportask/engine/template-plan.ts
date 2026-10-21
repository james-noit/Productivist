import type { BlockPlan, BlockStep, Dose, ExerciseDef, SportTemplate, TemplateSlot } from '../../../types/sportask';
import type { GenerationContext } from './context';
import { available } from './filter';
import { MIN_STEP_SECONDS, fillRemainder, finalizePlan, fitsWindow, repWork, slotWorkFor, slotsFor, slotSteps } from './fit';
import { pickExercise } from './select';

export interface ResolvedSlot {
  ex: ExerciseDef;
  dose?: Dose;
}

function patternCandidates(slot: Extract<TemplateSlot, { pattern: string }>, ctx: GenerationContext): ExerciseDef[] {
  return ctx.catalog.exercises.all.filter(
    (e) =>
      e.pattern === slot.pattern &&
      (!slot.tag || e.tags.includes(slot.tag)) &&
      (!slot.zone || e.zones?.includes(slot.zone)) &&
      (slot.maxLevel === undefined || e.level <= slot.maxLevel) &&
      available(e, ctx),
  );
}

/** An available exercise of the same pattern, as close in level (and zones) as possible. */
function equivalents(ex: ExerciseDef, ctx: GenerationContext): ExerciseDef[] {
  let list = ctx.catalog.exercises.all.filter((e) => e.id !== ex.id && e.pattern === ex.pattern && available(e, ctx));
  if (ex.zones && list.some((e) => e.zones?.some((z) => ex.zones!.includes(z)))) list = list.filter((e) => e.zones?.some((z) => ex.zones!.includes(z)));
  const sameTag = list.filter((e) => e.tags.some((t) => ex.tags.includes(t)));
  if (sameTag.length > 0) list = sameTag;
  if (list.length === 0) return list;
  const best = Math.min(...list.map((e) => Math.abs(e.level - ex.level)));
  return list.filter((e) => Math.abs(e.level - ex.level) === best);
}

/** Candidates for one slot: the fixed exercise if available, otherwise its equivalents; for a pattern slot, everything that matches. */
function candidatesFor(slot: TemplateSlot, ctx: GenerationContext): ExerciseDef[] {
  if ('exerciseId' in slot) {
    const ex = ctx.catalog.exercises.get(slot.exerciseId);
    if (!ex) return [];
    return available(ex, ctx) ? [ex] : equivalents(ex, ctx);
  }
  return patternCandidates(slot, ctx);
}

/** How many slots resolve to something doable. A template is offered as unavailable only when fewer than half do. */
export function templateAvailability(t: SportTemplate, ctx: GenerationContext): { resolved: number; total: number; available: boolean } {
  const total = t.slots.length;
  const resolved = t.slots.filter((s) => candidatesFor(s, ctx).length > 0).length;
  return { resolved, total, available: total > 0 && resolved * 2 >= total };
}

export function resolveSlots(t: SportTemplate, ctx: GenerationContext): ResolvedSlot[] {
  const out: ResolvedSlot[] = [];
  const used = new Set<string>();
  for (const slot of t.slots) {
    const ex = pickExercise(candidatesFor(slot, ctx), ctx, { avoidIds: used });
    if (!ex) continue;
    used.add(ex.id);
    const dose = 'exerciseId' in slot ? slot.dose : undefined;
    out.push(dose ? { ex, dose } : { ex });
  }
  return out;
}

function need(r: ResolvedSlot): number {
  const dose = r.dose ?? r.ex.dose;
  const one = dose.seconds !== undefined ? dose.seconds : repWork(r.ex, dose.reps ?? 1);
  return one * (r.ex.perSide ? 2 : 1);
}


/** Plans a free-training block from a template (PLAN section 8.5). Returns a plan with no steps when no slot resolves. */
export function planFromTemplate(t: SportTemplate, ctx: GenerationContext): BlockPlan {
  const slots = resolveSlots(t, ctx);
  const prep = slotsFor(ctx.blockSeconds, 'strength').prep;
  if (slots.length === 0) return finalizePlan('train', prep, [], ctx.blockSeconds);
  const avail = ctx.blockSeconds - prep;
  const steps: BlockStep[] = [];
  const n = slots.length;

  if (t.format === 'intervals') {
    const work = t.workSeconds ?? 30;
    const rest = t.restSeconds ?? 30;
    const w = Math.max(1, Math.min(Math.max(work, MIN_STEP_SECONDS), avail));
    const count = Math.max(1, Math.floor((avail + rest) / (w + rest)));
    for (let i = 0; i < count; i++) {
      const { ex } = slots[i % n]!;
      const visit = Math.floor(i / n);
      steps.push(
        ...slotSteps({
          ex,
          work: w,
          rest: i < count - 1 ? rest : 0,
          fixed: true,
          ...(ex.perSide ? { sideOverride: visit % 2 === 0 ? ('left' as const) : ('right' as const) } : {}),
          ...(count > n ? { round: visit + 1 } : {}),
        }),
      );
    }
  } else if (t.format === 'emom' && ctx.blockSeconds >= 120) {
    const minutes = Math.max(1, Math.floor(avail / 60));
    for (let i = 0; i < minutes; i++) {
      const { ex, dose } = slots[i % n]!;
      const d = dose ?? ex.dose;
      const target: Dose = d.seconds !== undefined ? { seconds: Math.min(d.seconds, 55) } : d;
      const made = slotSteps({ ex, target, work: 55, rest: 0, ...(minutes > n ? { round: Math.floor(i / n) + 1 } : {}) });
      const sum = made.reduce((s, x) => s + x.workSeconds, 0);
      made[made.length - 1]!.restSeconds = Math.max(0, 60 - sum);
      steps.push(...made);
    }
  } else {
    const rest = 5;
    const typical = slots.reduce((s, r) => s + need(r), 0) + rest * (n - 1);
    const rounds = Math.max(1, Math.min(3, Math.floor(avail / Math.max(1, typical))));
    let list = slots;
    let r = rounds;
    // Fewer rounds, then fewer slots, until every kept slot is sensible in its window (>= 15 s per side, >= 3 reps).
    for (;;) {
      const w = slotWorkFor(avail, list.length * r, rest);
      const ok = list.filter((x) => fitsWindow(x.ex, w));
      if (ok.length === list.length && w >= MIN_STEP_SECONDS) break;
      if (r > 1) r -= 1;
      else if (ok.length > 0 && ok.length < list.length) list = ok;
      else if (list.length > 1) list = list.slice(0, -1);
      else break;
    }
    const window = slotWorkFor(avail, list.length * r, rest);
    list = list.filter((x) => fitsWindow(x.ex, window));
    if (list.length === 0) return finalizePlan('train', prep, [], ctx.blockSeconds);
    const oneRound = (round: number | undefined): BlockStep[] =>
      list.flatMap(({ ex, dose }) => slotSteps({ ex, ...(dose ? { target: dose } : {}), work: Math.max(1, window), rest, ...(round !== undefined ? { round } : {}) }));
    for (let round = 1; round <= r; round++) steps.push(...oneRound(r > 1 ? round : undefined));
    // Rep-based steps are shorter than their window, so the rounds can leave minutes unused: repeat the template's slots while
    // another whole round fits (the rounds are then numbered), and let the generic fill below take what is left.
    const roundTime = oneRound(undefined).reduce((t, x, i, all) => t + x.workSeconds + (i < all.length - 1 ? x.restSeconds : 0), 0);
    const spent = (): number => prep + steps.reduce((t, x, i) => t + x.workSeconds + (i < steps.length - 1 ? x.restSeconds : 0), 0);
    let round = r;
    while (spent() + rest + roundTime <= ctx.blockSeconds && round < 30) {
      round += 1;
      if (round === 2) for (const x of steps) x.round = 1;
      steps.push(...oneRound(round));
    }
  }
  // Whatever is still unused and is at least MIN_FILL_SECONDS becomes a few mobility holds instead of a long last rest (PLAN 8.2).
  fillRemainder(ctx, steps, prep, steps.map((x) => x.exerciseId));
  return finalizePlan('train', prep, steps, ctx.blockSeconds);
}
