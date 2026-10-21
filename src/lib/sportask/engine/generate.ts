import type { BlockMeta, BlockPlan, BlockStep, SportaskSession, SportaskSettings, SportTemplate } from '../../../types/sportask';
import { BUILTIN_TEMPLATES } from '../templates';
import { GOALS } from '../goals';
import { adaptation } from './adapt';
import { type AnyGoal, type AssessmentDef, type GenerationContext } from './context';
import { available } from './filter';
import { finalizePlan, slotsFor, slotSteps } from './fit';
import { nextUsable, usableAlternatives } from './progression';
import { isTrainingDay, pendingAssessmentIds, phaseFor, programWeek } from './schedule';
import { planFromTemplate, templateAvailability } from './template-plan';

export interface GenerateOptions {
  /** The user's own templates (the built-ins are always included). */
  templates?: readonly SportTemplate[];
  /** On a rest day: train the main goal anyway ("Entrenar igualmente"). */
  forceTrain?: boolean;
}

export type { BlockMeta };
export interface GeneratedBlock {
  plan: BlockPlan;
  meta: BlockMeta;
}

type SessionLike = Pick<SportaskSession, 'mode' | 'templateId'>;
type SettingsLike = Pick<SportaskSettings, 'enrolment'>;

const hasSteps = (plan: BlockPlan): boolean => plan.steps.length > 0;

/** Mobility at the same block length, then a single march/cat-cow step. Never empty. */
function fallbackBlock(ctx: GenerationContext, warm: boolean, meta: BlockMeta): GeneratedBlock {
  const kind = warm ? 'warmup' : 'train';
  const mobility = GOALS.get('mobility');
  const program = mobility?.programs[0];
  if (mobility && program) {
    const params = { ...phaseFor(program, 1).params, warmup: warm };
    const plan = mobility.generator.generate(ctx, params);
    if (hasSteps(plan)) {
      const goalFields = meta.origin === 'goal' ? { goalId: mobility.id, programId: program.id, programWeek: 1 } : {};
      return { plan, meta: { ...meta, ...goalFields, fallback: 'mobility' } };
    }
  }
  const ex = ['marchInPlace', 'standingCatCow'].map((id) => ctx.catalog.exercises.get(id)).find((e) => e && !e.retired);
  const prep = slotsFor(ctx.blockSeconds, 'mobility').prep;
  const steps: BlockStep[] = ex ? slotSteps({ ex, work: Math.max(1, ctx.blockSeconds - prep), rest: 0 }) : [];
  if (steps.length === 0) steps.push({ exerciseId: 'marchInPlace', workSeconds: Math.max(1, ctx.blockSeconds - prep), restSeconds: 0 });
  return { plan: finalizePlan(kind, prep, steps, ctx.blockSeconds), meta: { ...meta, fallback: 'minimal' } };
}

/** A test block: prep 15 s plus one step (two when per side). Null when it does not fit or nothing can be done. */
function planAssessment(def: AssessmentDef, ctx: GenerationContext, goal: AnyGoal, params: unknown): BlockPlan | null {
  const prep = 15;
  let exerciseId: string | undefined;
  if (def.exerciseIds) {
    exerciseId = def.exerciseIds.find((id) => {
      const ex = ctx.catalog.exercises.get(id);
      return !!ex && available(ex, ctx);
    });
  } else if (def.ladderId) {
    const ladder = ctx.catalog.ladders.get(def.ladderId);
    if (ladder) {
      const current = goal.progression.levels(ctx, params).get(ladder.id) ?? 0;
      let rung = Math.min(current, def.maxRung ?? ladder.rungs.length - 1);
      if (usableAlternatives(ladder, rung, ctx).length === 0) rung = nextUsable(ladder, rung, -1, ctx);
      if (rung >= 0) exerciseId = usableAlternatives(ladder, rung, ctx)[0]?.id;
    }
  }
  if (!exerciseId) return null;
  const sides: ('left' | 'right' | undefined)[] = def.perSide ? ['left', 'right'] : [undefined];
  if (prep + def.seconds * sides.length > ctx.blockSeconds) return null;
  const steps = sides.map((side): BlockStep => (side ? { exerciseId: exerciseId!, workSeconds: def.seconds, restSeconds: 0, side } : { exerciseId: exerciseId!, workSeconds: def.seconds, restSeconds: 0 }));
  return finalizePlan('test', prep, steps, ctx.blockSeconds, def.id);
}

