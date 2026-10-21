// Sportask self-check (docs/sportask/PLAN.md section 12).
// Run with `npm run check:sportask`. Throws on the first failed assertion.
import { addDays, startOfWeek } from '../src/lib/dates';
import { hashWith, sportBlockCodec, sportTemplateCodec, type SportBlockWire, type SportTemplateWire } from '../src/lib/sync-engine';
import { CADENCES, breakSecondsFor, resolveCadence } from '../src/lib/sportask/cadences';
import { CATALOG, CATALOG_VERSION, MET, PICTOGRAM_IDS } from '../src/lib/sportask/catalog';
import { PICTOGRAMS } from '../src/lib/sportask/pictogram-paths';
import type { AnyGoal, GenerationContext } from '../src/lib/sportask/engine/context';
import { MIN_FILL_SECONDS } from '../src/lib/sportask/engine/fit';
import { available } from '../src/lib/sportask/engine/filter';
import { type BlockMeta, generate } from '../src/lib/sportask/engine/generate';
import { LADDER_PROGRESSION, isRungUsable } from '../src/lib/sportask/engine/progression';
import { mulberry32, rngFor, seedFrom } from '../src/lib/sportask/engine/rng';
import { phaseFor, programWeek } from '../src/lib/sportask/engine/schedule';
import { sportaskSwitch } from '../src/lib/sportask-defaults';
import { EQUIPMENT } from '../src/lib/sportask/equipment';
import { GOALS } from '../src/lib/sportask/goals';
import { netKcal } from '../src/lib/sportask/kcal';
import { createRegistry } from '../src/lib/sportask/registry';
import { sanitizeBlock, sanitizeSettings, sanitizeTemplate, defaultSettings } from '../src/lib/sportask/sanitize';
import { stepAt, timeline } from '../src/lib/sportask/runner';
import { SKINS } from '../src/lib/sportask/skins';
import { BUILTIN_TEMPLATES } from '../src/lib/sportask/templates';
import { barMax, barRects, heatLayout, heatLevel, linePath, niceTicks, plotOf, targetPath, timeScaleX } from '../src/lib/sportask/charts';
import { METRICS, type MetricEnv } from '../src/lib/sportask/metrics';
import { personalRecords, weekStats } from '../src/lib/sportask/metrics/summary';
import { resultsFromRows, rowsFromBlock, statusFromRows } from '../src/lib/sportask/results';
import type { BlockPlan, BlockStep, Constraints, Enrolment, EquipmentInventory, SportBlock, SportTemplate, StepResult } from '../src/types/sportask';

const proc = (globalThis as unknown as { process: { exitCode?: number } }).process;
let assertions = 0;

