import type { Constraints, EquipmentInventory, SportBlock } from '../../../types/sportask';
import { allGear } from './preview';
import type { GenerationContext } from '../engine/context';
import { available } from '../engine/filter';
import { generate } from '../engine/generate';
import { rngFor } from '../engine/rng';
import { addDays } from '../../dates';
import type { LayeredContent } from './merge';
import type { Issue } from './validate';

/**
 * The generation sweep (docs/sportask/DIRECTOR.md section 2.5): the real `generate` over a layered catalog, for every goal x program
 * phase x block length x equipment set x constraint set, and every template. It must never return an empty plan, never use an
 * exercise the user cannot do in that context, and never overflow the break. Pure and deterministic. A fall-back to the mobility
 * block (with all the gear and no constraints) is only a warning.
 */
export interface SmokeReport {
  runs: number;
  issues: Issue[];
}

const TODAY = '2026-03-04'; // a Wednesday
const LENGTHS = [30, 60, 120, 300, 600, 1500];
const CONSTRAINTS: Constraints[] = [
  { lowImpact: false, noFloor: false },
  { lowImpact: true, noFloor: false },
  { lowImpact: false, noFloor: true },
  { lowImpact: true, noFloor: true },
];

const label = (c: Constraints): string => [c.lowImpact ? 'low impact' : '', c.noFloor ? 'no floor' : ''].filter(Boolean).join(' + ') || 'no limits';

export function smokeTest(content: LayeredContent): SmokeReport {
  const NOW = Date.parse(`${TODAY}T10:00:00Z`);
  const done: SportBlock = {
    id: 'sweep-done', startedAt: NOW - 3_600_000, date: TODAY, origin: 'goal', kind: 'train', blockSeconds: 60, prepSeconds: 0, steps: [], results: [],
    status: 'done', catalogVersion: 0, createdAt: NOW, updatedAt: NOW,
  };
  const gear: [string, EquipmentInventory][] = [['no equipment', {}], ['all equipment', allGear(content)]];
  const found = new Map<string, { issue: Issue; count: number }>();
  let runs = 0;

  const note = (severity: Issue['severity'], code: string, key: string, params: Record<string, string | number>): void => {
    const k = `${code}|${key}`;
    const hit = found.get(k);
    if (hit) hit.count++;
    else found.set(k, { issue: { severity, section: 'sweep', code, params: { ...params, count: 1 } }, count: 1 });
  };

  const run = (where: string, key: string, session: Parameters<typeof generate>[1], enrolment: GenerationContext['enrolment'], length: number, equipment: EquipmentInventory, constraints: Constraints, warm: boolean, strictFallback: boolean): void => {
    const todayBlocks = warm ? [] : [done];
    const ctx: GenerationContext = {
      blockId: `sweep-${runs}`, blockSeconds: length, now: NOW, today: TODAY, catalog: content.catalog, goals: content.goals, templates: content.templates,
      equipment, constraints, history: todayBlocks, todayBlocks, enrolment, rng: rngFor(`sweep-${runs}`),
    };
    runs++;
    const detail = `${where}, ${length}s, ${label(constraints)}`;
    try {
      const { plan, meta } = generate(ctx, session, { enrolment });
      if (plan.steps.length === 0) note('error', 'sweepEmpty', key, { where: key, example: detail });
      if (plan.totalSeconds > length) note('error', 'sweepOverflow', key, { where: key, example: detail });
      for (const step of plan.steps) {
        const ex = content.catalog.exercises.get(step.exerciseId);
        if (!ex) note('error', 'sweepUnknown', key, { where: key, example: `${step.exerciseId}: ${detail}` });
        else if (!available(ex, ctx) && step.exerciseId !== 'marchInPlace') note('error', 'sweepUnavailable', key, { where: key, example: `${step.exerciseId}: ${detail}` });
      }
      if (meta.fallback && strictFallback) note('warning', 'sweepFallback', key, { where: key, example: detail });
    } catch (e) {
      note('error', 'sweepThrew', key, { where: key, example: `${detail}: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  for (const goal of content.goals.all) {
    for (const program of goal.programs) {
      for (const phase of program.phases) {
        const week = Math.min(Math.max(phase.fromWeek, 1), program.weeks);
        for (const level of [1, 3] as const) {
          const enrolment = { goalId: goal.id, programId: program.id, level, startedOn: addDays(TODAY, -(week - 1) * 7), acceptedDisclaimerAt: 1 };
          for (const length of LENGTHS) {
            for (const [name, equipment] of gear) {
              for (const [ci, constraints] of CONSTRAINTS.entries()) {
                for (const warm of [true, false]) {
                  const strict = name === 'all equipment' && ci === 0 && level === 1;
                  run(`${goal.id}/${program.id} week ${week}, level ${level}, ${name}${warm ? '' : ', after a block'}`, `${goal.id}/${program.id}`, { mode: 'goal', templateId: null }, enrolment, length, equipment, constraints, warm, strict);
                }
              }
            }
          }
        }
      }
    }
  }
  for (const t of content.templates.all) {
    for (const length of LENGTHS.filter((l) => l >= (t.minSeconds ?? 0))) {
      for (const [name, equipment] of gear) {
        for (const [ci, constraints] of CONSTRAINTS.entries()) {
          run(`${t.id}, ${name}`, t.id, { mode: 'free', templateId: t.id }, null, length, equipment, constraints, true, name === 'all equipment' && ci === 0);
        }
      }
    }
  }

  const issues = [...found.values()].map(({ issue, count }) => ({ ...issue, params: { ...issue.params!, count } }));
  return { runs, issues };
}
