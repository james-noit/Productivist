import { diffDays } from '../../dates';
import type { Dose, ExerciseDef, LadderDef, SportBlock } from '../../../types/sportask';
import { desiredRung } from '../profile';
import { effortOf } from './adapt';
import type { AssessmentDef, Catalog, GenerationContext, ProgressionModel } from './context';
import { available, ownedWeights } from './filter';

/** What the ladder progression reads from a phase's parameters. */
export interface LadderParams {
  repRange: { min: number; max: number };
  holdRange: { min: number; max: number };
}

export interface LadderState {
  rung: number;
  /** The rung the replay started on (the level, or the profile's baseline), for the weekly objectives. */
  from: number;
  /** Lowest value recorded in the last block that worked this rung (reset on a rung or load change). */
  lastValue?: number;
  lastLoad?: number;
  successes: number;
  failures: number;
}

interface Where {
  ladderId: string;
  rung: number;
}

const whereCache = new WeakMap<Catalog, Map<string, Where>>();

/** exercise id -> the ladder rung it sits on. */
export function ladderIndex(catalog: Catalog): Map<string, Where> {
  let map = whereCache.get(catalog);
  if (!map) {
    map = new Map();
    for (const ladder of catalog.ladders.all) ladder.rungs.forEach((alts, rung) => alts.forEach((id) => map!.set(id, { ladderId: ladder.id, rung })));
    whereCache.set(catalog, map);
  }
  return map;
}

/** The alternatives of a rung that the context allows. */
export function usableAlternatives(ladder: LadderDef, rung: number, ctx: GenerationContext): ExerciseDef[] {
  const out: ExerciseDef[] = [];
  for (const id of ladder.rungs[rung] ?? []) {
    const ex = ctx.catalog.exercises.get(id);
    if (ex && available(ex, ctx)) out.push(ex);
  }
  return out;
}

export function isRungUsable(ladder: LadderDef, rung: number, ctx: GenerationContext): boolean {
  return usableAlternatives(ladder, rung, ctx).length > 0;
}

/** The nearest usable rung strictly above/below `from`, or -1. */
export function nextUsable(ladder: LadderDef, from: number, dir: 1 | -1, ctx: GenerationContext): number {
  for (let r = from + dir; r >= 0 && r < ladder.rungs.length; r += dir) if (isRungUsable(ladder, r, ctx)) return r;
  return -1;
}

/** `rung` if usable, else the nearest usable one below, else above; -1 when the ladder has nothing usable at all. */
export function settleRung(ladder: LadderDef, rung: number, ctx: GenerationContext): number {
  const r = Math.max(0, Math.min(ladder.rungs.length - 1, rung));
  if (isRungUsable(ladder, r, ctx)) return r;
  const down = nextUsable(ladder, r, -1, ctx);
  return down >= 0 ? down : nextUsable(ladder, r, 1, ctx);
}

/**
 * The usable rung a ladder starts on: from the profile's baseline when it measured this movement (or one it follows), otherwise from
 * the program level (1 -> rung 0, 2 -> 1, 3 -> 2) tempered by how active the user is (`profile.ts`).
 */
export function startRung(ladder: LadderDef, ctx: GenerationContext): number {
  return settleRung(ladder, desiredRung(ladder.id, ctx.enrolment?.level ?? 1, ctx.profile), ctx);
}

/** Days away after which the dose starts again from the bottom of the range, and after which a rung (or two) is given back. */
export const RESET_AFTER_DAYS = 14;
export const STEP_BACK_AFTER_DAYS = 21;
export const STEP_BACK_TWO_AFTER_DAYS = 56;

/** A long absence (PLAN 0.25): the dose restarts at the bottom of the range, and a rung (two after eight weeks) is given back. */
function applyAbsence(states: Map<string, LadderState>, gapDays: number, ctx: GenerationContext): void {
  if (gapDays < RESET_AFTER_DAYS) return;
  const back = gapDays >= STEP_BACK_TWO_AFTER_DAYS ? 2 : gapDays >= STEP_BACK_AFTER_DAYS ? 1 : 0;
  for (const [id, state] of states) {
    state.successes = 0;
    state.failures = 0;
    state.lastValue = undefined;
    const ladder = ctx.catalog.ladders.get(id);
    if (!ladder) continue;
    for (let i = 0; i < back; i++) {
      const down = nextUsable(ladder, state.rung, -1, ctx);
      if (down < 0) break;
      state.rung = down;
      state.lastLoad = undefined;
    }
  }
}