function check(cond: unknown, msg: string): asserts cond {
  assertions++;
  if (!cond) throw new Error(`FAILED: ${msg}`);
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
const same = (a: unknown, b: unknown): boolean => stable(a) === stable(b);
const section = (name: string): void => console.log(`- ${name}`);

// ---------------------------------------------------------------- fixtures

const MONDAY = startOfWeek('2026-03-02');
const LENGTHS = [30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1500, 1800];

const EQUIPMENT_SETS: Record<string, EquipmentInventory> = {
  none: {},
  all: {
    band: { owned: true, bandStrengths: ['light', 'medium'] },
    kettlebell: { owned: true, weightsKg: [8, 12, 16] },
    dumbbells: { owned: true, weightsKg: [4, 6, 8] },
    jumpRope: { owned: true },
    yogaBall: { owned: true },
  },
  bandOnly: { band: { owned: true } },
  ballRope: { yogaBall: { owned: true }, jumpRope: { owned: true } },
};
const CONSTRAINT_SETS: Constraints[] = [
  { lowImpact: false, noFloor: false },
  { lowImpact: true, noFloor: false },
  { lowImpact: false, noFloor: true },
  { lowImpact: true, noFloor: true },
];

interface CtxOptions {
  blockId: string;
  blockSeconds: number;
  today?: string;
  equipment?: EquipmentInventory;
  constraints?: Constraints;
  history?: readonly SportBlock[];
  todayBlocks?: readonly SportBlock[];
  enrolment?: Enrolment | null;
}
function makeCtx(o: CtxOptions): GenerationContext {
  const today = o.today ?? addDays(MONDAY, 2);
  return {
    blockId: o.blockId,
    blockSeconds: o.blockSeconds,
    now: Date.parse(`${today}T10:00:00Z`),
    today,
    catalog: CATALOG,
    equipment: o.equipment ?? {},
    constraints: o.constraints ?? CONSTRAINT_SETS[0]!,
    history: o.history ?? o.todayBlocks ?? [],
    todayBlocks: o.todayBlocks ?? [],
    enrolment: o.enrolment ?? null,
    rng: rngFor(o.blockId),
  };
}
const enrol = (goalId: string, programId: string, level: 1 | 2 | 3, startedOn: string): Enrolment => ({ goalId, programId, level, startedOn, acceptedDisclaimerAt: 1 });

let clock = 1_800_000_000_000;
function toBlock(plan: BlockPlan, meta: BlockMeta, ctx: GenerationContext, opts: { value?: (i: number) => number | undefined; feedback?: SportBlock['feedback']; status?: SportBlock['status'] } = {}): SportBlock {
  clock += 60_000;
  const results = plan.steps.map((step, i) => {
    const value = opts.value ? opts.value(i) : (step.target?.reps ?? step.target?.seconds ?? (plan.kind === 'test' ? 10 : undefined));
    const r: SportBlock['results'][number] = { stepIndex: i, done: true };
    if (value !== undefined) r.value = value;
    if (step.loadKg !== undefined) r.loadKg = step.loadKg;
    return r;
  });
  const b: SportBlock = {
    id: `blk-${clock}`,
    startedAt: clock,
    date: ctx.today,
    origin: meta.origin,
    kind: plan.kind,
    blockSeconds: ctx.blockSeconds,
    prepSeconds: plan.prepSeconds,
    steps: plan.steps,
    results,
    status: opts.status ?? 'done',
    catalogVersion: CATALOG_VERSION,
    createdAt: clock,
    updatedAt: clock,
  };
  if (meta.goalId) b.goalId = meta.goalId;
  if (meta.programId) b.programId = meta.programId;
  if (meta.programWeek) b.programWeek = meta.programWeek;
  if (meta.templateId) b.templateId = meta.templateId;
  if (plan.assessmentId) b.assessmentId = plan.assessmentId;
  if (opts.feedback) b.feedback = opts.feedback;
  return b;
}

// ---------------------------------------------------------------- 1. registries and content

function checkRegistries(): void {
  section('1. registries and content');
  let threw = false;
  try {
    createRegistry([{ id: 'a' }, { id: 'a' }]);
  } catch {
    threw = true;
  }
  check(threw, 'createRegistry must throw on a duplicate id');

  const exercises = CATALOG.exercises;
  check(exercises.all.length > 0, 'catalog has exercises');
  const pictograms = new Set<string>(PICTOGRAM_IDS);
  for (const id of PICTOGRAM_IDS) {
    const p = PICTOGRAMS[id];
    check(!!p && p.a.main.length > 0 && p.b.main.length > 0, `pictogram ${id}: both poses drawn`);
    check(!!p && p.tempo >= 0.5 && p.tempo <= 4, `pictogram ${id}: a tempo of 0.5 to 4 s`);
    for (const d of [...(p?.a.main ?? []), ...(p?.b.main ?? []), ...(p?.a.soft ?? []), ...(p?.b.soft ?? [])]) {
      check(/^M[-\d. ]+[aLC]/.test(d) && !d.includes('NaN') && !d.includes('Infinity'), `pictogram ${id}: a sane path`);
      for (const v of d.match(/-?\d+(\.\d+)?/g) ?? []) check(Math.abs(Number(v)) < 120, `pictogram ${id}: a number inside the grid (${v})`);
    }
  }
  const equipmentIds = new Set(EQUIPMENT.all.map((e) => e.id));
  for (const ex of exercises.all) {
    check(ex.name.en.length > 0 && ex.name.es.length > 0, `${ex.id}: names in en and es`);
    check(ex.cues.length >= 1 && ex.cues.length <= 3, `${ex.id}: 1-3 cues`);
    for (const c of ex.cues) check(c.en.length > 0 && c.es.length > 0 && c.en !== c.es, `${ex.id}: a cue in both languages, translated`);
    check(pictograms.has(ex.pictogram), `${ex.id}: unknown pictogram ${ex.pictogram}`);
    check(ex.met > 0, `${ex.id}: met > 0`);
    check((ex.dose.reps === undefined) !== (ex.dose.seconds === undefined), `${ex.id}: dose has exactly one field`);
    check((ex.metric === 'seconds') === (ex.dose.seconds !== undefined), `${ex.id}: metric matches the dose`);
    for (const n of ex.needsOneOf) check(equipmentIds.has(n), `${ex.id}: unknown equipment ${n}`);
    if (ex.loadable) check(ex.needsOneOf.length > 0, `${ex.id}: loadable needs equipment`);
    check(ex.tags.length > 0, `${ex.id}: has tags`);
  }
  for (const m of Object.values(MET)) check(m > 0, 'MET classes are positive');

  for (const ladder of CATALOG.ladders.all) {
    check(ladder.rungs.length > 0, `${ladder.id}: has rungs`);
    ladder.rungs.forEach((alts, r) => {
      check(alts.length > 0, `${ladder.id} rung ${r}: not empty`);
      for (const id of alts) {
        const ex = exercises.get(id);
        check(ex, `${ladder.id} rung ${r}: unknown exercise ${id}`);
        check(ex.pattern === ladder.pattern, `${ladder.id}: ${id} has pattern ${ex.pattern}`);
      }
    });
  }
  const inLadder = new Set(CATALOG.ladders.all.flatMap((l) => l.rungs.flat()));
  for (const ex of exercises.all) {
    if (ex.tags.includes('strength')) check(inLadder.has(ex.id), `${ex.id}: strength exercise missing from every ladder`);
  }

  for (const a of CATALOG.assessments.all) {
    check(a.exerciseIds || a.ladderId, `${a.id}: needs exerciseIds or a ladder`);
    for (const id of a.exerciseIds ?? []) check(exercises.get(id), `${a.id}: unknown exercise ${id}`);
    if (a.ladderId) check(CATALOG.ladders.get(a.ladderId), `${a.id}: unknown ladder`);
    check(a.seconds > 0 && a.name.en && a.name.es && a.instructions.en && a.instructions.es, `${a.id}: texts and seconds`);
  }

  for (const t of BUILTIN_TEMPLATES.all) {
    check(t.id.startsWith('tpl.') && t.builtin === true && t.nameText, `${t.id}: built-in shape`);
    for (const s of t.slots) {
      if ('exerciseId' in s) check(exercises.get(s.exerciseId), `${t.id}: unknown exercise ${s.exerciseId}`);
      else check(exercises.all.some((e) => e.pattern === s.pattern && (!s.tag || e.tags.includes(s.tag)) && (!s.zone || e.zones?.includes(s.zone))), `${t.id}: pattern slot matches nothing`);
    }
    if (t.format === 'intervals') check(t.workSeconds && t.restSeconds !== undefined, `${t.id}: intervals need work/rest`);
  }

  for (const goal of GOALS.all) {
    check(goal.programs.length > 0 && goal.metricIds.length > 0, `${goal.id}: programs and metrics`);
    if (goal.restDayGoalId) check(GOALS.get(goal.restDayGoalId), `${goal.id}: unknown rest-day goal`);
    for (const program of goal.programs) {
      for (const id of program.assessmentIds) check(CATALOG.assessments.get(id), `${program.id}: unknown assessment ${id}`);
      for (const w of program.assessmentWeeks) check(w >= 1 && w <= program.weeks, `${program.id}: assessment week in range`);
      for (let w = 1; w <= program.weeks; w++) check(program.phases.some((p) => w >= p.fromWeek && w <= p.toWeek), `${program.id}: week ${w} has a phase`);
      check(program.daysPerWeek >= 1 && program.daysPerWeek <= 7, `${program.id}: daysPerWeek`);
    }
  }
  for (const c of CADENCES.all) check(c.focusSeconds > 0 && c.breakSeconds > 0 && c.exerciseEvery >= 1, `${c.id}: cadence values`);
  check(breakSecondsFor(resolveCadence({ cadenceId: 'classic' }), 4) === 900 && breakSecondsFor(resolveCadence({ cadenceId: 'classic' }), 3) === 300, 'long break every 4th');
  check(SKINS.all.length === 2, 'two skins');
  console.log(`  ${exercises.all.length} exercises, ${CATALOG.ladders.all.length} ladders, ${CATALOG.assessments.all.length} assessments, ${BUILTIN_TEMPLATES.all.length} templates, ${GOALS.all.length} goals`);
}

// ---------------------------------------------------------------- 2 + 4. generation sweep

/**
 * Trailing padding (the last step's rest beyond the normal rest between steps) must be shorter than one slot (work + rest): the block is
 * filled, not left with a gap (a leftover under MIN_FILL_SECONDS is too short to fill and always allowed). The normal rest is that of the first earlier step that has one.
 */
function checkNoIdleGap(plan: BlockPlan, label: string): void {
  const last = plan.steps[plan.steps.length - 1]!;
  const normalRest = plan.steps.slice(0, -1).find((s) => s.restSeconds > 0)?.restSeconds ?? 0;
  const pad = last.restSeconds - normalRest;
  const slot = Math.max(...plan.steps.map((s, i) => s.workSeconds + (i < plan.steps.length - 1 ? s.restSeconds : normalRest)));
  check(pad < Math.max(slot, MIN_FILL_SECONDS), `${label}: ${pad} s of idle padding at the end, but a slot is ${slot} s`);
}

function assertPlan(plan: BlockPlan, ctx: GenerationContext, meta: BlockMeta, warm: boolean, label: string): void {
  check(plan.steps.length > 0, `${label}: empty plan`);
  for (const [i, s] of plan.steps.entries()) {
    check(s.workSeconds >= 15, `${label}: step ${i} (${s.exerciseId}) has only ${s.workSeconds} s of work`);
    const reps = s.target?.reps;
    if (reps !== undefined) check(reps >= Math.min(3, CATALOG.exercises.get(s.exerciseId)!.dose.reps ?? 3), `${label}: step ${i} (${s.exerciseId}) aims for ${reps} reps`);
    if (s.target?.seconds !== undefined) check(s.target.seconds >= 15, `${label}: step ${i} (${s.exerciseId}) holds only ${s.target.seconds} s`);
  }
  check(plan.totalSeconds <= ctx.blockSeconds, `${label}: total ${plan.totalSeconds} > block ${ctx.blockSeconds}`);
  const sum = plan.prepSeconds + plan.steps.reduce((t, s) => t + s.workSeconds + s.restSeconds, 0);
  check(plan.totalSeconds === sum, `${label}: total ${plan.totalSeconds} != prep + steps ${sum}`);
  check(plan.prepSeconds >= 0 && Number.isInteger(plan.prepSeconds), `${label}: prep`);
  for (const [i, s] of plan.steps.entries()) {
    check(Number.isInteger(s.workSeconds) && s.workSeconds >= 1 && Number.isInteger(s.restSeconds) && s.restSeconds >= 0, `${label}: step ${i} times`);
    const ex = CATALOG.exercises.get(s.exerciseId);
    check(ex, `${label}: step ${i} unknown exercise ${s.exerciseId}`);
    if (s.target) check((s.target.reps === undefined) !== (s.target.seconds === undefined), `${label}: step ${i} target`);
    if (s.target?.reps !== undefined) check(Number.isInteger(s.target.reps) && s.target.reps >= 1, `${label}: step ${i} reps`);
    if (s.target?.seconds !== undefined) check(Number.isInteger(s.target.seconds) && s.target.seconds >= 1 && s.target.seconds <= s.workSeconds, `${label}: step ${i} seconds`);
    if (meta.fallback !== 'minimal') check(available(ex, ctx), `${label}: step ${i} ${s.exerciseId} is not available`);
    if (ctx.constraints.lowImpact) check(ex.impact !== 'high', `${label}: ${s.exerciseId} is high impact with lowImpact`);
    if (ctx.constraints.noFloor) check(!ex.floor, `${label}: ${s.exerciseId} needs the floor with noFloor`);
    if (plan.kind === 'warmup') check(ex.level <= 2 && ex.impact !== 'high', `${label}: warm-up step ${s.exerciseId} level ${ex.level} / ${ex.impact}`);
    if (ex.perSide && s.side === undefined) check(meta.origin === 'free' || plan.kind === 'test' || ex.perSide === true, `${label}: per-side step without side`);
  }
  if (plan.kind !== 'test' && meta.fallback !== 'minimal') checkNoIdleGap(plan, label);
  if (meta.origin === 'goal' && plan.kind !== 'test') check(plan.kind === (warm ? 'warmup' : 'train'), `${label}: kind ${plan.kind} but warm=${warm}`);
  if (plan.kind === 'test') {
    check(plan.assessmentId && CATALOG.assessments.get(plan.assessmentId), `${label}: test without a known assessment`);
    check(!warm, `${label}: a test as the first block of the day`);
  }
}

const sweepPlans: { plan: BlockPlan }[] = [];

function sweepGoals(): void {
  section('2/4. generation sweep over goals, phases, warm-up, equipment, constraints');
  let plans = 0;
  const seen = { tests: new Set<string>(), restDays: 0, fallbacks: 0, warmups: 0 };
  for (const goal of GOALS.all as readonly AnyGoal[]) {
    const program = goal.programs[0]!;
    for (let week = 1; week <= program.weeks; week++) {
      for (const warm of [true, false]) {
        for (const [eqName, equipment] of Object.entries(EQUIPMENT_SETS)) {
          for (const [ci, constraints] of CONSTRAINT_SETS.entries()) {
            for (const blockSeconds of LENGTHS) {
              for (let seed = 0; seed < 2; seed++) {
                const ks = warm || seed > 0 || !program.assessmentWeeks.includes(week) ? [0] : program.assessmentIds.map((_, i) => i);
                for (const testsDone of ks) {
                  const today = addDays(MONDAY, (seed * 3 + week) % 7);
                  const enrolment = enrol(goal.id, program.id, ((seed + 1) % 3 + 1) as 1 | 2 | 3, addDays(today, -(week - 1) * 7 - 2));
                  const prior: SportBlock[] = [];
                  if (!warm) {
                    const base = makeCtx({ blockId: 'prior', blockSeconds: 120, today, equipment, constraints, enrolment });
                    const g = generate(makeCtx({ blockId: `prior-${seed}`, blockSeconds: 120, today, equipment, constraints, enrolment }), { mode: 'goal', templateId: null }, { enrolment });
                    prior.push(toBlock(g.plan, g.meta, base));
                  }
                  const earlier: SportBlock[] = [];
                  for (let j = 0; j < testsDone; j++) {
                    const t = toBlock({ kind: 'test', prepSeconds: 15, steps: [{ exerciseId: 'plank', workSeconds: 30, restSeconds: 0 }], totalSeconds: 45, assessmentId: program.assessmentIds[j]! }, { origin: 'goal', goalId: goal.id }, makeCtx({ blockId: 't', blockSeconds: 60, today: addDays(today, -1) }));
                    earlier.push(t);
                  }
                  const blockId = `sw-${goal.id}-${week}-${warm}-${eqName}-${ci}-${blockSeconds}-${seed}-${testsDone}`;
                  const ctx = makeCtx({ blockId, blockSeconds, today, equipment, constraints, enrolment, todayBlocks: prior, history: [...earlier, ...prior] });
                  const { plan, meta } = generate(ctx, { mode: 'goal', templateId: null }, { enrolment });
                  assertPlan(plan, ctx, meta, warm, blockId);
                  plans++;
                  if (plan.kind === 'test') seen.tests.add(plan.assessmentId!);
                  if (meta.restDay) seen.restDays++;
                  if (meta.fallback) seen.fallbacks++;
                  if (plan.kind === 'warmup') seen.warmups++;
                  if (sweepPlans.length < 400 && plans % 31 === 0) sweepPlans.push({ plan });
                }
              }
            }
          }
        }
      }
    }
  }
  for (const id of ['mobDeepSquat', 'mobKneeToWall', 'mobToeTouch', 'mobBackScratch', 'strMaxPushUps', 'strPlank', 'strSquats60', 'calCardio60']) {
    check(seen.tests.has(id), `the sweep never produced the ${id} test`);
  }
  check(seen.warmups > 0, 'the sweep produced no warm-up');
  console.log(`  ${plans} plans checked (${seen.tests.size} test types, ${seen.warmups} warm-ups, ${seen.fallbacks} fallbacks, ${seen.restDays} rest days)`);
}

function sweepFree(): void {
  section('2/4. free templates');
  let plans = 0;
  const lengths = [30, 60, 120, 180, 240, 600, 1200];
  for (const t of BUILTIN_TEMPLATES.all) {
    for (const [eqName, equipment] of Object.entries(EQUIPMENT_SETS)) {
      for (const [ci, constraints] of CONSTRAINT_SETS.entries()) {
        for (const blockSeconds of lengths) {
          for (const templateId of [t.id, 'random']) {
            const blockId = `fr-${t.id}-${eqName}-${ci}-${blockSeconds}-${templateId}`;
            const ctx = makeCtx({ blockId, blockSeconds, equipment, constraints });
            const { plan, meta } = generate(ctx, { mode: 'free', templateId }, { enrolment: null });
            assertPlan(plan, ctx, meta, false, blockId);
            check(meta.origin === 'free' && (meta.templateId || meta.fallback), `${blockId}: free meta`);
            plans++;
          }
        }
      }
    }
  }
  // user template with a pattern slot and a fixed slot
  const mine: SportTemplate = { id: 'mine', name: 'Mine', slots: [{ pattern: 'squat', tag: 'strength' }, { exerciseId: 'plank', dose: { seconds: 20 } }], format: 'sequence', order: 1, createdAt: 1, updatedAt: 1 };
  const ctx = makeCtx({ blockId: 'user-tpl', blockSeconds: 120 });
  const g = generate(ctx, { mode: 'free', templateId: 'mine' }, { enrolment: null }, { templates: [mine] });
  check(g.meta.templateId === 'mine', 'a user template can be chosen');
  assertPlan(g.plan, ctx, g.meta, false, 'user-tpl');
  console.log(`  ${plans} plans checked`);
}

// ---------------------------------------------------------------- 3. determinism

function checkDeterminism(): void {
  section('3. determinism and variety');
  const equipment = EQUIPMENT_SETS['all']!;
  const cases: [string, 'goal' | 'free', Enrolment | null][] = [
    ['mobility', 'goal', enrol('mobility', 'deskReset', 1, addDays(MONDAY, -14))],
    ['strength', 'goal', enrol('strength', 'microStrength', 1, addDays(MONDAY, -14))],
    ['calories', 'goal', enrol('calories', 'burnAndMove', 1, addDays(MONDAY, -14))],
    ['free', 'free', null],
  ];
  for (const [name, mode, enrolment] of cases) {
    const today = addDays(MONDAY, 2);
    const warmDone = makeCtx({ blockId: 'x', blockSeconds: 60, today, equipment, enrolment });
    const prior = toBlock(generate(warmDone, { mode, templateId: 'random' }, { enrolment }).plan, { origin: mode === 'goal' ? 'goal' : 'free' }, warmDone);
    const plansFor = (id: string): string => {
      const ctx = makeCtx({ blockId: id, blockSeconds: 300, today, equipment, enrolment, todayBlocks: [prior], history: [prior] });
      return stable(generate(ctx, { mode, templateId: 'random' }, { enrolment }));
    };
    check(plansFor('same-id') === plansFor('same-id'), `${name}: the same block id must give the same plan`);
    const distinct = new Set<string>();
    for (let i = 0; i < 50; i++) distinct.add(plansFor(`seed-${i}`));
    check(distinct.size >= 2, `${name}: 50 seeds gave a single plan`);
    console.log(`  ${name}: ${distinct.size} distinct plans in 50 seeds`);
  }
  check(seedFrom('a') !== seedFrom('b'), 'seeds differ');
  const r = mulberry32(5);
  const values = Array.from({ length: 1000 }, () => r());
  check(values.every((v) => v >= 0 && v < 1), 'rng range');
}

// ---------------------------------------------------------------- 5. strength day

/** Strength patterns of the plan in order, adjacent repeats collapsed; the mobility finish is left out. */
function patternRuns(plan: BlockPlan, patterns: readonly string[]): string[] {
  const out: string[] = [];
  for (const s of plan.steps) {
    const p = CATALOG.exercises.get(s.exerciseId)!.pattern;
    if (!patterns.includes(p)) continue;
    if (out[out.length - 1] !== p) out.push(p);
  }
  return out;
}

let simFallbacks = 0;
function simulateStrengthDay(week: number, equipment: EquipmentInventory, constraints: Constraints, label: string): number {
  const goal = GOALS.get('strength')!;
  const program = goal.programs[0]!;
  const today = addDays(MONDAY, 1);
  const enrolment = enrol('strength', program.id, 1, addDays(today, -(week - 1) * 7));
  const params = phaseFor(program, week).params;
  const day: SportBlock[] = [];
  const lengths = [60, 120, 300, 600, 90, 180, 45, 420];
  let strengthBlocks = 0;
  for (let i = 0; i < 32; i++) {
    const blockSeconds = lengths[i % lengths.length]!;
    const ctx = makeCtx({ blockId: `${label}-${i}`, blockSeconds, today, equipment, constraints, enrolment, todayBlocks: [...day], history: [...day] });
    const g = generate(ctx, { mode: 'goal', templateId: null }, { enrolment });
    assertPlan(g.plan, ctx, g.meta, day.every((b) => b.status !== 'done'), `${label}-${i}`);
    if (g.meta.fallback === 'mobility') simFallbacks++;
    const runs = patternRuns(g.plan, params.patterns);
    const prev = day[day.length - 1];
    if (prev && prev.goalId === 'strength' && prev.kind !== 'test' && g.meta.goalId === 'strength' && g.plan.kind !== 'test') {
      const prevLast = patternRuns({ ...g.plan, steps: prev.steps }, params.patterns).pop();
      check(runs[0] !== prevLast, `${label}-${i}: same pattern (${prevLast}) in two consecutive blocks`);
    }
    if (g.meta.goalId === 'strength' && g.plan.kind !== 'test') {
      strengthBlocks++;
      for (let k = 1; k < runs.length; k++) check(runs[k] !== runs[k - 1], `${label}-${i}: adjacent equal patterns inside a block`);
    }
    day.push(toBlock(g.plan, g.meta, ctx));
  }
  const sets = new Map<string, number>();
  for (const b of day) {
    if (b.goalId !== 'strength' || b.kind === 'test') continue;
    for (const s of b.steps) {
      const pattern = CATALOG.exercises.get(s.exerciseId)!.pattern;
      if (s.side !== 'right' && params.patterns.includes(pattern)) sets.set(pattern, (sets.get(pattern) ?? 0) + 1);
    }
  }
  for (const [pattern, n] of sets) check(n <= params.capPerPatternPerDay, `${label}: ${n} sets of ${pattern} above the cap ${params.capPerPatternPerDay}`);
  return strengthBlocks;
}

function checkStrengthDay(): void {
  section('5. strength: no repeated pattern, daily cap');
  let blocks = 0;
  for (const week of [1, 3, 5]) {
    for (const [eqName, equipment] of Object.entries(EQUIPMENT_SETS)) {
      for (const [ci, constraints] of CONSTRAINT_SETS.entries()) {
        blocks += simulateStrengthDay(week, equipment, constraints, `day-w${week}-${eqName}-${ci}`);
      }
    }
  }
  check(simFallbacks > 0, 'the daily cap was never reached in the simulation');
  console.log(`  ${blocks} strength blocks simulated, ${simFallbacks} fell back to mobility once the cap was reached`);
}

// ---------------------------------------------------------------- 6. progression

function progressionChecks(): void {
  section('6. progression replay');
  const strength = GOALS.get('strength')!;
  const params = strength.programs[0]!.phases[0]!.params;
  let t = 1_700_000_000_000;
  const step = (exerciseId: string, value: number, feedback?: SportBlock['feedback']): SportBlock => {
    t += 3_600_000;
    const b: SportBlock = {
      id: `p${t}`, startedAt: t, date: '2026-03-02', origin: 'goal', goalId: 'strength', kind: 'train', blockSeconds: 60, prepSeconds: 10,
      steps: [{ exerciseId, workSeconds: 30, restSeconds: 0 }], results: [{ stepIndex: 0, done: true, value }], status: 'done', catalogVersion: 1, createdAt: t, updatedAt: t,
    };
    if (feedback) b.feedback = feedback;
    return b;
  };
  const rung = (history: SportBlock[], level: 1 | 2 | 3 = 1, equipment: EquipmentInventory = {}, constraints: Constraints = CONSTRAINT_SETS[0]!): number => {
    const ctx = makeCtx({ blockId: 'prog', blockSeconds: 60, equipment, constraints, history, enrolment: enrol('strength', 'microStrength', level, '2026-03-02') });
    return LADDER_PROGRESSION.levels(ctx, params).get('push')!;
  };

  check(rung([]) === 0, 'level 1 starts on rung 0');
  check(rung([], 2) === 1 && rung([], 3) === 2, 'levels 2 and 3 start on rungs 1 and 2');
  check(rung([step('wallPushUp', 12), step('wallPushUp', 12)]) === 1, 'two successes -> +1 rung');
  check(rung([step('wallPushUp', 12), step('wallPushUp', 10), step('wallPushUp', 12)]) === 0, 'a middle block breaks the streak');
  check(rung([step('wallPushUp', 12)]) === 0, 'one success is not enough');
  check(rung([step('deskPushUp', 3), step('deskPushUp', 3)], 2) === 0, 'two failures -> -1 rung');
  check(rung([step('wallPushUp', 3), step('wallPushUp', 3)]) === 0, 'never below rung 0');
  check(rung([step('wallPushUp', 12, 'tooEasy')]) === 1, 'success + tooEasy in one block moves exactly one rung');
  check(rung([step('wallPushUp', 9, 'tooEasy'), step('wallPushUp', 12)]) === 1, 'tooEasy counts as an extra success');
  check(rung([step('wallPushUp', 12, 'tooHard'), step('wallPushUp', 12, 'tooHard')]) === 0, 'tooHard is a failure');
  check(rung([step('wallPushUp', 30)].map((b) => ({ ...b, kind: 'test' as const, assessmentId: 'strMaxPushUps' }))) === 1, 'an assessment above the range max moves up at once');
  check(rung([step('pushUp', 12), step('pushUp', 12)]) === 0, 'results on another rung do not count');
  // rungs the equipment cannot do are skipped: noFloor and nothing owned -> rung 2 ([kneePushUp, dumbbellFloorPress]) is unusable
  const noFloor = { lowImpact: false, noFloor: true };
  check(rung([step('deskPushUp', 12), step('deskPushUp', 12)], 2, {}, noFloor) === 3, 'a rung without an available alternative is skipped (up)');
  const down = rung([step('chairDip', 3), step('chairDip', 3)], 3, {}, noFloor);
  check(down === 1, `a rung without an available alternative is skipped (down), got ${down}`);
  // the top: the dose keeps growing, never above 1.5 x the range max
  const squat = CATALOG.ladders.get('squat')!;
  const hist: SportBlock[] = [];
  for (let i = 0; i < 40; i++) {
    const ctx = makeCtx({ blockId: 'top', blockSeconds: 60, history: hist, constraints: { lowImpact: true, noFloor: true }, enrolment: enrol('strength', 'microStrength', 1, '2026-03-02') });
    const r = LADDER_PROGRESSION.levels(ctx, params).get('squat')!;
    check(isRungUsable(squat, r, ctx) && r >= 0 && r < squat.rungs.length, 'top ladder rung usable and in range');
    const ex = squat.rungs[r]!.map((id) => CATALOG.exercises.get(id)!).find((e) => available(e, ctx))!;
    const dose = LADDER_PROGRESSION.dose(ex, r, ctx, params).target;
    const v = (dose.reps ?? dose.seconds)!;
    check(v >= params.repRange.min && v <= Math.floor(Math.max(params.holdRange.max, params.repRange.max) * 1.5), 'dose bounded');
    hist.push(step(ex.id, v + 5));
  }
  const lastCtx = makeCtx({ blockId: 'top', blockSeconds: 60, history: hist, constraints: { lowImpact: true, noFloor: true }, enrolment: enrol('strength', 'microStrength', 1, '2026-03-02') });
  const topRung = LADDER_PROGRESSION.levels(lastCtx, params).get('squat')!;
  check(topRung === 3, `lowImpact + noFloor squat ladder tops out at rung 3 (single-leg sit-to-stand), got ${topRung}`);
  const topEx = CATALOG.exercises.get('singleLegSitToStand')!;
  const topDose = LADDER_PROGRESSION.dose(topEx, topRung, lastCtx, params).target.reps!;
  check(topDose > params.repRange.max && topDose <= Math.floor(params.repRange.max * 1.5), `at the top the dose grows beyond the max, up to 1.5x (got ${topDose})`);

  // loaded exercises step the load up before the rung
  const loadedEq: EquipmentInventory = { dumbbells: { owned: true, weightsKg: [4, 6] } };
  const loadedCtx = (history: SportBlock[]) => makeCtx({ blockId: 'load', blockSeconds: 60, equipment: loadedEq, history, enrolment: enrol('strength', 'microStrength', 3, '2026-03-02') });
  const lb = (v: number, kg: number): SportBlock => {
    const b = step('dumbbellFloorPress', v);
    b.results = [{ stepIndex: 0, done: true, value: v, loadKg: kg }];
    return b;
  };
  const pushCtx = loadedCtx([]);
  check(LADDER_PROGRESSION.dose(CATALOG.exercises.get('dumbbellFloorPress')!, 2, pushCtx, params).loadKg === 4, 'the lightest owned weight first');
  const afterLoad = loadedCtx([lb(12, 4), lb(12, 4)]);
  check(LADDER_PROGRESSION.dose(CATALOG.exercises.get('dumbbellFloorPress')!, 2, afterLoad, params).loadKg === 6, 'two successes at the max take the next owned weight, not the next rung');
  check(LADDER_PROGRESSION.levels(afterLoad, params).get('push') === 2, 'the rung stays while a heavier weight exists');
  const afterTop = loadedCtx([lb(12, 4), lb(12, 4), lb(12, 6), lb(12, 6)]);
  check(LADDER_PROGRESSION.levels(afterTop, params).get('push') === 3, 'with the heaviest weight reached, the rung goes up');

  // fuzz: random histories never skip a rung, never leave the ladder, never rest on a rung the context cannot do
  const rnd = mulberry32(99);
  let fuzzBlocks = 0;
  for (let h = 0; h < 120; h++) {
    const eqKeys = Object.keys(EQUIPMENT_SETS);
    const equipment = EQUIPMENT_SETS[eqKeys[Math.floor(rnd() * eqKeys.length)]!]!;
    const constraints = CONSTRAINT_SETS[Math.floor(rnd() * CONSTRAINT_SETS.length)]!;
    const level = (1 + Math.floor(rnd() * 3)) as 1 | 2 | 3;
    const history: SportBlock[] = [];
    let previous = new Map<string, number>();
    for (let i = 0; i < 40; i++) {
      const ctx = makeCtx({ blockId: 'fz', blockSeconds: 60, equipment, constraints, history, enrolment: enrol('strength', 'microStrength', level, '2026-03-02') });
      const levels = LADDER_PROGRESSION.levels(ctx, params);
      for (const l of CATALOG.ladders.all) {
        const r = levels.get(l.id);
        if (r === undefined) continue;
        check(r >= 0 && r < l.rungs.length, `fuzz: ${l.id} rung ${r} out of range`);
        check(isRungUsable(l, r, ctx), `fuzz: ${l.id} rung ${r} has no available alternative`);
        const before = previous.get(l.id);
        if (before !== undefined && before !== r) {
          const usable = l.rungs.map((_, k) => k).filter((k) => isRungUsable(l, k, ctx));
          check(Math.abs(usable.indexOf(r) - usable.indexOf(before)) === 1, `fuzz: ${l.id} moved ${before} -> ${r} in one block`);
        }
      }
      previous = new Map(levels);
      // next block: a random ladder at its current rung, random outcome
      const ladders = [...levels.keys()];
      const lid = ladders[Math.floor(rnd() * ladders.length)]!;
      const l = CATALOG.ladders.get(lid)!;
      const ex = l.rungs[levels.get(lid)!]!.map((id) => CATALOG.exercises.get(id)!).find((e) => available(e, ctx))!;
      const roll = rnd();
      const value = roll < 0.4 ? 40 : roll < 0.6 ? 1 : 9;
      const b = step(ex.id, value, rnd() < 0.15 ? 'tooEasy' : rnd() < 0.15 ? 'tooHard' : undefined);
      if (rnd() < 0.1) b.kind = 'warmup';
      history.push(b);
      fuzzBlocks++;
    }
  }
  console.log(`  ${fuzzBlocks} fuzzed blocks replayed`);
}

// ---------------------------------------------------------------- 7. runner

function checkRunner(): void {
  section('7. runner');
  let n = 0;
  for (const { plan } of sweepPlans) {
    const segs = timeline(plan);
    check(segs.length > 0 && segs[0]!.start === 0, 'timeline starts at 0');
    check(segs[segs.length - 1]!.end === plan.totalSeconds, 'timeline ends at totalSeconds');
    const order = { prep: 0, work: 1, rest: 2 };
    segs.forEach((s, i) => {
      check(s.end > s.start, 'segments are not empty');
      if (i > 0) {
        const p = segs[i - 1]!;
        check(s.start === p.end, 'no gap between segments');
        check(s.stepIndex > p.stepIndex || (s.stepIndex === p.stepIndex && order[s.phase] > order[p.phase]), 'phases are in order');
      }
    });
    const probes = new Set<number>([0, plan.totalSeconds - 1]);
    for (const s of segs) {
      probes.add(s.start);
      probes.add(s.end - 1);
    }
    let lastIndex = -1;
    for (const e of [...probes].sort((a, b) => a - b)) {
      const st = stepAt(plan, e);
      check(st.phase !== 'done', `stepAt(${e}) is done before the end`);
      check(st.stepRemaining >= 0 && st.stepElapsed >= 0, 'stepAt non-negative');
      check(st.stepIndex >= lastIndex, 'step index never goes back');
      lastIndex = st.stepIndex;
      const seg = segs.find((s) => e >= s.start && e < s.end)!;
      check(seg.phase === st.phase && seg.stepIndex === st.stepIndex && st.stepRemaining === seg.end - e, 'stepAt agrees with the timeline');
      n++;
    }
    const end = stepAt(plan, plan.totalSeconds);
    check(end.phase === 'done' && end.stepRemaining === 0 && end.next === null, 'done at the total');
    check(stepAt(plan, -5).phase === segs[0]!.phase && stepAt(plan, Number.NaN).phase === segs[0]!.phase, 'negative/NaN elapsed clamps to the start');
    const first = stepAt(plan, 0);
    if (first.phase === 'prep') check(first.next === plan.steps[0], 'during prep the next step is the first');
  }
  console.log(`  ${sweepPlans.length} plans, ${n} probes`);
}


// ---------------------------------------------------------------- 8bis. schedule, rest days, fallbacks

function checkScheduleAndFallbacks(): void {
  section('schedule, rest days and fallbacks');
  const program = GOALS.get('strength')!.programs[0]!;
  const start = '2026-03-02';
  check(programWeek(start, start, 6).week === 1 && programWeek(start, '2026-03-08', 6).week === 1 && programWeek(start, '2026-03-09', 6).week === 2, 'programWeek counts 7-day weeks from the start');
  check(programWeek(start, '2026-04-13', 6).week === 1 && programWeek(start, '2026-04-13', 6).cycle === 1, 'the program cycles after its last week');
  check(programWeek(start, '2026-01-01', 6).week === 1, 'a date before the start is week 1');
  check(phaseFor(program, 1).params.repRange.max === 12 && phaseFor(program, 6).params.tempoFactor === 1.6 && phaseFor(program, 99).params.tempoFactor === 1.6, 'phaseFor');

  // five training days this week -> today (a sixth day) is a rest day: mobility, unless forced
  const today = addDays(MONDAY, 5);
  const enrolment = enrol('strength', 'microStrength', 1, addDays(today, -9));
  const history: SportBlock[] = [];
  for (let d = 0; d < 5; d++) {
    const c = makeCtx({ blockId: `rd${d}`, blockSeconds: 120, today: addDays(MONDAY, d), equipment: EQUIPMENT_SETS['all']!, enrolment });
    const g = generate(c, { mode: 'goal', templateId: null }, { enrolment });
    check(g.meta.goalId === 'strength' && !g.meta.restDay, `training day ${d} is a strength block`);
    history.push(toBlock(g.plan, g.meta, c));
  }
  const ctx = makeCtx({ blockId: 'rest', blockSeconds: 120, today, equipment: EQUIPMENT_SETS['all']!, enrolment, history, todayBlocks: [] });
  const rest = generate(ctx, { mode: 'goal', templateId: null }, { enrolment });
  check(rest.meta.restDay === true && rest.meta.goalId === 'mobility', 'a sixth day falls back to mobility');
  assertPlan(rest.plan, ctx, rest.meta, true, 'rest day');
  const forced = generate(makeCtx({ blockId: 'rest', blockSeconds: 120, today, equipment: EQUIPMENT_SETS['all']!, enrolment, history }), { mode: 'goal', templateId: null }, { enrolment }, { forceTrain: true });
  check(forced.meta.goalId === 'strength' && !forced.meta.restDay, 'forceTrain trains the main goal');
  // a day that already has strength work stays a training day
  const again = makeCtx({ blockId: 'again', blockSeconds: 120, today: addDays(MONDAY, 4), equipment: EQUIPMENT_SETS['all']!, enrolment, history, todayBlocks: [history[4]!] });
  check(generate(again, { mode: 'goal', templateId: null }, { enrolment }).meta.goalId === 'strength', 'a day already trained is still a training day');

  // calories week 3 (30:30 circuit), 300 s, bodyweight: the intervals fill the block
  const calEnrol = enrol('calories', 'burnAndMove', 1, addDays(MONDAY, -14));
  const calFirst = makeCtx({ blockId: 'cal0', blockSeconds: 120, enrolment: calEnrol });
  const calDone = toBlock(generate(calFirst, { mode: 'goal', templateId: null }, { enrolment: calEnrol }).plan, { origin: 'goal', goalId: 'calories' }, calFirst);
  const calCtx = makeCtx({ blockId: 'cal1', blockSeconds: 300, enrolment: calEnrol, todayBlocks: [calDone], history: [calDone] });
  const cal = generate(calCtx, { mode: 'goal', templateId: null }, { enrolment: calEnrol });
  check(cal.plan.steps.length >= 5 && cal.plan.steps.slice(0, 5).every((s) => s.workSeconds === 30 && s.restSeconds === (cal.plan.steps.indexOf(s) < 4 ? 30 : s.restSeconds)), `300 s at 30:30 starts with 5 full intervals, got ${stable(cal.plan.steps.map((s) => [s.exerciseId, s.workSeconds, s.restSeconds]))}`);
  const calLast = cal.plan.steps[cal.plan.steps.length - 1]!;
  check(calLast.restSeconds <= 45, `at most 45 s of trailing padding, got ${calLast.restSeconds}`);
  // the idle-gap check must fail on a plan with the original 135 s of padding
  let caught = false;
  try {
    checkNoIdleGap({ kind: 'train', prepSeconds: 15, steps: [...cal.plan.steps.slice(0, 3).map((s, i) => ({ ...s, restSeconds: i < 2 ? 30 : 135 }))], totalSeconds: 300 }, 'regression');
  } catch {
    caught = true;
  }
  check(caught, 'the idle-gap check misses the 135 s case');

  // no enrolment, an unknown goal: mobility, never empty
  for (const e of [null, enrol('nope', 'x', 1, start)]) {
    const c = makeCtx({ blockId: 'noenrol', blockSeconds: 90, enrolment: e });
    const g = generate(c, { mode: 'goal', templateId: null }, { enrolment: e });
    check(g.meta.fallback === 'mobility', 'no goal falls back to mobility');
    assertPlan(g.plan, c, g.meta, true, 'no enrolment');
  }

  // when nothing in the catalog survives: the single march/cat-cow step
  const march = CATALOG.exercises.get('marchInPlace')!;
  const bare = { ...CATALOG, exercises: createRegistry([march]) };
  for (const [mode, e] of [['goal', enrol('strength', 'microStrength', 1, start)], ['goal', enrol('calories', 'burnAndMove', 1, start)], ['free', null]] as const) {
    const c = { ...makeCtx({ blockId: 'bare', blockSeconds: 60, enrolment: e }), catalog: bare };
    const g = generate(c, { mode, templateId: 'random' }, { enrolment: e });
    check(g.plan.steps.length >= 1 && g.plan.totalSeconds <= 60, 'never an empty plan');
    if (mode === 'goal' && e?.goalId === 'strength') check(g.meta.fallback === 'minimal' && g.plan.steps[0]!.exerciseId === 'marchInPlace', 'the minimal fallback is one march step');
  }
  const none = { ...CATALOG, exercises: createRegistry<typeof march>([]) };
  const c0 = { ...makeCtx({ blockId: 'none', blockSeconds: 60 }), catalog: none };
  check(generate(c0, { mode: 'free', templateId: null }, { enrolment: null }).plan.steps.length === 1, 'even an empty catalog yields one step');

  // a test never lands in the first block of the day, and runs once the day has a done block
  const week1 = enrol('strength', 'microStrength', 1, addDays(MONDAY, -2));
  const first = makeCtx({ blockId: 'tf', blockSeconds: 300, equipment: EQUIPMENT_SETS['all']!, enrolment: week1 });
  check(generate(first, { mode: 'goal', templateId: null }, { enrolment: week1 }).plan.kind === 'warmup', 'the first block of the day is a warm-up, not a test');
  const doneToday = toBlock(generate(first, { mode: 'goal', templateId: null }, { enrolment: week1 }).plan, { origin: 'goal', goalId: 'strength' }, first);
  const second = makeCtx({ blockId: 'ts', blockSeconds: 300, equipment: EQUIPMENT_SETS['all']!, enrolment: week1, todayBlocks: [doneToday], history: [doneToday] });
  const t = generate(second, { mode: 'goal', templateId: null }, { enrolment: week1 });
  check(t.plan.kind === 'test' && t.plan.assessmentId === 'strMaxPushUps' && t.meta.assessmentId === 'strMaxPushUps', 'the next block runs the pending test');
  check(t.plan.prepSeconds === 15 && t.plan.steps[0]!.workSeconds === 60, 'a test is prep 15 s and a 60 s step');
  const tooShort = makeCtx({ blockId: 'tshort', blockSeconds: 60, equipment: EQUIPMENT_SETS['all']!, enrolment: week1, todayBlocks: [doneToday], history: [doneToday] });
  check(generate(tooShort, { mode: 'goal', templateId: null }, { enrolment: week1 }).plan.kind !== 'test', 'a test that does not fit the break is not run');
  const mobWeek1 = enrol('mobility', 'deskReset', 1, addDays(MONDAY, -2));
  const mctx = makeCtx({ blockId: 'mt', blockSeconds: 300, enrolment: mobWeek1, todayBlocks: [doneToday], history: [doneToday] });
  const mt = generate(mctx, { mode: 'goal', templateId: null }, { enrolment: mobWeek1 });
  check(mt.plan.kind === 'test' && mt.plan.assessmentId === 'mobDeepSquat', 'mobility week 1 tests the deep squat first');
  const done2 = toBlock(mt.plan, mt.meta, mctx);
  const mctx2 = makeCtx({ blockId: 'mt2', blockSeconds: 300, enrolment: mobWeek1, todayBlocks: [doneToday, done2], history: [doneToday, done2] });
  check(generate(mctx2, { mode: 'goal', templateId: null }, { enrolment: mobWeek1 }).plan.kind !== 'test', 'one test per day');
  const mctx3 = makeCtx({ blockId: 'mt3', blockSeconds: 300, today: addDays(MONDAY, -1), enrolment: mobWeek1, todayBlocks: [{ ...doneToday, date: addDays(MONDAY, -1) }], history: [{ ...done2, date: addDays(MONDAY, -2) }, { ...doneToday, date: addDays(MONDAY, -1) }] });
  check(generate(mctx3, { mode: 'goal', templateId: null }, { enrolment: mobWeek1 }).plan.assessmentId === 'mobKneeToWall', 'a recorded test is not repeated in the same program week');
  const knee = generate(mctx3, { mode: 'goal', templateId: null }, { enrolment: mobWeek1 });
  check(knee.plan.steps.length === 2 && knee.plan.steps[0]!.side === 'left' && knee.plan.steps[1]!.side === 'right', 'a per-side test has a left and a right step');
}

// ---------------------------------------------------------------- 9. sanitize

function checkSanitize(): void {
  section('9. sanitize');
  const samples: SportBlock[] = [];
  for (const [i, { plan }] of sweepPlans.entries()) {
    if (i % 4 !== 0) continue;
    const ctx = makeCtx({ blockId: `san-${i}`, blockSeconds: plan.totalSeconds });
    const b = toBlock(plan, { origin: 'goal', goalId: 'strength', programId: 'microStrength', programWeek: 2 }, ctx, { feedback: i % 3 === 0 ? 'tooEasy' : 'ok' });
    if (i % 2 === 0) b.rpe = 7;
    samples.push(b);
  }
  check(samples.length > 20, 'enough sanitize samples');
  for (const b of samples) {
    const copy = JSON.parse(JSON.stringify(b)) as unknown;
    const clean = sanitizeBlock(copy);
    check(clean && same(clean, b), `sanitizeBlock changed a valid block ${b.id}`);
    const noisy = { ...(copy as object), junk: 1, steps: (b.steps.map((s) => ({ ...s, extra: true }))) };
    check(same(sanitizeBlock(noisy), b), 'unknown keys are dropped');
  }
  const free: SportBlock = { ...samples[0]!, origin: 'free', templateId: 'tpl.deskReset' };
  delete free.goalId;
  delete free.programId;
  delete free.programWeek;
  check(same(sanitizeBlock(JSON.parse(JSON.stringify(free))), free), 'a free block without optional fields is unchanged');

  const garbage: unknown[] = [
    undefined, null, 5, 'x', true, [], {}, { id: 5 }, { id: 'a' }, [samples[0]],
    { ...samples[0]!, steps: new Array(500).fill(samples[0]!.steps[0]) },
    { ...samples[0]!, steps: [] },
    { ...samples[0]!, steps: 'no' },
    { ...samples[0]!, results: new Array(500).fill({ stepIndex: 0, done: true }) },
    { ...samples[0]!, date: 'yesterday' },
    { ...samples[0]!, status: 'great' },
    { ...samples[0]!, kind: 7 },
    { ...samples[0]!, blockSeconds: 'long' },
    { ...samples[0]!, blockSeconds: 1e9, rpe: 99, programWeek: -4, catalogVersion: -1, feedback: 'meh' },
    { ...samples[0]!, steps: [{ exerciseId: 'x'.repeat(200), workSeconds: 1, restSeconds: 1 }] },
    { ...samples[0]!, steps: [{ exerciseId: 'a', workSeconds: 1e9, restSeconds: -5, target: { reps: 1, seconds: 2 }, side: 'up', loadKg: 1e6, round: 0 }] },
    { ...samples[0]!, results: [{ stepIndex: 'a', done: true }, { stepIndex: 1e9, done: true }, { stepIndex: 0, done: 'yes' }, { stepIndex: 0, done: true, value: 1e12 }, null, 3] },
  ];
  for (const g of garbage) {
    const out = sanitizeBlock(g);
    check(out === null || same(sanitizeBlock(JSON.parse(JSON.stringify(out))), out), 'garbage turns into null or a stable valid block');
    if (out) {
      check(out.steps.length >= 1 && out.steps.length <= 120 && out.results.length <= 120, 'sanitized block sizes');
      check(out.blockSeconds >= 1 && out.blockSeconds <= 7200 && (out.rpe === undefined || (out.rpe >= 1 && out.rpe <= 10)), 'sanitized block numbers are clamped');
    }
  }

  for (const t of BUILTIN_TEMPLATES.all) {
    const user: SportTemplate = { ...t, id: `u-${t.id.replace(/\W/g, '')}`, name: t.name };
    delete user.builtin;
    delete user.nameText;
    check(same(sanitizeTemplate(JSON.parse(JSON.stringify(user))), user), `sanitizeTemplate changed ${t.id}`);
    check(same(sanitizeTemplate({ ...t }), { ...user, id: t.id }), 'built-in marks are dropped');
  }
  const badTemplates: unknown[] = [null, 1, {}, { id: 'a', name: '', slots: [], format: 'sequence' }, { id: 'a', name: 'x', slots: [{}], format: 'sequence' }, { id: 'a', name: 'x', slots: new Array(99).fill({ exerciseId: 'plank' }), format: 'sequence' }, { id: 'a', name: 'x', slots: [{ exerciseId: 'plank' }], format: 'weird' }, { id: 'a', name: 'x', slots: [{ exerciseId: 'plank', dose: { reps: 5, seconds: 5 } }], format: 'emom', workSeconds: 1e9, restSeconds: -1, order: 'x' }];
  for (const g of badTemplates) {
    const out = sanitizeTemplate(g);
    check(out === null || same(sanitizeTemplate(JSON.parse(JSON.stringify(out))), out), 'garbage template becomes null or a stable valid one');
    if (out) check(out.slots.length >= 1 && out.slots.length <= 40, 'template slot count');
  }

  const defaults = defaultSettings();
  check(same(sanitizeSettings(undefined), defaults) && same(sanitizeSettings(JSON.parse(JSON.stringify(defaults))), defaults), 'default settings are unchanged');
  const custom = {
    ...defaults,
    enrolment: enrol('strength', 'microStrength', 2, '2026-03-02'),
    cadenceId: 'custom',
    customCadence: { focusSeconds: 900, breakSeconds: 180, exerciseEvery: 2, longBreak: { every: 3, seconds: 600 } },
    equipment: EQUIPMENT_SETS['all']!,
    constraints: { lowImpact: true, noFloor: false },
    skin: 'powerYoga',
    skinWholeApp: false,
    cues: false,
    autoStartBreak: true,
    disclaimerAcceptedAt: 1_700_000_000_000,
    enabled: true,
    setupDoneAt: 1_700_000_100_000,
  };
  check(same(sanitizeSettings(JSON.parse(JSON.stringify(custom))), custom), 'valid custom settings are unchanged');
  check(sanitizeSettings({ disclaimerAcceptedAt: 0 }).disclaimerAcceptedAt === undefined && sanitizeSettings({ disclaimerAcceptedAt: 'x' }).disclaimerAcceptedAt === undefined && sanitizeSettings({ disclaimerAcceptedAt: -5 }).disclaimerAcceptedAt === undefined, 'disclaimerAcceptedAt must be a positive number');
  check(sanitizeSettings({ enabled: false }).enabled === false && sanitizeSettings({ enabled: true }).enabled === true, 'a boolean enabled is kept (false too)');
  check(!('enabled' in sanitizeSettings(undefined)) && !('enabled' in sanitizeSettings({})) && !('setupDoneAt' in sanitizeSettings({})), 'enabled and setupDoneAt are only set when stored');
  check(sanitizeSettings({ enabled: 'yes' }).enabled === undefined && sanitizeSettings({ enabled: 1 }).enabled === undefined && sanitizeSettings({ enabled: null }).enabled === undefined, 'enabled must be a boolean');
  check(sanitizeSettings({ setupDoneAt: 0 }).setupDoneAt === undefined && sanitizeSettings({ setupDoneAt: 'x' }).setupDoneAt === undefined && sanitizeSettings({ setupDoneAt: -5 }).setupDoneAt === undefined && sanitizeSettings({ setupDoneAt: 1_700_000_000_000 }).setupDoneAt === 1_700_000_000_000, 'setupDoneAt must be a positive number');
  {
    // The read-time fallback of existing users (src/lib/sportask-defaults.ts).
    const enrolled = enrol('strength', 'microStrength', 1, '2026-03-02');
    const sw = (raw: unknown, used = false): string => JSON.stringify(sportaskSwitch(raw, used));
    const off = JSON.stringify({ enabled: false, setupDone: false });
    const on = JSON.stringify({ enabled: true, setupDone: true });
    check(sw(undefined) === off && sw(null) === off && sw({}) === off && sw(defaults) === off && sw([]) === off, 'new users start off and not set up');
    check(sw({ enrolment: enrolled }) === on && sw(undefined, true) === on && sw({}, true) === on, 'an enrolment, a block or a session without `enabled` means on and set up');
    check(sw({ enabled: false, enrolment: enrolled }, true) === JSON.stringify({ enabled: false, setupDone: false }), 'an explicit false wins over the fallback');
    check(sw({ enabled: false, setupDoneAt: 5 }, true) === JSON.stringify({ enabled: false, setupDone: true }) && sw({ enabled: true, setupDoneAt: 5 }) === on, 'setupDoneAt marks the setup as done');
    check(sw({ enabled: true }) === JSON.stringify({ enabled: true, setupDone: false }) && sw({ enabled: true, enrolment: enrolled }, true) === JSON.stringify({ enabled: true, setupDone: false }), 'an explicit true is on but not set up until setupDoneAt');
    check(sw({ enrolment: null }) === off, 'a null enrolment does not count');
  }
  for (const g of [null, 5, 'x', [], { enrolment: 5, cadenceId: 7, equipment: [], constraints: 'a', customCadence: { focusSeconds: 'a' } }, { equipment: { band: 5, 'bad key!': { owned: true }, kettlebell: { owned: 'yes', weightsKg: [-1, 'a', 1e9, 12, 12] } }, customCadence: { focusSeconds: 1, breakSeconds: 1e9, exerciseEvery: 99, longBreak: { every: 1, seconds: 1 } } }]) {
    const out = sanitizeSettings(g);
    check(same(sanitizeSettings(JSON.parse(JSON.stringify(out))), out), 'garbage settings become stable valid settings');
    check(out.customCadence === undefined || (out.customCadence.focusSeconds >= 300 && out.customCadence.breakSeconds <= 3600 && out.customCadence.exerciseEvery <= 8), 'custom cadence clamped');
  }
  console.log(`  ${samples.length} blocks round-tripped`);
}

// ---------------------------------------------------------------- 8. sync codecs

/** What Postgres JSONB does to an object: keys come back ordered by length, then alphabetically. */
function jsonbOrder(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(jsonbOrder);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map((k) => [k, jsonbOrder(o[k])]));
  }
  return v;
}
/** The same, with the keys shuffled by a seeded rng (any order must hash alike). */
function shuffled(v: unknown, rng: () => number): unknown {
  if (Array.isArray(v)) return v.map((x) => shuffled(x, rng));
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).map((k) => [k, rng()] as const).sort((a, b) => a[1] - b[1]).map(([k]) => k);
    return Object.fromEntries(keys.map((k) => [k, shuffled(o[k], rng)]));
  }
  return v;
}
/** The backend answers `null` for every optional column and key that is unset. */
function withNulls(v: unknown, optional: readonly string[]): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const o: Record<string, unknown> = { ...(v as Record<string, unknown>) };
  for (const k of optional) if (!(k in o)) o[k] = null;
  return o;
}
const BLOCK_OPTIONAL = ['goalId', 'programId', 'programWeek', 'templateId', 'assessmentId', 'rpe', 'feedback'];
const STEP_OPTIONAL = ['target', 'side', 'loadKg', 'round'];
const RESULT_OPTIONAL = ['value', 'loadKg'];
const SLOT_OPTIONAL = ['exerciseId', 'pattern', 'tag', 'zone', 'maxLevel', 'dose'];
const TEMPLATE_OPTIONAL = ['workSeconds', 'restSeconds', 'minSeconds'];