function runGoal(ctx: GenerationContext, goal: AnyGoal, program: AnyGoal['programs'][number], week: number, warm: boolean, meta: BlockMeta): GeneratedBlock {
  const phase = phaseFor(program, week);
  const adapt = adaptation(ctx, goal.id);
  const params = goal.adapt ? goal.adapt(phase.params, adapt) : phase.params;
  const plan = goal.generator.generate(ctx, { ...params, warmup: warm });
  const adapted: BlockMeta['adapted'] | undefined = adapt.reason && goal.adapt ? { reason: adapt.reason, ...(adapt.reason === 'return' && adapt.away !== null ? { days: adapt.away } : {}) } : undefined;
  const base: BlockMeta = { ...meta, origin: 'goal', goalId: goal.id, programId: program.id, programWeek: week, ...(phase.note ? { phaseNote: phase.note } : {}), ...(adapted ? { adapted } : {}) };
  return hasSteps(plan) ? { plan, meta: base } : fallbackBlock(ctx, warm, base);
}

function planGoal(ctx: GenerationContext, settings: SettingsLike, opts: GenerateOptions, warm: boolean): GeneratedBlock {
  const enrolment = ctx.enrolment ?? settings.enrolment;
  const goal = enrolment ? GOALS.get(enrolment.goalId) : undefined;
  if (!enrolment || !goal) return fallbackBlock(ctx, warm, { origin: 'goal' });
  const program = goal.programs.find((p) => p.id === enrolment.programId) ?? goal.programs[0]!;
  const position = programWeek(enrolment.startedOn, ctx.today, program.weeks);

  const restGoal = goal.restDayGoalId ? GOALS.get(goal.restDayGoalId) : undefined;
  if (restGoal && !opts.forceTrain && !isTrainingDay(ctx, program, goal.id)) {
    return runGoal(ctx, restGoal, restGoal.programs[0]!, 1, warm, { origin: 'goal', restDay: true });
  }

  if (!warm) {
    const params = { ...phaseFor(program, position.week).params, warmup: false };
    for (const id of pendingAssessmentIds(ctx, program, position, goal.id)) {
      const def = ctx.catalog.assessments.get(id);
      const plan = def ? planAssessment(def, ctx, goal, params) : null;
      if (plan && def) return { plan, meta: { origin: 'goal', goalId: goal.id, programId: program.id, programWeek: position.week, assessmentId: def.id } };
    }
  }
  return runGoal(ctx, goal, program, position.week, warm, { origin: 'goal' });
}

function planFree(ctx: GenerationContext, session: SessionLike, opts: GenerateOptions, warm: boolean): GeneratedBlock {
  const templates = [...BUILTIN_TEMPLATES.all, ...[...(opts.templates ?? [])].sort((a, b) => a.order - b.order)];
  let chosen = session.templateId && session.templateId !== 'random' ? templates.find((t) => t.id === session.templateId) : undefined;
  if (!chosen) {
    const recent = new Set(
      ctx.history
        .filter((b) => b.origin === 'free' && b.templateId)
        .slice(-2)
        .map((b) => b.templateId),
    );
    const fits = templates.filter((t) => (t.minSeconds ?? 0) <= ctx.blockSeconds && templateAvailability(t, ctx).available);
    const fresh = fits.filter((t) => !recent.has(t.id));
    const pool = fresh.length > 0 ? fresh : fits;
    if (pool.length > 0) chosen = pool[Math.min(pool.length - 1, Math.floor(ctx.rng() * pool.length))];
  }
  if (!chosen) return fallbackBlock(ctx, warm, { origin: 'free' });
  const plan = planFromTemplate(chosen, ctx);
  if (!hasSteps(plan)) return fallbackBlock(ctx, warm, { origin: 'free', templateId: chosen.id });
  return { plan, meta: { origin: 'free', templateId: chosen.id } };
}

/** The one entry point (PLAN section 8.1): a plan for this break plus what to record with it. Pure and reproducible from `ctx.rng`. */
export function generate(ctx: GenerationContext, session: SessionLike, settings: SettingsLike, opts: GenerateOptions = {}): GeneratedBlock {
  const warm = !ctx.todayBlocks.some((b) => b.status === 'done');
  return session.mode === 'free' ? planFree(ctx, session, opts, warm) : planGoal(ctx, settings, opts, warm);
}

export function generateBlock(ctx: GenerationContext, session: SessionLike, settings: SettingsLike, opts: GenerateOptions = {}): BlockPlan {
  return generate(ctx, session, settings, opts).plan;
}