function rangeOf(ex: ExerciseDef, params: LadderParams): { min: number; max: number } {
  return ex.metric === 'seconds' ? params.holdRange : params.repRange;
}

function resultFor(block: SportBlock, index: number) {
  return block.results.find((r) => r.stepIndex === index);
}

/** Replays the goal's history into the current state of every ladder (PLAN section 8.3). Pure; needs no stored state. */
export function replayLadders(ctx: GenerationContext, params: LadderParams): Map<string, LadderState> {
  const states = new Map<string, LadderState>();
  for (const ladder of ctx.catalog.ladders.all) {
    const rung = startRung(ladder, ctx);
    if (rung >= 0) states.set(ladder.id, { rung, from: rung, successes: 0, failures: 0 });
  }
  const goalId = ctx.enrolment?.goalId;
  if (!goalId) return states;
  const where = ladderIndex(ctx.catalog);
  const blocks = ctx.history
    .filter((b) => b.origin === 'goal' && b.goalId === goalId && (b.status === 'done' || b.status === 'partial') && b.kind !== 'warmup')
    .sort((a, b) => a.startedAt - b.startedAt);

  let lastDate: string | null = null;
  for (const block of blocks) {
    if (lastDate !== null) applyAbsence(states, diffDays(lastDate, block.date), ctx);
    lastDate = block.date;
    if (block.kind === 'test') {
      applyAssessment(block, ctx, params, states, where);
      continue;
    }
    const obs = new Map<string, { ex: ExerciseDef; value: number; load?: number }[]>();
    block.steps.forEach((step, i) => {
      const w = where.get(step.exerciseId);
      const ex = ctx.catalog.exercises.get(step.exerciseId);
      const r = resultFor(block, i);
      if (!w || !ex || !r || !r.done || r.value === undefined) return;
      const state = states.get(w.ladderId);
      if (!state || state.rung !== w.rung) return;
      const list = obs.get(w.ladderId) ?? [];
      const load = r.loadKg ?? step.loadKg;
      list.push(load !== undefined ? { ex, value: r.value, load } : { ex, value: r.value });
      obs.set(w.ladderId, list);
    });
    for (const [ladderId, list] of obs) {
      const ladder = ctx.catalog.ladders.get(ladderId)!;
      const state = states.get(ladderId)!;
      const range = rangeOf(list[0]!.ex, params);
      const values = list.map((o) => o.value);
      const effort = effortOf(block);
      const failure = values.some((v) => v < range.min) || effort === 1;
      const success = !failure && values.every((v) => v >= range.max);
      const extra = effort === -1 && !failure ? 1 : 0;
      if (failure) {
        state.failures += 1;
        state.successes = 0;
      } else if (success || extra) {
        state.successes += (success ? 1 : 0) + extra;
        state.failures = 0;
      } else {
        state.successes = 0;
        state.failures = 0;
      }
      state.lastValue = Math.min(...values);
      const loads = list.map((o) => o.load).filter((l): l is number => l !== undefined);
      if (loads.length > 0) state.lastLoad = Math.max(...loads);

      if (state.failures >= 2) {
        const down = nextUsable(ladder, state.rung, -1, ctx);
        state.failures = 0;
        if (down >= 0) moveTo(state, down);
      } else if (state.successes >= 2) {
        const loadedEx = list.find((o) => ownedWeights(o.ex, ctx).length > 0)?.ex;
        const heavier = loadedEx ? nextHeavier(ownedWeights(loadedEx, ctx), state.lastLoad) : undefined;
        if (heavier !== undefined) {
          state.lastLoad = heavier;
          state.lastValue = undefined;
          state.successes = 0;
        } else {
          const up = nextUsable(ladder, state.rung, 1, ctx);
          if (up >= 0) {
            moveTo(state, up);
            state.successes = 0;
          }
        }
      }
    }
  }
  // Still away today: the same absence rules apply to the block about to be made.
  if (lastDate !== null) applyAbsence(states, diffDays(lastDate, ctx.today), ctx);
  return states;
}