function blockViaServer(wire: Record<string, unknown>, mode: 'shuffle' | 'jsonb', rng: () => number): SportBlockWire {
  const nulled = withNulls(wire, BLOCK_OPTIONAL) as Record<string, unknown>;
  nulled['steps'] = (wire['steps'] as unknown[]).map((x) => withNulls(x, STEP_OPTIONAL)).map((x) => (x as Record<string, unknown>)['target'] ? { ...(x as object), target: withNulls((x as Record<string, unknown>)['target'], ['reps', 'seconds']) } : x);
  nulled['results'] = (wire['results'] as unknown[]).map((x) => withNulls(x, RESULT_OPTIONAL));
  const ordered = mode === 'shuffle' ? shuffled(nulled, rng) : jsonbOrder(nulled);
  return { ...(JSON.parse(JSON.stringify(ordered)) as object), updatedAt: 5, deleted: false } as SportBlockWire;
}
function templateViaServer(wire: Record<string, unknown>, mode: 'shuffle' | 'jsonb', rng: () => number): SportTemplateWire {
  const nulled = withNulls(wire, TEMPLATE_OPTIONAL) as Record<string, unknown>;
  nulled['slots'] = (wire['slots'] as unknown[]).map((x) => withNulls(x, SLOT_OPTIONAL));
  const ordered = mode === 'shuffle' ? shuffled(nulled, rng) : jsonbOrder(nulled);
  return { ...(JSON.parse(JSON.stringify(ordered)) as object), updatedAt: 5, deleted: false } as SportTemplateWire;
}

