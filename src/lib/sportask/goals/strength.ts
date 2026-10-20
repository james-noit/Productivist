import type { BlockStep, ExerciseDef, MovementPattern } from '../../../types/sportask';
import { type BlockGenerator, type GenerationContext, defineGoal } from '../engine/context';
import { fillRemainder, finalizePlan, mobilityTail, scaleDose, slotWorkFor, slotsFor, slotSteps } from '../engine/fit';
import { LADDER_PROGRESSION, ladderDose, ladderStates, usableAlternatives } from '../engine/progression';
import { pickExercise } from '../engine/select';

export interface StrengthParams {
  warmup?: boolean;
  repRange: { min: number; max: number };
  holdRange: { min: number; max: number };      // for seconds-metric exercises (planks, wall sit)
  restSeconds: number;                           // between sets inside a block
  setsPerPatternPerDay: number;                  // target
  capPerPatternPerDay: number;                   // hard cap
  tempoFactor: number;                           // multiplies secondsPerRep (slow eccentrics)
  patterns: MovementPattern[];                   // rotation order
  rir: number;                                   // shown as "Para a falta de N repeticiones"
}

export const STRENGTH_GOAL_ID = 'strength';

/** Sets of each pattern done today in the goal's blocks. A per-side pair counts once (its right step adds nothing). */
export function setsToday(ctx: GenerationContext): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of ctx.todayBlocks) {
    if (b.origin !== 'goal' || b.goalId !== STRENGTH_GOAL_ID || b.kind === 'test') continue;
    b.steps.forEach((s, i) => {
      if (s.side === 'right') return;
      if (b.results.find((r) => r.stepIndex === i)?.done !== true) return;
      const pattern = ctx.catalog.exercises.get(s.exerciseId)?.pattern;
      if (pattern) out.set(pattern, (out.get(pattern) ?? 0) + 1);
    });
  }
  return out;
}

/** The pattern of the last strength set of the previous block (the mobility finish does not count). */
function previousPattern(ctx: GenerationContext, patterns: readonly MovementPattern[]): string | undefined {
  const last = ctx.todayBlocks[ctx.todayBlocks.length - 1];
  for (let i = (last?.steps.length ?? 0) - 1; i >= 0; i--) {
    const pattern = ctx.catalog.exercises.get(last!.steps[i]!.exerciseId)?.pattern;
    if (pattern && patterns.includes(pattern)) return pattern;
  }
  return undefined;
}

const MOBILITY_ONLY = (e: ExerciseDef): boolean => e.pattern === 'mobility';

/** Warm-up: one rung below the current one (not below 0), only level <= 2 moves. */
function warmupAlternatives(ladderId: string, rung: number, ctx: GenerationContext): ExerciseDef[] {
  const ladder = ctx.catalog.ladders.get(ladderId)!;
  for (let r = Math.max(0, rung - 1); r >= 0; r--) {
    const alts = usableAlternatives(ladder, r, ctx).filter((e) => e.level <= 2);
    if (alts.length > 0) return alts;
  }
  return [];
}

