import { startOfWeek } from '../../dates';
import type { BlockStep, BodyZone, Dose, ExerciseDef, Level } from '../../../types/sportask';
import { type BlockGenerator, type GenerationContext, type ProgressionModel, defineGoal } from '../engine/context';
import { available } from '../engine/filter';
import { fillRemainder, finalizePlan, fitsWindow, scaleDose, slotWorkFor, slotsFor, slotSteps } from '../engine/fit';
import { weekdayIndex } from '../engine/schedule';
import { pickExercise } from '../engine/select';

export interface MobilityParams {
  warmup?: boolean;
  holdSeconds: number;
  repsScale: number;
  allowLoaded: boolean;
  maxLevel: Level;
}

type Focus = 'upper' | 'lower' | 'spine';
const FOCUS_ZONES: Record<Focus, BodyZone[]> = {
  upper: ['neck', 'shoulders', 'thoracic', 'wrists'],
  lower: ['hips', 'hamstrings', 'ankles'],
  spine: ['spine', 'thoracic', 'hips'],
};
/** Day focus by day index in the ISO week (Mon = 0): upper on 0 and 3, lower on 1 and 4, spine on 2, 5 and 6. */
const DAY_FOCUS: Focus[] = ['upper', 'lower', 'spine', 'upper', 'lower', 'spine', 'spine'];

export function focusFor(today: string): Focus {
  return DAY_FOCUS[weekdayIndex(today)]!;
}

function zoneCounts(ctx: GenerationContext): { today: Map<BodyZone, number>; week: Map<BodyZone, number> } {
  const today = new Map<BodyZone, number>();
  const week = new Map<BodyZone, number>();
  const monday = startOfWeek(ctx.today);
  const add = (map: Map<BodyZone, number>, steps: readonly BlockStep[]) => {
    for (const s of steps) {
      if (s.side === 'right') continue;
      for (const z of ctx.catalog.exercises.get(s.exerciseId)?.zones ?? []) map.set(z, (map.get(z) ?? 0) + 1);
    }
  };
  for (const b of ctx.todayBlocks) add(today, b.steps);
  for (const b of ctx.history) if (b.date >= monday && b.date <= ctx.today && b.date !== ctx.today) add(week, b.steps);
  return { today, week };
}

function holdOrReps(ex: ExerciseDef, p: MobilityParams): Dose {
  const factor = p.warmup ? 0.7 : 1;
  if (ex.dose.seconds !== undefined) return scaleDose({ seconds: p.holdSeconds }, factor);
  return scaleDose({ reps: Math.max(1, Math.round((ex.dose.reps ?? 1) * p.repsScale)) }, factor);
}