function checkCodecs(): void {
  section('8. sync codecs');
  const hashBlock = hashWith(sportBlockCodec.toWire);
  const hashTemplate = hashWith(sportTemplateCodec.toWire);
  const rng = mulberry32(8);

  const blocks: SportBlock[] = [];
  for (const [i, { plan }] of sweepPlans.entries()) {
    if (i % 3 !== 0) continue;
    const ctx = makeCtx({ blockId: `codec-${i}`, blockSeconds: plan.totalSeconds });
    const meta: BlockMeta = i % 2 === 0 ? { origin: 'goal', goalId: 'strength', programId: 'microStrength', programWeek: 3 } : { origin: 'free', templateId: 'tpl.deskReset' };
    blocks.push(toBlock(plan, meta, ctx, { feedback: i % 5 === 0 ? 'tooHard' : undefined }));
  }
  // Every optional set, zero values included (0 is a real load, value and rest).
  const full: SportBlock = {
    id: 'full', startedAt: 1, date: '2026-03-02', origin: 'goal', goalId: 'g', programId: 'p', programWeek: 1, templateId: 't', kind: 'test',
    assessmentId: 'a', blockSeconds: 600, prepSeconds: 0,
    steps: [{ exerciseId: 'plank', workSeconds: 30, restSeconds: 0, target: { seconds: 30 }, side: 'left', loadKg: 0, round: 1 }, { exerciseId: 'squat', workSeconds: 20, restSeconds: 10, target: { reps: 12 } }],
    results: [{ stepIndex: 0, done: true, value: 0, loadKg: 0 }, { stepIndex: 1, done: false }],
    status: 'partial', rpe: 10, feedback: 'ok', catalogVersion: 0, createdAt: 1, updatedAt: 1,
  };
  blocks.push(full);
  check(blocks.length > 20, 'enough codec samples');

  for (const b of blocks) {
    const wire = sportBlockCodec.toWire(b) as unknown as Record<string, unknown>;
    const h = hashBlock(b);
    for (const mode of ['shuffle', 'jsonb'] as const) {
      const back = sportBlockCodec.fromWire(blockViaServer(wire, mode, rng));
      check(hashBlock(back) === h, `block ${b.id}: hash survives the ${mode} round trip`);
      check(JSON.stringify(sportBlockCodec.toWire(back)) === JSON.stringify(wire), `block ${b.id}: wire form is stable (${mode})`);
    }
    for (const k of ['goalId', 'programId', 'programWeek', 'templateId', 'assessmentId', 'rpe', 'feedback'] as const) {
      check((b[k] === undefined) === !(k in wire), `block ${b.id}: ${k} on the wire only when set`);
    }
    (wire['steps'] as Record<string, unknown>[]).forEach((step, n) => {
      for (const k of STEP_OPTIONAL) check((b.steps[n] as unknown as Record<string, unknown>)[k] === undefined ? !(k in step) : step[k] != null, `step ${k} on the wire only when set`);
    });
    (wire['results'] as Record<string, unknown>[]).forEach((r, n) => {
      for (const k of RESULT_OPTIONAL) check((b.results[n] as unknown as Record<string, unknown>)[k] === undefined ? !(k in r) : r[k] != null, `result ${k} on the wire only when set`);
    });
  }
  const bare: SportBlock = { ...full, id: 'bare', kind: 'train', status: 'done', steps: [{ exerciseId: 'plank', workSeconds: 30, restSeconds: 5 }], results: [{ stepIndex: 0, done: true }] };
  for (const k of ['goalId', 'programId', 'programWeek', 'templateId', 'assessmentId', 'rpe', 'feedback'] as const) delete bare[k];
  const bareWire = sportBlockCodec.toWire(bare) as unknown as Record<string, unknown>;
  check(Object.keys(bareWire).join() === 'id,startedAt,date,origin,kind,blockSeconds,prepSeconds,steps,results,status,catalogVersion,createdAt', 'a block without optionals has none of their keys');
  check(Object.keys((bareWire['steps'] as object[])[0]!).join() === 'exerciseId,workSeconds,restSeconds', 'a step without optionals has none of their keys');
  check(Object.keys((bareWire['results'] as object[])[0]!).join() === 'stepIndex,done', 'a result without optionals has none of their keys');
  check(sportBlockCodec.fromWire({ ...(sportBlockCodec.tombstone('x') as object), updatedAt: 1, deleted: true } as SportBlockWire).id === 'x', 'block tombstone reads back');

  let templates = 0;
  for (const t of BUILTIN_TEMPLATES.all) {
    const user: SportTemplate = { ...t, id: `u-${t.id.replace(/\W/g, '')}` };
    delete user.builtin;
    delete user.nameText;
    const wire = sportTemplateCodec.toWire(user) as unknown as Record<string, unknown>;
    for (const mode of ['shuffle', 'jsonb'] as const) {
      const back = sportTemplateCodec.fromWire(templateViaServer(wire, mode, rng));
      check(hashTemplate(back) === hashTemplate(user), `template ${t.id}: hash survives the ${mode} round trip`);
      check(JSON.stringify(sportTemplateCodec.toWire(back)) === JSON.stringify(wire), `template ${t.id}: wire form is stable (${mode})`);
    }
    for (const k of TEMPLATE_OPTIONAL) check((user[k as 'workSeconds'] === undefined) === !(k in wire), `template ${t.id}: ${k} on the wire only when set`);
    (wire['slots'] as Record<string, unknown>[]).forEach((slot, n) => {
      for (const k of SLOT_OPTIONAL) check((user.slots[n] as unknown as Record<string, unknown>)[k] === undefined ? !(k in slot) : slot[k] != null, 'slot keys on the wire only when set');
    });
    templates++;
  }
  const mixed: SportTemplate = { id: 'mixed', name: 'm', format: 'intervals', workSeconds: 40, restSeconds: 0, minSeconds: 0, order: 1, createdAt: 1, updatedAt: 1, slots: [{ exerciseId: 'plank', dose: { seconds: 40 } }, { pattern: 'core', tag: 'strength', zone: 'hips', maxLevel: 2 }, { exerciseId: 'squat' }] };
  const mixedWire = sportTemplateCodec.toWire(mixed) as unknown as Record<string, unknown>;
  check('restSeconds' in mixedWire && 'minSeconds' in mixedWire, 'zero rest and min seconds are kept');
  check(hashTemplate(sportTemplateCodec.fromWire(templateViaServer(mixedWire, 'jsonb', rng))) === hashTemplate(mixed), 'mixed slots round trip');
  console.log(`  ${blocks.length} blocks and ${templates + 1} templates hash identically after a shuffled / JSONB-ordered round trip`);
}

