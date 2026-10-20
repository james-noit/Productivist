import type { BlockStep, ExerciseDef, Level } from '../../../types/sportask';
import { type BlockGenerator, type GenerationContext, type ProgressionModel, defineGoal } from '../engine/context';
import { available } from '../engine/filter';
import { fillRemainder, finalizePlan, mobilityTail, slotWorkFor, slotsFor, slotSteps } from '../engine/fit';
import { pickExercise } from '../engine/select';

export interface CaloriesParams {
  warmup?: boolean;
  work: number;
  rest: number;                                  // interval seconds
  allowHighImpact: boolean;
  maxLevel: Level;
  longFormat: 'circuit' | 'tabata' | 'emom';     // for blocks >= 240 s
  /** With longFormat 'tabata': blocks at least this long use EMOM instead (CONTENT.md: tabata from 240 s, emom from 600 s). */
  emomFromSeconds?: number;
  weeklyActiveMinutes: number;                   // the target line of `activeMinutes`
}

type BodyClass = 'lower' | 'full' | 'upper';
const CLASS_ORDER: BodyClass[] = ['lower', 'full', 'upper'];
const LOWER = new Set(['airSquat', 'reverseLunge', 'skaterStep', 'skaterHop', 'jumpSquat', 'marchInPlace', 'highKneeMarch', 'highKnees', 'ballSquatReach', 'jumpRopeBasic', 'jumpRopeAlternate']);
const UPPER = new Set(['shadowBoxing', 'pushUp', 'bandThruster']);

/** Lower body / full body / upper body, to spread fatigue (CONTENT.md section 7.3). Unlisted exercises count as full body. */
export function bodyClass(ex: ExerciseDef): BodyClass {
  if (LOWER.has(ex.id)) return 'lower';
  if (UPPER.has(ex.id)) return 'upper';
  return 'full';
}

const TABATA_WORK = 20;
const TABATA_REST = 10;
const TABATA_INTERVALS = 8;
const TABATA_SECONDS = TABATA_INTERVALS * TABATA_WORK + (TABATA_INTERVALS - 1) * TABATA_REST;

function pool(ctx: GenerationContext, p: CaloriesParams): ExerciseDef[] {
  const maxLevel = p.warmup ? Math.min(p.maxLevel, 2) : p.maxLevel;
  return ctx.catalog.exercises.all.filter(
    (e) => e.tags.includes('calories') && e.pattern !== 'mobility' && e.level <= maxLevel && available(e, ctx) && (e.impact !== 'high' || (p.allowHighImpact && !p.warmup)),
  );
}

function lastClass(ctx: GenerationContext): BodyClass | null {
  for (let i = ctx.todayBlocks.length - 1; i >= 0; i--) {
    const steps = ctx.todayBlocks[i]!.steps;
    for (let j = steps.length - 1; j >= 0; j--) {
      const ex = ctx.catalog.exercises.get(steps[j]!.exerciseId);
      if (ex?.tags.includes('calories') && ex.pattern !== 'mobility') return bodyClass(ex);
    }
  }
  return null;
}

/** `count` exercises alternating the body classes, never the same one twice in a row, none repeated while there is a choice. */
function pickSequence(ctx: GenerationContext, candidates: ExerciseDef[], count: number, startAfter: BodyClass | null): ExerciseDef[] {
  const out: ExerciseDef[] = [];
  let cls = startAfter ? (CLASS_ORDER.indexOf(startAfter) + 1) % 3 : 0;
  for (let i = 0; i < count; i++) {
    const picked = new Set(out.map((e) => e.id));
    const last = out[out.length - 1];
    let fresh = candidates.filter((e) => !picked.has(e.id));
    if (fresh.length === 0) fresh = candidates.filter((e) => e.id !== last?.id);
    if (fresh.length === 0) fresh = candidates;
    let ex: ExerciseDef | null = null;
    for (let t = 0; t < 3 && !ex; t++) {
      const wanted = CLASS_ORDER[(cls + t) % 3]!;
      ex = pickExercise(fresh.filter((e) => bodyClass(e) === wanted), ctx);
      if (ex) cls = (cls + t) % 3;
    }
    if (!ex) break;
    out.push(ex);
    cls = (cls + 1) % 3;
  }
  return out;
}