const generator: BlockGenerator<MobilityParams> = {
  id: 'mobility',
  generate(ctx, p) {
    const sizing = slotsFor(ctx.blockSeconds, 'mobility');
    const maxLevel = (p.warmup ? Math.min(p.maxLevel, 2) : p.maxLevel) as Level;
    const zones = FOCUS_ZONES[focusFor(ctx.today)];
    const counts = zoneCounts(ctx);
    const ordered = zones
      .map((zone, i) => ({ zone, i }))
      .sort((a, b) => (counts.today.get(a.zone) ?? 0) - (counts.today.get(b.zone) ?? 0) || (counts.week.get(a.zone) ?? 0) - (counts.week.get(b.zone) ?? 0) || a.i - b.i)
      .map((o) => o.zone);

    // Every exercise must be sensible in the smallest window this block can give it (the window only grows if slots are dropped).
    const rest = 5;
    const guess = slotWorkFor(ctx.blockSeconds - sizing.prep, sizing.slots * sizing.rounds, rest);
    const chosen: ExerciseDef[] = [];
    const used = new Set<string>();
    for (let i = 0; i < sizing.slots * 2 && chosen.length < sizing.slots; i++) {
      const zone = ordered[i % ordered.length]!;
      const candidates = ctx.catalog.exercises.all.filter(
        (e) =>
          e.tags.includes('mobility') &&
          e.zones?.includes(zone) &&
          e.level <= maxLevel &&
          available(e, ctx) &&
          fitsWindow(e, guess) &&
          (p.allowLoaded || (e.needsOneOf.length === 0 && !e.loadable)),
      );
      const ex = pickExercise(candidates.filter((e) => !used.has(e.id)), ctx, { preferZones: [zone] });
      if (!ex) continue;
      used.add(ex.id);
      chosen.push(ex);
    }
    const kind = p.warmup ? 'warmup' : 'train';
    if (chosen.length === 0) return finalizePlan(kind, sizing.prep, [], ctx.blockSeconds);

    const avail = ctx.blockSeconds - sizing.prep;
    let rounds = sizing.rounds;
    let list = chosen;
    let window = slotWorkFor(avail, list.length * rounds, rest);
    while (window < 20 && rounds > 1) {
      rounds -= 1;
      window = slotWorkFor(avail, list.length * rounds, rest);
    }
    while (window < 20 && list.length > 1) {
      list = list.slice(0, -1);
      window = slotWorkFor(avail, list.length * rounds, rest);
    }
    const steps: BlockStep[] = [];
    for (let r = 1; r <= rounds; r++) {
      for (const ex of list) steps.push(...slotSteps({ ex, target: holdOrReps(ex, p), work: Math.max(1, window), rest, ...(rounds > 1 ? { round: r } : {}) }));
    }
    fillRemainder(ctx, steps, sizing.prep, list.map((e) => e.id), (e) => p.allowLoaded || (e.needsOneOf.length === 0 && !e.loadable));
    return finalizePlan(kind, sizing.prep, steps, ctx.blockSeconds);
  },
};

const progression: ProgressionModel<MobilityParams> = {
  id: 'mobilityHolds',
  levels: () => new Map(),
  dose: (ex) => ({ target: { ...ex.dose } }),
};

const w = (en: string, es: string) => ({ en, es });

export const MOBILITY_GOAL = defineGoal<MobilityParams>({
  id: 'mobility',
  tag: 'mobility',
  name: w('Improve mobility', 'Mejorar la movilidad'),
  description: w('Short mobility holds for the joints a desk job stiffens: neck, shoulders, back, hips and ankles.', 'Movilidad breve para las articulaciones que el trabajo de escritorio endurece: cuello, hombros, espalda, caderas y tobillos.'),
  icon: 'stretch',
  programs: [
    {
      id: 'deskReset',
      name: w('Desk reset', 'Reinicio de escritorio'),
      summary: w('Four weeks of daily mobility, a different area each day, with a retest every cycle.', 'Cuatro semanas de movilidad diaria, con una zona distinta cada día y un nuevo test en cada ciclo.'),
      weeks: 4,
      daysPerWeek: 7,
      assessmentWeeks: [1],
      assessmentIds: ['mobDeepSquat', 'mobKneeToWall', 'mobToeTouch', 'mobBackScratch'],
      phases: [
        { fromWeek: 1, toWeek: 2, params: { holdSeconds: 25, repsScale: 1.0, allowLoaded: false, maxLevel: 2 }, note: w('Explore the range without forcing it.', 'Explora el rango sin forzar.') },
        { fromWeek: 3, toWeek: 4, params: { holdSeconds: 40, repsScale: 1.3, allowLoaded: true, maxLevel: 3 }, note: w('Hold longer and breathe slowly at the end of the range.', 'Mantén más tiempo y respira lento al final del rango.') },
      ],
    },
  ],
  generator,
  progression,
  metricIds: ['heatmap', 'zonesCovered', 'assessment:mobDeepSquat', 'assessment:mobKneeToWall', 'assessment:mobToeTouch', 'assessment:mobBackScratch'],
});