// ---------------------------------------------------------------- 10. kcal

function checkKcal(): void {
  section('10. net kcal');
  const mk = (work: number, done = true): SportBlock => ({
    id: 'k', startedAt: 1, date: '2026-03-02', origin: 'free', kind: 'train', blockSeconds: 300, prepSeconds: 10,
    steps: [{ exerciseId: 'burpee', workSeconds: work, restSeconds: 10 }], results: [{ stepIndex: 0, done }], status: 'done', catalogVersion: 1, createdAt: 1, updatedAt: 1,
  });
  check(netKcal(mk(60), CATALOG, null) === 0 && netKcal(mk(60), CATALOG, 0) === 0 && netKcal(mk(60), CATALOG, undefined) === 0, 'no weight, no kcal');
  const a = netKcal(mk(30), CATALOG, 70);
  const b = netKcal(mk(60), CATALOG, 70);
  const c = netKcal(mk(90), CATALOG, 70);
  check(a > 0 && b > a && c > b, 'kcal grows with work seconds');
  check(Math.abs(b - (MET.vigorousCal - 1) * 70 * (60 / 3600)) < 1e-9, 'kcal follows (MET - 1) x kg x hours');
  check(netKcal(mk(60, false), CATALOG, 70) === 0, 'steps not done add nothing');
  check(netKcal(mk(60), CATALOG, 80) > netKcal(mk(60), CATALOG, 70), 'kcal grows with weight');
}