const generator: BlockGenerator<StrengthParams> = {
  id: 'strength',
  generate(ctx, p) {
    const warm = p.warmup === true;
    const sizing = slotsFor(ctx.blockSeconds, 'strength');
    const states = ladderStates(ctx, p);
    const done = setsToday(ctx);
    const prev = previousPattern(ctx, p.patterns);
    const prevIndex = prev ? p.patterns.indexOf(prev as MovementPattern) : -1;
    const n = p.patterns.length;

    type Option = { pattern: MovementPattern; remaining: number; deficit: number; rotation: number; alts: ExerciseDef[] };
    const options: Option[] = [];
    p.patterns.forEach((pattern, index) => {
      const state = states.get(pattern);
      if (!state) return;
      const doneSets = done.get(pattern) ?? 0;
      const remaining = p.capPerPatternPerDay - doneSets;
      if (remaining < 1) return;
      const alts = warm ? warmupAlternatives(pattern, state.rung, ctx) : usableAlternatives(ctx.catalog.ladders.get(pattern)!, state.rung, ctx);
      if (alts.length === 0) return;
      options.push({ pattern, remaining, deficit: p.setsPerPatternPerDay - doneSets, rotation: (index - prevIndex - 1 + n * 2) % n, alts });
    });
    options.sort((a, b) => b.deficit - a.deficit || a.rotation - b.rotation);
    const fresh = options.filter((o) => o.pattern !== prev);
    let pool = fresh.length > 0 ? fresh : options;

    let slots = Math.min(sizing.slots, pool.length);
    pool = pool.slice(0, slots);
    let rounds = pool.length < 2 ? 1 : Math.max(1, Math.min(sizing.rounds, ...pool.map((o) => o.remaining)));

    const avail = ctx.blockSeconds - sizing.prep - sizing.tail;
    let rest = p.restSeconds;
    let window = slotWorkFor(avail, slots * rounds, rest);
    while (window < 20 && rest > 5) {
      rest -= 5;
      window = slotWorkFor(avail, slots * rounds, rest);
    }
    while (window < 20 && rounds > 1) {
      rounds -= 1;
      window = slotWorkFor(avail, slots * rounds, rest);
    }
    while (window < 20 && slots > 1) {
      slots -= 1;
      pool = pool.slice(0, slots);
      window = slotWorkFor(avail, slots * rounds, rest);
    }

    const kind = warm ? 'warmup' : 'train';
    if (pool.length === 0) return finalizePlan(kind, sizing.prep, [], ctx.blockSeconds);

    const picked = pool.map((o) => {
      const ex = pickExercise(o.alts, ctx)!;
      const d = ladderDose(ex, ctx, p);
      return { ex, target: warm ? scaleDose(d.target, 0.7) : d.target, loadKg: d.loadKg };
    });
    const steps: BlockStep[] = [];
    for (let r = 1; r <= rounds; r++) {
      for (const it of picked) {
        steps.push(...slotSteps({ ex: it.ex, target: it.target, ...(it.loadKg !== undefined ? { loadKg: it.loadKg } : {}), work: Math.max(1, window), rest, tempo: p.tempoFactor, ...(rounds > 1 ? { round: r } : {}) }));
      }
    }
    steps.push(...mobilityTail(ctx, sizing.tail, picked.map((it) => it.ex.id), MOBILITY_ONLY));
    fillRemainder(ctx, steps, sizing.prep, picked.map((it) => it.ex.id), MOBILITY_ONLY);
    return finalizePlan(kind, sizing.prep, steps, ctx.blockSeconds);
  },
};

const BASE: MovementPattern[] = ['push', 'squat', 'pull', 'hinge', 'core', 'lunge'];
const WITH_VERTICAL: MovementPattern[] = ['push', 'pushVertical', 'squat', 'pull', 'hinge', 'core', 'lunge'];
const w = (en: string, es: string) => ({ en, es });

export const STRENGTH_GOAL = defineGoal<StrengthParams>({
  id: STRENGTH_GOAL_ID,
  tag: 'strength',
  name: w('Full-body strength', 'Fuerza de cuerpo completo'),
  description: w('Push, pull, squat, hinge, core and lunge in short sets, moving up a variant when you are ready.', 'Empuje, tirón, sentadilla, bisagra, core y zancada en series cortas, subiendo de variante cuando estés listo.'),
  icon: 'flag',
  programs: [
    {
      id: 'microStrength',
      name: w('Micro-strength', 'Fuerza en micro-bloques'),
      summary: w('Six weeks of short strength sets across the day, with tests in weeks 1 and 4.', 'Seis semanas de series de fuerza breves repartidas por el día, con tests en las semanas 1 y 4.'),
      weeks: 6,
      daysPerWeek: 5,
      assessmentWeeks: [1, 4],
      assessmentIds: ['strMaxPushUps', 'strPlank', 'strSquats60'],
      phases: [
        {
          fromWeek: 1, toWeek: 2,
          params: { repRange: { min: 8, max: 12 }, holdRange: { min: 20, max: 40 }, restSeconds: 30, setsPerPatternPerDay: 2, capPerPatternPerDay: 4, tempoFactor: 1.0, patterns: BASE, rir: 3 },
          note: w('Technique first.', 'Técnica primero.'),
        },
        {
          fromWeek: 3, toWeek: 4,
          params: { repRange: { min: 6, max: 10 }, holdRange: { min: 30, max: 50 }, restSeconds: 40, setsPerPatternPerDay: 3, capPerPatternPerDay: 5, tempoFactor: 1.0, patterns: WITH_VERTICAL, rir: 2 },
          note: w('Move up a variant when you complete the range.', 'Sube de variante cuando completes el rango.'),
        },
        {
          fromWeek: 5, toWeek: 6,
          params: { repRange: { min: 6, max: 10 }, holdRange: { min: 40, max: 60 }, restSeconds: 40, setsPerPatternPerDay: 3, capPerPatternPerDay: 5, tempoFactor: 1.6, patterns: WITH_VERTICAL, rir: 2 },
          note: w('Lower for 3 seconds, rise with control.', 'Baja en 3 segundos, sube con control.'),
        },
      ],
    },
  ],
  generator,
  progression: LADDER_PROGRESSION,
  metricIds: ['setsPerPattern', 'ladderLevel', 'assessment:strMaxPushUps', 'assessment:strPlank', 'assessment:strSquats60', 'adherence'],
  restDayGoalId: 'mobility',
});
