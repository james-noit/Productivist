import { addDays } from '../../dates';
import type { BodyZone, LocalizedText, MovementPattern, SportBlock } from '../../../types/sportask';
import type { AssessmentDef, GenerationContext } from '../engine/context';
import { type LadderParams, ladderIndex, replayLadders } from '../engine/progression';
import { phaseFor, programWeek } from '../engine/schedule';
import { CATALOG } from '../catalog';
import { GOALS } from '../goals';
import { netKcal, workSecondsDone } from '../kcal';
import { baseWeeklyMinutes } from '../targets';
import { counted, dayKeys, doneSteps, inRange, setExerciseIds, weekIndexer, weekKeys } from './helpers';
import type { AssessmentSummary, DateRange, MetricDef, MetricEnv, Series, SeriesGroup } from './types';

const text = (en: string, es: string): LocalizedText => ({ en, es });
const zeros = (n: number): number[] => new Array<number>(n).fill(0);

/** Display order of the groups of the stacked charts. */
export const PATTERN_ORDER: readonly MovementPattern[] = ['squat', 'lunge', 'hinge', 'push', 'pushVertical', 'pull', 'core', 'cardio', 'mobility'];
export const ZONE_ORDER: readonly BodyZone[] = ['neck', 'shoulders', 'thoracic', 'spine', 'hips', 'hamstrings', 'ankles', 'wrists'];

/** Blocks of the range that count as training (done or partial), with the week they fall in. */
function* trained(blocks: readonly SportBlock[], range: DateRange, week: (date: string) => number): Generator<{ block: SportBlock; week: number }> {
  for (const block of blocks) {
    if (!inRange(block, range) || !counted(block)) continue;
    const w = week(block.date);
    if (w >= 0) yield { block, week: w };
  }
}

// ---- adherence -----------------------------------------------------------------------------------------------------------

export const adherence: MetricDef = {
  id: 'adherence',
  name: text('Adherence', 'Constancia'),
  unit: text('blocks', 'bloques'),
  chart: 'stackedBars',
  compute(blocks, range) {
    const keys = weekKeys(range);
    const week = weekIndexer(keys);
    const counts = { done: zeros(keys.length), partial: zeros(keys.length), skipped: zeros(keys.length) };
    for (const b of blocks) {
      const w = inRange(b, range) ? week(b.date) : -1;
      if (w >= 0) counts[b.status][w]! += 1;
    }
    return { kind: 'stackedBars', keys, groups: (['done', 'partial', 'skipped'] as const).map((id) => ({ id, values: counts[id] })) };
  },
};

// ---- active minutes ------------------------------------------------------------------------------------------------------

/** The weekly active-minutes target of the enrolled calories program, week by week (it grows with the phases). */
function weeklyTargets(keys: readonly string[], env: MetricEnv): (number | null)[] {
  const e = env.enrolment;
  const goal = e ? GOALS.get(e.goalId) : undefined;
  if (!e || !goal || goal.id !== 'calories') return keys.map(() => null);
  const program = goal.programs.find((p) => p.id === e.programId) ?? goal.programs[0]!;
  return keys.map((w) => {
    if (addDays(w, 6) < e.startedOn) return null;
    const params = phaseFor(program, programWeek(e.startedOn, w > e.startedOn ? w : e.startedOn, program.weeks).week).params;
    // The plan for that week, scaled to the user's days and activity (0.25); the Summary's target card also adapts it to their results.
    return baseWeeklyMinutes(goal, program.daysPerWeek, params, { profile: env.profile });
  });
}

export const activeMinutes: MetricDef = {
  id: 'activeMinutes',
  name: text('Active minutes', 'Minutos activos'),
  unit: text('min', 'min'),
  chart: 'bars',
  compute(blocks, range, env) {
    const keys = weekKeys(range);
    const week = weekIndexer(keys);
    const values = zeros(keys.length);
    for (const { block, week: w } of trained(blocks, range, week)) values[w]! += workSecondsDone(block) / 60;
    const targets = weeklyTargets(keys, env);
    return { kind: 'bars', keys, groups: [{ id: 'minutes', values }], ...(targets.some((t) => t !== null) ? { targets } : {}) };
  },
};

// ---- net kcal ------------------------------------------------------------------------------------------------------------

export const netKcalMetric: MetricDef = {
  id: 'netKcal',
  name: text('Calories (estimate)', 'Calorías (estimación)'),
  unit: text('kcal', 'kcal'),
  chart: 'bars',
  compute(blocks, range, env) {
    const keys = weekKeys(range);
    const week = weekIndexer(keys);
    const values = zeros(keys.length);
    if (env.weightKg) for (const { block, week: w } of trained(blocks, range, week)) values[w]! += netKcal(block, env.catalog, env.weightKg);
    return { kind: 'bars', keys, groups: [{ id: 'kcal', values }], ...(env.weightKg ? {} : { missing: 'weight' as const }) };
  },
};