// ---------------------------------------------------------------- 11. panel: metrics, charts, results rows

type StepSpec = [exerciseId: string, work: number, rest: number, done: boolean, value?: number, side?: 'left' | 'right'];

function panelBlock(id: string, day: number, status: SportBlock['status'], o: { kind?: SportBlock['kind']; goalId?: string; assessmentId?: string; steps: StepSpec[]; origin?: SportBlock['origin'] }): SportBlock {
  const date = addDays(MONDAY, day);
  const steps: BlockStep[] = o.steps.map(([exerciseId, workSeconds, restSeconds, , , side]) => ({ exerciseId, workSeconds, restSeconds, ...(side ? { side } : {}) }));
  const results: StepResult[] = status === 'skipped' ? [] : o.steps.map(([, , , done, value], stepIndex) => ({ stepIndex, done, ...(value !== undefined ? { value } : {}) }));
  const startedAt = Date.parse(`${date}T10:00:00Z`);
  return {
    id, startedAt, date, origin: o.origin ?? 'goal', ...(o.goalId ? { goalId: o.goalId } : {}), kind: o.kind ?? 'train', ...(o.assessmentId ? { assessmentId: o.assessmentId } : {}),
    blockSeconds: 300, prepSeconds: 10, steps, results, status, catalogVersion: CATALOG_VERSION, createdAt: startedAt, updatedAt: startedAt,
  };
}