const generator: BlockGenerator<CaloriesParams> = {
  id: 'calories',
  generate(ctx, p) {
    const sizing = slotsFor(ctx.blockSeconds, 'calories');
    const kind = p.warmup ? 'warmup' : 'train';
    const candidates = pool(ctx, p);
    if (candidates.length === 0) return finalizePlan(kind, sizing.prep, [], ctx.blockSeconds);
    const work = p.warmup ? Math.max(10, Math.floor(p.work * 0.7)) : p.work;
    const rest = p.rest;
    const avail = ctx.blockSeconds - sizing.prep - sizing.tail;
    const start = lastClass(ctx);
    const steps: BlockStep[] = [];
    const usedIds: string[] = [];

    const emomAt = p.longFormat === 'tabata' ? p.emomFromSeconds : p.longFormat === 'emom' ? 0 : undefined;
    const format =
      ctx.blockSeconds < 240
        ? 'intervals'
        : emomAt !== undefined && ctx.blockSeconds >= emomAt && Math.floor(avail / 60) >= 2
          ? 'emom'
          : p.longFormat === 'tabata' && avail >= TABATA_SECONDS
            ? 'tabata'
            : 'circuit';

    if (format === 'intervals') {
      const w = Math.max(1, Math.min(work, avail));
      const n = Math.max(1, Math.floor((avail + rest) / (w + rest)));
      const picks = pickSequence(ctx, candidates, n, start);
      picks.forEach((ex, i) => {
        usedIds.push(ex.id);
        steps.push(...slotSteps({ ex, work: w, rest: i < picks.length - 1 ? rest : 0, fixed: true }));
      });
    } else if (format === 'tabata') {
      const picks = pickSequence(ctx, candidates, 2, start);
      for (let i = 0; i < TABATA_INTERVALS; i++) {
        const ex = picks[i % picks.length]!;
        steps.push(...slotSteps({ ex, work: TABATA_WORK, rest: TABATA_REST, fixed: true, round: Math.floor(i / picks.length) + 1 }));
      }
      usedIds.push(...picks.map((e) => e.id));
      const walk = Math.min(avail - TABATA_INTERVALS * (TABATA_WORK + TABATA_REST), 120);
      const march = ctx.catalog.exercises.get('marchInPlace');
      if (march && available(march, ctx) && walk >= 20) steps.push(...slotSteps({ ex: march, work: walk, rest: 0, fixed: true }));
    } else if (format === 'emom') {
      const minutes = Math.floor(avail / 60);
      const k = Math.min(3, minutes);
      const picks = pickSequence(ctx, candidates, k, start);
      usedIds.push(...picks.map((e) => e.id));
      for (let i = 0; i < minutes; i++) {
        const ex = picks[i % picks.length]!;
        const seconds = Math.min(55, work);
        const target = ex.metric === 'seconds' ? { seconds } : { reps: ex.dose.reps ?? 8 };
        const made = slotSteps({ ex, target, work: 55, rest: 0, round: Math.floor(i / picks.length) + 1 });
        const sum = made.reduce((t, s) => t + s.workSeconds, 0);
        made[made.length - 1]!.restSeconds = Math.max(0, 60 - sum);
        steps.push(...made);
      }
    } else {
      // As many intervals as fit, cycling through the circuit; the last round may be partial.
      const total = Math.max(1, Math.floor((avail + rest) / (work + rest)));
      const k = Math.min(total, total >= 10 ? 5 : total >= 8 ? 4 : 3);
      const picks = pickSequence(ctx, candidates, k, start);
      usedIds.push(...picks.map((e) => e.id));
      const w = Math.max(1, Math.min(work, slotWorkFor(avail, total, rest)));
      for (let i = 0; i < total; i++) {
        steps.push(...slotSteps({ ex: picks[i % picks.length]!, work: w, rest: i < total - 1 ? rest : 0, fixed: true, ...(total > picks.length ? { round: Math.floor(i / picks.length) + 1 } : {}) }));
      }
    }
    steps.push(...mobilityTail(ctx, sizing.tail, usedIds, (e) => e.pattern === 'mobility'));
    fillRemainder(ctx, steps, sizing.prep, usedIds, (e) => e.pattern === 'mobility');
    return finalizePlan(kind, sizing.prep, steps, ctx.blockSeconds);
  },
};

const progression: ProgressionModel<CaloriesParams> = {
  id: 'intervals',
  levels: () => new Map(),
  dose: (ex) => ({ target: { ...ex.dose } }),
};

const w = (en: string, es: string) => ({ en, es });

export const CALORIES_GOAL = defineGoal<CaloriesParams>({
  id: 'calories',
  tag: 'calories',
  name: w('Burn calories', 'Quemar calorías'),
  description: w('Work/rest intervals that raise your heart rate, from low-impact marching to tabata and EMOM.', 'Intervalos de trabajo y descanso que suben el pulso, desde marcha sin impacto hasta tabata y EMOM.'),
  icon: 'flag',
  programs: [
    {
      id: 'burnAndMove',
      name: w('Burn & move', 'Quema y muévete'),
      summary: w('Six weeks of interval blocks that build up your active minutes, with a cardio test in weeks 1 and 4.', 'Seis semanas de bloques de intervalos que suben tus minutos activos, con un test de cardio en las semanas 1 y 4.'),
      weeks: 6,
      daysPerWeek: 6,
      assessmentWeeks: [1, 4],
      assessmentIds: ['calCardio60'],
      phases: [
        { fromWeek: 1, toWeek: 2, params: { work: 20, rest: 40, allowHighImpact: false, maxLevel: 2, longFormat: 'circuit', weeklyActiveMinutes: 45 }, note: w('A pace that lets you speak in short sentences.', 'Ritmo que te permita hablar a frases cortas.') },
        { fromWeek: 3, toWeek: 4, params: { work: 30, rest: 30, allowHighImpact: true, maxLevel: 3, longFormat: 'circuit', weeklyActiveMinutes: 60 }, note: w('Raise the intensity in the work; walk in the rest.', 'Sube la intensidad en el trabajo; camina en el descanso.') },
        { fromWeek: 5, toWeek: 6, params: { work: 40, rest: 20, allowHighImpact: true, maxLevel: 4, longFormat: 'tabata', emomFromSeconds: 600, weeklyActiveMinutes: 75 }, note: w('Intense but controlled.', 'Intenso pero controlado.') },
      ],
    },
  ],
  generator,
  progression,
  metricIds: ['activeMinutes', 'netKcal', 'density', 'assessment:calCardio60', 'adherence'],
  restDayGoalId: 'mobility',
});