// ---- heatmap -------------------------------------------------------------------------------------------------------------

export const heatmap: MetricDef = {
  id: 'heatmap',
  name: text('Activity', 'Actividad'),
  unit: text('blocks', 'bloques'),
  chart: 'heatmap',
  compute(blocks, range) {
    const keys = dayKeys(range);
    const index = new Map(keys.map((k, i) => [k, i]));
    const values = zeros(keys.length);
    for (const b of blocks) {
      const i = counted(b) ? index.get(b.date) : undefined;
      if (i !== undefined) values[i]! += 1;
    }
    return { kind: 'heatmap', keys, groups: [{ id: 'blocks', values }] };
  },
};

// ---- sets per pattern ----------------------------------------------------------------------------------------------------

export const setsPerPattern: MetricDef = {
  id: 'setsPerPattern',
  name: text('Sets per movement', 'Series por movimiento'),
  unit: text('sets', 'series'),
  chart: 'stackedBars',
  compute(blocks, range, env) {
    const keys = weekKeys(range);
    const week = weekIndexer(keys);
    const byPattern = new Map<string, number[]>();
    for (const { block, week: w } of trained(blocks, range, week)) {
      for (const id of setExerciseIds(block)) {
        const pattern = env.catalog.exercises.get(id)?.pattern;
        if (!pattern) continue;
        let row = byPattern.get(pattern);
        if (!row) byPattern.set(pattern, (row = zeros(keys.length)));
        row[w]! += 1;
      }
    }
    const groups: SeriesGroup[] = PATTERN_ORDER.filter((p) => byPattern.has(p)).map((p) => ({ id: p, values: byPattern.get(p)! }));
    return { kind: 'stackedBars', keys, groups };
  },
};

// ---- zones covered -------------------------------------------------------------------------------------------------------

/** Each block counts once in every body zone it worked, so a stack adds up zone-visits, not blocks. */
export const zonesCovered: MetricDef = {
  id: 'zonesCovered',
  name: text('Zones worked', 'Zonas trabajadas'),
  unit: text('blocks', 'bloques'),
  chart: 'stackedBars',
  compute(blocks, range, env) {
    const keys = weekKeys(range);
    const week = weekIndexer(keys);
    const byZone = new Map<string, number[]>();
    for (const { block, week: w } of trained(blocks, range, week)) {
      if (block.kind === 'test') continue;
      const zones = new Set<BodyZone>();
      for (const i of doneSteps(block)) for (const z of env.catalog.exercises.get(block.steps[i]!.exerciseId)?.zones ?? []) zones.add(z);
      for (const z of zones) {
        let row = byZone.get(z);
        if (!row) byZone.set(z, (row = zeros(keys.length)));
        row[w]! += 1;
      }
    }
    return { kind: 'stackedBars', keys, groups: ZONE_ORDER.filter((z) => byZone.has(z)).map((z) => ({ id: z, values: byZone.get(z)! })) };
  },
};

// ---- density -------------------------------------------------------------------------------------------------------------

/** Work / (work + rest), in percent, of the calories blocks of each week. The last step's rest is the block's "breathe" padding, so it is left out. */
export const density: MetricDef = {
  id: 'density',
  name: text('Work density', 'Densidad de trabajo'),
  unit: text('%', '%'),
  chart: 'line',
  compute(blocks, range) {
    const keys = weekKeys(range);
    const week = weekIndexer(keys);
    const work = zeros(keys.length);
    const total = zeros(keys.length);
    for (const { block, week: w } of trained(blocks, range, week)) {
      if (block.kind === 'test' || block.goalId !== 'calories') continue;
      const last = block.steps.length - 1;
      for (const i of doneSteps(block)) {
        const s = block.steps[i]!;
        work[w]! += s.workSeconds;
        total[w]! += s.workSeconds + (i === last ? 0 : s.restSeconds);
      }
    }
    return { kind: 'line', keys, groups: [{ id: 'density', values: keys.map((_, i) => (total[i]! > 0 ? (work[i]! / total[i]!) * 100 : null)) }] };
  },
};

// ---- ladder level --------------------------------------------------------------------------------------------------------