function checkPanel(): void {
  section('11. panel: metrics, charts and result rows');
  const W0 = 0;
  const W1 = 7;
  const W2 = 14;
  // Three weeks, by hand (day numbers count from Monday of week 0).
  const blocks: SportBlock[] = [
    panelBlock('A', W0 + 0, 'done', { goalId: 'strength', steps: [['pushUp', 30, 10, true, 10], ['airSquat', 30, 0, true]] }),
    panelBlock('B', W0 + 2, 'partial', { goalId: 'strength', steps: [['plank', 40, 5, true, 40], ['plank', 40, 0, false]] }),
    panelBlock('C', W0 + 3, 'skipped', { goalId: 'strength', steps: [['airSquat', 30, 0, false]] }),
    panelBlock('X1', W1 + 0, 'done', { goalId: 'strength', steps: [['wallPushUp', 30, 0, true, 12]] }),
    panelBlock('X2', W1 + 1, 'done', { goalId: 'strength', steps: [['wallPushUp', 30, 0, true, 12]] }),
    panelBlock('D', W1 + 1, 'done', { kind: 'test', goalId: 'mobility', assessmentId: 'mobKneeToWall', steps: [['kneeToWall', 60, 0, true, 8, 'left'], ['kneeToWall', 60, 0, true, 6, 'right']] }),
    panelBlock('E', W1 + 4, 'done', { goalId: 'mobility', steps: [['chinTucks', 30, 0, true], ['deepSquatHold', 30, 0, true], ['standingHipCars', 30, 0, true, undefined, 'left'], ['standingHipCars', 30, 0, true, undefined, 'right']] }),
    panelBlock('G', W1 + 2, 'done', { kind: 'test', goalId: 'mobility', assessmentId: 'mobToeTouch', steps: [['heelUpHamstringStretch', 30, 0, true, 20]] }),
    panelBlock('I', W1 + 0, 'done', { goalId: 'calories', steps: [['burpee', 30, 30, true], ['jumpingJack', 30, 30, true], ['marchInPlace', 30, 120, true]] }),
    panelBlock('J', W1 + 2, 'done', { goalId: 'calories', steps: [['jumpingJack', 20, 40, true], ['burpee', 20, 40, false], ['marchInPlace', 20, 0, true]] }),
    panelBlock('F', W2 + 1, 'done', { kind: 'test', goalId: 'mobility', assessmentId: 'mobKneeToWall', steps: [['kneeToWall', 60, 0, true, 10, 'left'], ['kneeToWall', 60, 0, true, 9, 'right']] }),
    panelBlock('H', W2 + 2, 'done', { kind: 'test', goalId: 'mobility', assessmentId: 'mobToeTouch', steps: [['heelUpHamstringStretch', 30, 0, true, 12]] }),
  ];
  const strengthEnrol = enrol('strength', 'microStrength', 1, MONDAY);
  const env: MetricEnv = { catalog: CATALOG, weightKg: 70, enrolment: strengthEnrol, equipment: {}, constraints: CONSTRAINT_SETS[0]!, };
  const range = { from: MONDAY, to: addDays(MONDAY, 20) };
  const run = (id: string, e: Partial<MetricEnv> = {}, r = range) => METRICS.get(id)!.compute(blocks, r, { ...env, ...e });
  const group = (s: ReturnType<typeof run>, id: string) => s.groups.find((g) => g.id === id)?.values;
  const near = (a: ReadonlyArray<number | null> | undefined, b: ReadonlyArray<number | null>, label: string): void => {
    check(a && a.length === b.length && a.every((v, i) => (v === null ? b[i] === null : b[i] !== null && Math.abs(v - b[i]!) < 1e-9)), `${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  };
  const week = (n: number): string => addDays(MONDAY, n * 7);

  for (const id of ['adherence', 'activeMinutes', 'netKcal', 'heatmap', 'setsPerPattern', 'ladderLevel', 'zonesCovered', 'density', ...CATALOG.assessments.all.map((a) => `assessment:${a.id}`)]) check(METRICS.get(id), `metric ${id} is registered`);
  for (const g of GOALS.all) for (const id of g.metricIds) check(METRICS.get(id), `${g.id}: unknown metric ${id}`);

  const adherence = run('adherence');
  check(same(adherence.keys, [week(0), week(1), week(2)]), 'adherence: one key per week');
  near(group(adherence, 'done'), [1, 7, 2], 'adherence done');
  near(group(adherence, 'partial'), [1, 0, 0], 'adherence partial');
  near(group(adherence, 'skipped'), [1, 0, 0], 'adherence skipped');

  const minutes = run('activeMinutes');
  near(group(minutes, 'minutes'), [100 / 60, 460 / 60, 150 / 60], 'active minutes');
  check(minutes.targets === undefined, 'no target without the calories program');
  const withTarget = run('activeMinutes', { enrolment: enrol('calories', 'burnAndMove', 1, MONDAY) });
  check(same(withTarget.targets, [45, 45, 60]), `the calories target follows the phases: ${JSON.stringify(withTarget.targets)}`);
  near(group(run('activeMinutes', {}, { from: addDays(MONDAY, 8), to: addDays(MONDAY, 20) }), 'minutes'), [(460 - 30 - 90) / 60, 150 / 60], 'a range starting inside a week drops the earlier days (the push-up and the circuit of day 7)');

  const kcal = (b: SportBlock): number => b.steps.reduce((t, s, i) => (b.results.some((r) => r.stepIndex === i && r.done) ? t + (CATALOG.exercises.get(s.exerciseId)!.met - 1) * 70 * (s.workSeconds / 3600) : t), 0);
  const week0Kcal = kcal(blocks[0]!) + kcal(blocks[1]!);
  near(group(run('netKcal'), 'kcal')?.slice(0, 1), [week0Kcal], 'net kcal of week 0 (MET - 1) x kg x hours');
  const noWeight = run('netKcal', { weightKg: null });
  check(noWeight.missing === 'weight' && group(noWeight, 'kcal')!.every((v) => v === 0), 'net kcal without a weight is flagged, not guessed');

  const heat = run('heatmap');
  check(heat.keys.length === 21 && heat.keys[0] === MONDAY, 'heatmap: one key per day');
  near([0, 2, 3, 7, 8, 9, 11, 15, 16, 4].map((d) => group(heat, 'blocks')![d]!), [1, 1, 0, 2, 2, 2, 1, 1, 1, 0], 'heatmap: blocks counted per day, skipped ones not');

  const sets = run('setsPerPattern');
  near(group(sets, 'push'), [1, 2, 0], 'sets: push-ups, then two wall push-ups');
  near(group(sets, 'squat'), [1, 0, 0], 'sets: a skipped block adds none');
  near(group(sets, 'core'), [1, 0, 0], 'sets: only the plank that was done');
  near(group(sets, 'mobility'), [0, 3, 0], 'sets: the two sides of a hip circle are one set, tests add none');

  const zones = run('zonesCovered');
  near(group(zones, 'neck'), [0, 1, 0], 'zones: neck');
  near(group(zones, 'hips'), [0, 1, 0], 'zones: hips counts once for a block with two hip moves');
  near(group(zones, 'ankles'), [0, 1, 0], 'zones: ankles (tests do not count)');

  const dens = run('density');
  near(group(dens, 'density'), [null, (130 / 230) * 100, null], 'density: the last step rest is padding and not-done steps are left out');

  const ladder = run('ladderLevel');
  near(group(ladder, 'push'), [1, 2, 2], 'ladder: two perfect blocks of wall push-ups move up one rung');
  near(group(ladder, 'squat'), [1, 1, 1], 'ladder: a rung not worked stays');
  check(run('ladderLevel', { enrolment: null }).groups.length === 0, 'ladder without a program: nothing');

  const knee = run('assessment:mobKneeToWall');
  check(same(knee.keys, [addDays(MONDAY, 8), addDays(MONDAY, 15)]), 'assessment: one key per test day');
  near(group(knee, 'left'), [8, 10], 'assessment left');
  near(group(knee, 'right'), [6, 9], 'assessment right');
  const left = knee.groups.find((g) => g.id === 'left')!.summary!;
  check(left.first === 8 && left.last === 10 && left.best === 10 && left.delta === 2 && left.improved === true, 'assessment summary: higher is better');
  check(same(knee.exerciseIds, ['kneeToWall']), 'assessment: the exercise used');
  const toe = run('assessment:mobToeTouch');
  const t = toe.groups[0]!.summary!;
  check(toe.groups[0]!.id === 'value' && t.first === 20 && t.last === 12 && t.best === 12 && t.delta === -8 && t.improved === true, 'assessment summary: lower is better');
  const late = run('assessment:mobKneeToWall', {}, { from: addDays(MONDAY, 10), to: addDays(MONDAY, 20) });
  check(same(late.keys, [addDays(MONDAY, 15)]) && late.groups[0]!.summary!.first === 8, 'a range narrows the points, the summary keeps the first test');
  check(run('assessment:strPlank').groups.length === 0, 'an assessment never taken has no series');

  const stats = weekStats(blocks, addDays(MONDAY, 17), CATALOG, 70);
  check(stats.counted === 2 && stats.offered === 2 && Math.abs(stats.activeMinutes - 2.5) < 1e-9 && stats.streak === 2 && Math.abs(stats.kcal! - (kcal(blocks[10]!) + kcal(blocks[11]!))) < 1e-9, `week stats: ${JSON.stringify(stats)}`);
  check(weekStats(blocks, addDays(MONDAY, 17), CATALOG, null).kcal === null, 'week stats: no kcal without a weight');
  check(weekStats(blocks, addDays(MONDAY, 9), CATALOG, 70).streak === 3, 'a streak that includes today (days 7 to 9)');
  const w0 = weekStats(blocks, addDays(MONDAY, 3), CATALOG, 70);
  check(w0.counted === 2 && w0.offered === 3, 'week stats: offered includes the skipped block');

  const prs = personalRecords(blocks, CATALOG);
  const pr = (id: string, metric: string) => prs.find((r) => r.exerciseId === id && r.metric === metric);
  check(prs.length === 3 && pr('wallPushUp', 'reps')?.value === 12 && pr('wallPushUp', 'reps')?.date === addDays(MONDAY, 7) && pr('plank', 'seconds')?.value === 40 && pr('pushUp', 'reps')?.value === 10, `personal records: ${JSON.stringify(prs)}`);

  // charts
  const ticks = niceTicks(0, 7);
  check(same(ticks.values, [0, 2, 4, 6, 8]) && ticks.max === 8 && niceTicks(0, 0).max > 0 && niceTicks(3, 3).values.length >= 2, 'nice ticks');
  const plot = plotOf(200, 100, { left: 0, right: 0, top: 0, bottom: 0 });
  const rects = barRects({ plot, groups: [[1, 2], [3, 0]], stacked: true, max: 4 });
  check(rects.length === 3, 'stacked bars skip zero values');
  const stack0 = rects.filter((r) => r.index === 0);
  check(Math.abs(stack0[0]!.height - 25) < 1e-9 && Math.abs(stack0[1]!.height - 75) < 1e-9 && Math.abs(stack0[1]!.y + stack0[1]!.height - stack0[0]!.y) < 1e-9, 'a stack is as tall as the sum');
  check(barMax([[1, 2], [3, 0]], true, [null, 5]) === 5 && barMax([[1, 2], [3, 0]], false) === 3, 'bar axis maximum');
  check(barRects({ plot, groups: [[1, 2], [2, 1]], stacked: false, max: 2 }).every((r, _, all) => r.width < 100 && all.length === 4), 'grouped bars share the slot');
  check(linePath([{ x: 0, y: 0 }, { x: 10, y: 10 }, null, { x: 30, y: 30 }]) === 'M0 0L10 10M30 30', 'a null breaks the line');
  check(linePath([{ x: 0, y: 5 }, { x: 10, y: 1 }], true) === 'M0 5H10V1', 'a stepped line holds its value');
  check(targetPath(plot, [2, 2, null, 4], 4) === 'M0 50H50H100M150 0H200' && targetPath(plot, [null, null], 4) === '', 'target path');
  const x = timeScaleX(['2026-03-02', '2026-03-12'], plotOf(100, 50, { left: 0, right: 0, top: 0, bottom: 0 }));
  check(x('2026-03-02') < x('2026-03-07') && x('2026-03-07') < x('2026-03-12') && Math.abs(x('2026-03-07') - 50) < 1e-9, 'time scale is proportional to days');
  check(heatLevel(0, 4) === 0 && heatLevel(1, 4) === 1 && heatLevel(4, 4) === 4 && heatLevel(1, 1) === 4, 'heat levels');
  const layout = heatLayout(heat.keys, heat.groups[0]!.values);
  check(layout.cols === 3 && layout.cells[0]!.col === 0 && layout.cells[0]!.row === 0 && layout.cells[8]!.col === 1 && layout.cells[8]!.row === 1 && layout.cells[20]!.row === 6, 'the heat grid is weeks by weekdays');

  // result rows (the Results form and "Edit marks")
  const name = (id: string): string => CATALOG.exercises.get(id)?.name.en ?? id;
  const rows = rowsFromBlock(blocks[1]!, CATALOG, name);
  check(rows.length === 2 && rows[0]!.done && rows[0]!.value === 40 && !rows[1]!.done && rows[1]!.metric === 'seconds', 'rows follow the stored results');
  check(statusFromRows(rows) === 'partial' && statusFromRows(rows.map((r) => ({ ...r, done: true }))) === 'done' && statusFromRows(rows.map((r) => ({ ...r, done: false }))) === 'skipped', 'status from the ticked rows');
  check(same(resultsFromRows(rows), blocks[1]!.results), 'rows turn back into the same results');
  const skippedRows = rowsFromBlock(blocks[2]!, CATALOG, name);
  check(skippedRows.length === 1 && !skippedRows[0]!.done && resultsFromRows(skippedRows)[0]!.done === false, 'a skipped block starts with every row undone');
  const rounds: SportBlock = { ...panelBlock('R', 0, 'done', { steps: [['pushUp', 30, 5, true, 8], ['airSquat', 30, 5, true, 10], ['pushUp', 30, 0, true, 9]] }) };
  rounds.steps = rounds.steps.map((s, i) => ({ ...s, round: i < 2 ? 1 : 2 }));
  const grouped = rowsFromBlock(rounds, CATALOG, name);
  check(grouped.length === 2 && same(grouped[0]!.indexes, [0, 2]), 'a circuit repeated in rounds is one row per exercise');
  const edited = grouped.map((r) => (r.key === grouped[0]!.key ? { ...r, value: 11 } : r));
  check(resultsFromRows(edited).filter((r) => r.value === 11).length === 2, 'an edited value is written to every round');
  const testRows = rowsFromBlock(blocks[5]!, CATALOG, name);
  check(testRows.length === 2 && testRows[0]!.metric === 'cm' && testRows[1]!.side === 'right' && testRows[1]!.value === 6 && !testRows[0]!.loadable, 'a test row uses the assessment metric');
  console.log('  metrics, summary, personal records, chart geometry and result rows match the hand-computed sample');
}

// ---------------------------------------------------------------- run

try {
  checkRegistries();
  sweepGoals();
  sweepFree();
  checkDeterminism();
  checkStrengthDay();
  progressionChecks();
  checkScheduleAndFallbacks();
  checkRunner();
  checkCodecs();
  checkSanitize();
  checkKcal();
  checkPanel();
  console.log(`\ncheck:sportask OK (${assertions} assertions)`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  proc.exitCode = 1;
}