function moveTo(state: LadderState, rung: number): void {
  state.rung = rung;
  state.lastValue = undefined;
  state.lastLoad = undefined;
  state.successes = 0;
  state.failures = 0;
}

function nextHeavier(weights: number[], current: number | undefined): number | undefined {
  const base = current ?? weights[0];
  if (base === undefined) return undefined;
  return weights.find((w) => w > base);
}

/** An assessment above the rung's range max moves the user up one usable rung at once. */
function applyAssessment(
  block: SportBlock,
  ctx: GenerationContext,
  params: LadderParams,
  states: Map<string, LadderState>,
  where: Map<string, Where>,
): void {
  const def: AssessmentDef | undefined = block.assessmentId ? ctx.catalog.assessments.get(block.assessmentId) : undefined;
  if (!def?.ladderId) return;
  const ladder = ctx.catalog.ladders.get(def.ladderId);
  const state = states.get(def.ladderId);
  if (!ladder || !state) return;
  let best: number | undefined;
  block.steps.forEach((step, i) => {
    const w = where.get(step.exerciseId);
    const r = resultFor(block, i);
    if (!w || w.ladderId !== def.ladderId || w.rung !== state.rung || !r?.done || r.value === undefined) return;
    best = best === undefined ? r.value : Math.max(best, r.value);
  });
  if (best === undefined) return;
  const range = def.metric === 'seconds' ? params.holdRange : params.repRange;
  if (best > range.max) {
    const up = nextUsable(ladder, state.rung, 1, ctx);
    if (up >= 0) moveTo(state, up);
  } else if (best < range.min) {
    // A re-test is evidence both ways: a result below the range means the rung is too hard for now.
    const down = nextUsable(ladder, state.rung, -1, ctx);
    if (down >= 0) moveTo(state, down);
  }
}

const cache = new WeakMap<GenerationContext, { params: unknown; states: Map<string, LadderState> }>();

/** Replay memoised per context object (a context is immutable for the duration of one generation). */
export function ladderStates(ctx: GenerationContext, params: LadderParams): Map<string, LadderState> {
  const hit = cache.get(ctx);
  if (hit && hit.params === params) return hit.states;
  const states = replayLadders(ctx, params);
  cache.set(ctx, { params, states });
  return states;
}

/** The dose for an exercise at its ladder's current state: min of the range first, then last value + 1, up to the max (1.5 x at the top). */
export function ladderDose(ex: ExerciseDef, ctx: GenerationContext, params: LadderParams): { target: Dose; loadKg?: number } {
  const w = ladderIndex(ctx.catalog).get(ex.id);
  const state = w ? ladderStates(ctx, params).get(w.ladderId) : undefined;
  const ladder = w ? ctx.catalog.ladders.get(w.ladderId) : undefined;
  const range = rangeOf(ex, params);
  const atTop = !!(state && ladder && nextUsable(ladder, state.rung, 1, ctx) < 0);
  const cap = atTop ? Math.floor(range.max * 1.5) : range.max;
  const current = !!state && !!w && state.rung === w.rung;
  const last = current ? state!.lastValue : undefined;
  const value = last === undefined ? range.min : Math.max(range.min, Math.min(cap, last + 1));
  const target: Dose = ex.metric === 'seconds' ? { seconds: value } : { reps: value };
  const weights = ownedWeights(ex, ctx);
  if (weights.length === 0) return { target };
  const lastLoad = current ? state!.lastLoad : undefined;
  const loadKg = lastLoad === undefined ? weights[0]! : (weights.find((x) => x >= lastLoad) ?? weights[weights.length - 1]!);
  return { target, loadKg };
}

/** The shared strength progression (double progression on ladders). */
export const LADDER_PROGRESSION: ProgressionModel<LadderParams> = {
  id: 'ladder',
  levels(ctx, params) {
    const out = new Map<string, number>();
    for (const [id, s] of ladderStates(ctx, params)) out.set(id, s.rung);
    return out;
  },
  dose(ex, _rung, ctx, params) {
    return ladderDose(ex, ctx, params);
  },
};