/** The rung (1-based) the user is on in each ladder they trained, replayed from history at the end of every week. */
export const ladderLevel: MetricDef = {
  id: 'ladderLevel',
  name: text('Level per movement', 'Nivel por movimiento'),
  unit: text('level', 'nivel'),
  chart: 'line',
  compute(blocks, range, env) {
    const keys = weekKeys(range);
    const e = env.enrolment;
    const goal = e ? GOALS.get(e.goalId) : undefined;
    const empty: Series = { kind: 'line', keys, groups: [], stepped: true };
    if (!e || !goal) return empty;
    const program = goal.programs.find((p) => p.id === e.programId) ?? goal.programs[0]!;
    const history = [...blocks].sort((a, b) => a.startedAt - b.startedAt);
    const own = history.filter((b) => b.origin === 'goal' && b.goalId === e.goalId && counted(b) && b.kind !== 'warmup');
    const first = own[0]?.date;
    if (!first) return empty;
    const where = ladderIndex(env.catalog);
    const trainedLadders = new Set<string>();
    for (const b of own) {
      for (const s of b.steps) {
        const w = where.get(s.exerciseId);
        if (w) trainedLadders.add(w.ladderId);
      }
    }
    const rows = new Map<string, (number | null)[]>([...trainedLadders].map((id) => [id, keys.map(() => null)]));
    keys.forEach((weekStart, i) => {
      const end = addDays(weekStart, 6);
      if (end < first) return;
      const params = phaseFor(program, programWeek(e.startedOn, end, program.weeks).week).params as LadderParams;
      const ctx: GenerationContext = {
        blockId: 'metric',
        blockSeconds: 0,
        now: 0,
        today: end,
        catalog: env.catalog,
        equipment: env.equipment,
        constraints: env.constraints,
        history: history.filter((b) => b.date <= end),
        todayBlocks: [],
        enrolment: e,
        ...(env.profile ? { profile: env.profile } : {}),
        rng: () => 0.5,
      };
      const states = replayLadders(ctx, params);
      for (const [id, row] of rows) {
        const state = states.get(id);
        if (state) row[i] = state.rung + 1;
      }
    });
    const ids = [...rows.keys()].sort((a, b) => PATTERN_ORDER.indexOf(a as MovementPattern) - PATTERN_ORDER.indexOf(b as MovementPattern));
    return { kind: 'line', keys, groups: ids.map((id) => ({ id, values: rows.get(id)! })), stepped: true };
  },
};

// ---- assessments ---------------------------------------------------------------------------------------------------------

const UNITS: Record<AssessmentDef['metric'], LocalizedText> = {
  reps: text('reps', 'rep.'),
  seconds: text('s', 's'),
  cm: text('cm', 'cm'),
};

function summarize(points: { date: string; value: number }[], higherIsBetter: boolean): AssessmentSummary | undefined {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return undefined;
  const values = points.map((p) => p.value);
  const delta = last.value - first.value;
  return {
    first: first.value,
    last: last.value,
    best: higherIsBetter ? Math.max(...values) : Math.min(...values),
    delta,
    improved: delta === 0 ? null : higherIsBetter ? delta > 0 : delta < 0,
  };
}

/** One line per assessment (two when it is per side). The summary covers every test ever taken; the points only the range. */
export function assessmentMetric(def: AssessmentDef): MetricDef {
  return {
    id: `assessment:${def.id}`,
    // A getter: the Fitness director's overlay may rename the assessment after this metric was built.
    get name() {
      return CATALOG.assessments.get(def.id)?.name ?? def.name;
    },
    unit: UNITS[def.metric],
    chart: 'line',
    compute(blocks, range) {
      const tests = blocks.filter((b) => b.kind === 'test' && b.assessmentId === def.id && b.status !== 'skipped').sort((a, b) => a.startedAt - b.startedAt);
      const groupIds = def.perSide ? ['left', 'right'] : ['value'];
      const perGroup = new Map<string, Map<string, number>>(groupIds.map((g) => [g, new Map()]));
      const used: string[] = [];
      for (const b of tests) {
        const done = new Set(doneSteps(b));
        b.steps.forEach((step, i) => {
          const value = b.results.find((r) => r.stepIndex === i)?.value;
          if (!done.has(i) || value === undefined) return;
          perGroup.get(def.perSide ? (step.side ?? 'left') : 'value')?.set(b.date, value);
          if (!used.includes(step.exerciseId)) used.push(step.exerciseId);
        });
      }
      const dates = [...new Set([...perGroup.values()].flatMap((m) => [...m.keys()]))].sort();
      const keys = dates.filter((d) => d >= range.from && d <= range.to);
      const groups: SeriesGroup[] = groupIds
        .filter((g) => perGroup.get(g)!.size > 0)
        .map((g) => {
          const m = perGroup.get(g)!;
          const points = [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
          const summary = summarize(points, def.higherIsBetter);
          return { id: g, values: keys.map((k) => m.get(k) ?? null), ...(summary ? { summary } : {}) };
        });
      return { kind: 'line', keys, groups, exerciseIds: used };
    },
  };
}
