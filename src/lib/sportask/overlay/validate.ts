import type { ExerciseDef, LocalizedText, TemplateSlot } from '../../../types/sportask';
import { CADENCES } from '../cadences';
import { PICTOGRAM_IDS } from '../catalog/pictograms';
import type { AnyGoal } from '../engine/context';
import { CATALOG } from '../catalog';
import { GOALS } from '../goals';
import { BUILTIN_TEMPLATES } from '../templates';
import { type LayeredContent, contentFor } from './merge';
import { smokeTest } from './smoke';
import {
  type CatalogOverlay,
  EQUIPMENT_ICONS,
  FORMATS,
  type PhaseEntry,
  PARAM_ENUMS,
  PATTERNS,
  type ProgramEntry,
  SECTIONS,
  type Section,
  isNewId,
} from './types';

/**
 * The one validation of a catalog overlay (docs/sportask/DIRECTOR.md section 2.5): the editor runs it before Save and Publish, every
 * consumer runs its structural half (`deep: false`) before applying a fetched overlay, and the self-check runs it over fixtures.
 * Pure. Errors block publishing; warnings do not. Messages are texts keyed by `code` (`fitness.issue.<code>`) with `params`.
 */
export type IssueSection = Section | 'sweep' | 'general';

export interface Issue {
  severity: 'error' | 'warning';
  section: IssueSection;
  /** The entry the issue is about. */
  id?: string;
  code: string;
  params?: Record<string, string | number>;
}

export interface ValidateOptions {
  /** The currently published overlay: nothing it has may be missing (ids are never removed). */
  published?: CatalogOverlay | null;
  /** Also run the generation sweep (slower; publish time). */
  deep?: boolean;
}

export const MAX_OVERLAY_CHARS = 250_000;

/** Hard limits of the numeric phase parameters (a typo like 600 s holds is refused); the rest are 0..10 000. */
export const PARAM_LIMITS: Readonly<Record<string, readonly [number, number]>> = {
  holdSeconds: [5, 120],
  repsScale: [0.3, 3],
  maxLevel: [1, 5],
  restSeconds: [0, 180],
  setsPerPatternPerDay: [1, 8],
  capPerPatternPerDay: [1, 12],
  tempoFactor: [0.5, 3],
  rir: [0, 6],
  work: [5, 120],
  rest: [0, 120],
  weeklyActiveMinutes: [0, 600],
  emomFromSeconds: [60, 3600],
  repRange: [1, 100],
  holdRange: [5, 300],
};
const DEFAULT_LIMIT: readonly [number, number] = [0, 10_000];

/** Pictograms that show a jump, and ones that put the body on the floor: a mismatch with the exercise's flags is a warning. */
const JUMP_PICTOGRAMS: readonly string[] = ['jump', 'rope'];
const FLOOR_PICTOGRAMS: readonly string[] = ['bridge', 'pushup', 'plank', 'sidePlank', 'stretchFloor'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Own keys only: a parameter called `constructor` is not one. */
const has = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);
const isInt = (v: unknown, lo: number, hi: number): boolean => isNum(v) && Number.isInteger(v) && v >= lo && v <= hi;

class Collector {
  readonly issues: Issue[] = [];
  error(section: IssueSection, id: string | undefined, code: string, params?: Record<string, string | number>): void {
    this.issues.push({ severity: 'error', section, ...(id ? { id } : {}), code, ...(params ? { params } : {}) });
  }
  warn(section: IssueSection, id: string | undefined, code: string, params?: Record<string, string | number>): void {
    this.issues.push({ severity: 'warning', section, ...(id ? { id } : {}), code, ...(params ? { params } : {}) });
  }
  /** Both languages, non-empty, within `max` characters. */
  text(section: IssueSection, id: string, field: string, t: LocalizedText | undefined, max: number): void {
    if (!t || !t.en.trim() || !t.es.trim()) {
      this.error(section, id, 'textMissing', { field });
      return;
    }
    if (t.en.length > max || t.es.length > max) this.error(section, id, 'textLong', { field, max });
  }
  range(section: IssueSection, id: string, field: string, v: unknown, lo: number, hi: number, integer = true): void {
    if (!(integer ? isInt(v, lo, hi) : isNum(v) && v >= lo && v <= hi)) this.error(section, id, 'range', { field, min: lo, max: hi });
  }
}

export function validateOverlay(overlay: CatalogOverlay, options: ValidateOptions = {}): Issue[] {
  const c = new Collector();
  if (JSON.stringify(overlay).length > MAX_OVERLAY_CHARS) c.error('general', undefined, 'tooLarge', { max: MAX_OVERLAY_CHARS });
  const content = contentFor(overlay);

  checkExercises(c, overlay, content);
  checkLadders(c, overlay, content);
  checkAssessments(c, overlay, content);
  checkEquipment(c, overlay);
  checkGoals(c, overlay, content);
  checkTemplates(c, overlay, content);
  checkCadences(c, overlay);
  checkFallbacks(c, content);
  if (options.published) checkContinuity(c, overlay, options.published);

  if (options.deep && !c.issues.some((i) => i.severity === 'error')) c.issues.push(...smokeTest(content).issues);
  return c.issues;
}

/** Every code an issue can carry; each has a text under `fitness.issue.<code>` (the self-check asserts it, in both languages). */
export const ISSUE_CODES: readonly string[] = [
  'tooLarge', 'badId', 'incomplete', 'textMissing', 'textLong', 'range', 'cues', 'doseMismatch', 'pictogram', 'tags', 'unknownEquipment',
  'mobilityImpact', 'lintJump', 'lintFloor', 'lintHighLevel1', 'noZones', 'caloriesMobility', 'notOnLadder', 'ladderUnknown', 'ladderRungs',
  'ladderRung', 'unknownExercise', 'ladderPattern', 'retiredUsed', 'ladderDup', 'warmupGap', 'ladderShorter', 'ladderReplay', 'assessmentNew',
  'assessmentExercises', 'assessmentMetric', 'assessmentNoLadder', 'equipmentIcon', 'goalUnknown', 'assessmentWeek', 'unknownAssessment',
  'phaseCount', 'phaseWeeks', 'phaseCoverage', 'paramMissing', 'paramUnknown', 'paramRange', 'paramShape', 'paramPatterns', 'paramOrder',
  'patternNoLadder', 'slotCount', 'templateFormat', 'slotDose', 'fallbackRetired', 'dropped', 'sweepEmpty', 'sweepOverflow', 'sweepUnknown',
  'sweepUnavailable', 'sweepFallback', 'sweepThrew',
];

export const errorsOf = (issues: readonly Issue[]): Issue[] => issues.filter((i) => i.severity === 'error');

// ---- ids

function checkId(c: Collector, section: Section, id: string, builtin: boolean): void {
  if (!builtin && !isNewId(id)) c.error(section, id, 'badId');
}

// ---- exercises

const REQUIRED_EXERCISE_FIELDS = ['name', 'cues', 'pattern', 'tags', 'metric', 'level', 'impact', 'floor', 'met', 'dose', 'pictogram'] as const;

function checkExercises(c: Collector, overlay: CatalogOverlay, content: LayeredContent): void {
  const baseIds = new Set(CATALOG.exercises.base.map((e) => e.id));
  const onLadder = new Set(content.catalog.ladders.all.flatMap((l) => l.rungs.flat()));
  const equipmentIds = new Set(content.catalog.equipment.all.map((e) => e.id));
  for (const entry of overlay.exercises ?? []) {
    const builtin = baseIds.has(entry.id);
    checkId(c, 'exercises', entry.id, builtin);
    if (!builtin) {
      const missing = REQUIRED_EXERCISE_FIELDS.filter((f) => entry[f] === undefined);
      if (missing.length > 0) c.error('exercises', entry.id, 'incomplete', { field: missing.join(', ') });
    }
    const ex = content.catalog.exercises.get(entry.id);
    if (!ex || (!builtin && !isNewId(entry.id))) continue;
    checkExercise(c, ex, equipmentIds, onLadder);
  }
}

function checkExercise(c: Collector, ex: ExerciseDef, equipmentIds: ReadonlySet<string>, onLadder: ReadonlySet<string>): void {
  const id = ex.id;
  c.text('exercises', id, 'name', ex.name, 80);
  if (ex.cues.length < 1 || ex.cues.length > 4) c.error('exercises', id, 'cues', { min: 1, max: 4 });
  ex.cues.forEach((cue, i) => c.text('exercises', id, `cue ${i + 1}`, cue, 300));
  c.range('exercises', id, 'level', ex.level, 1, 5);
  c.range('exercises', id, 'met', ex.met, 1, 16, false);
  if (ex.secondsPerRep !== undefined) c.range('exercises', id, 'secondsPerRep', ex.secondsPerRep, 1, 30, false);
  const { reps, seconds } = ex.dose;
  if (ex.metric === 'reps') {
    if (reps === undefined || seconds !== undefined) c.error('exercises', id, 'doseMismatch');
    else c.range('exercises', id, 'dose', reps, 1, 100);
  } else if (seconds === undefined || reps !== undefined) c.error('exercises', id, 'doseMismatch');
  else c.range('exercises', id, 'dose', seconds, 5, 300);
  if (!(PICTOGRAM_IDS as readonly string[]).includes(ex.pictogram)) c.error('exercises', id, 'pictogram', { ref: ex.pictogram });
  if (ex.tags.length === 0) c.error('exercises', id, 'tags');
  for (const ref of ex.needsOneOf) if (!equipmentIds.has(ref)) c.error('exercises', id, 'unknownEquipment', { ref });

  // Safety and consistency lints.
  if (ex.pattern === 'mobility' && ex.impact !== 'none') c.error('exercises', id, 'mobilityImpact');
  if (JUMP_PICTOGRAMS.includes(ex.pictogram) && ex.impact === 'none') c.warn('exercises', id, 'lintJump');
  if (FLOOR_PICTOGRAMS.includes(ex.pictogram) && !ex.floor) c.warn('exercises', id, 'lintFloor');
  if (ex.impact === 'high' && ex.level <= 1) c.warn('exercises', id, 'lintHighLevel1');
  if (ex.retired) return;
  // Reachability: which goal would ever pick it.
  if (ex.tags.includes('mobility') && (!ex.zones || ex.zones.length === 0)) c.warn('exercises', id, 'noZones');
  if (ex.tags.includes('calories') && ex.pattern === 'mobility') c.warn('exercises', id, 'caloriesMobility');
  if (ex.tags.includes('strength') && !ex.tags.includes('mobility') && !onLadder.has(id)) c.warn('exercises', id, 'notOnLadder');
}

// ---- ladders

function checkLadders(c: Collector, overlay: CatalogOverlay, content: LayeredContent): void {
  const baseById = new Map(CATALOG.ladders.base.map((l) => [l.id, l]));
  for (const entry of overlay.ladders ?? []) {
    const base = baseById.get(entry.id);
    if (!base) {
      c.error('ladders', entry.id, 'ladderUnknown');
      continue;
    }
    if (entry.rungs.length < 1 || entry.rungs.length > 12) c.error('ladders', entry.id, 'ladderRungs', { min: 1, max: 12 });
    const seen = new Set<string>();
    let gentle = false;
    entry.rungs.forEach((rung, i) => {
      if (rung.length < 1 || rung.length > 6) c.error('ladders', entry.id, 'ladderRung', { rung: i + 1 });
      for (const ref of rung) {
        const ex = content.catalog.exercises.get(ref);
        if (!ex) c.error('ladders', entry.id, 'unknownExercise', { ref });
        else {
          if (ex.pattern !== base.pattern) c.error('ladders', entry.id, 'ladderPattern', { ref, pattern: base.pattern });
          if (ex.retired) c.warn('ladders', entry.id, 'retiredUsed', { ref });
          if (ex.level <= 2) gentle = true;
        }
        if (seen.has(ref)) c.error('ladders', entry.id, 'ladderDup', { ref });
        seen.add(ref);
      }
    });
    if (!gentle) c.warn('ladders', entry.id, 'warmupGap');
    if (JSON.stringify(entry.rungs) !== JSON.stringify(base.rungs)) c.warn('ladders', entry.id, entry.rungs.length < base.rungs.length ? 'ladderShorter' : 'ladderReplay');
  }
}

// ---- assessments

function checkAssessments(c: Collector, overlay: CatalogOverlay, content: LayeredContent): void {
  const baseById = new Map(CATALOG.assessments.base.map((a) => [a.id, a]));
  for (const entry of overlay.assessments ?? []) {
    const base = baseById.get(entry.id);
    if (!base) {
      c.error('assessments', entry.id, 'assessmentNew');
      continue;
    }
    const a = content.catalog.assessments.get(entry.id)!;
    c.text('assessments', entry.id, 'name', a.name, 80);
    c.text('assessments', entry.id, 'instructions', a.instructions, 400);
    c.range('assessments', entry.id, 'seconds', a.seconds, 10, 600);
    if (entry.exerciseIds !== undefined) {
      if (!base.exerciseIds || entry.exerciseIds.length === 0) c.error('assessments', entry.id, 'assessmentExercises');
      for (const ref of entry.exerciseIds) {
        const ex = content.catalog.exercises.get(ref);
        if (!ex) c.error('assessments', entry.id, 'unknownExercise', { ref });
        else if (ex.metric !== a.metric && a.metric !== 'cm') c.warn('assessments', entry.id, 'assessmentMetric', { ref });
      }
    }
    if (entry.maxRung !== undefined) {
      const ladder = a.ladderId ? content.catalog.ladders.get(a.ladderId) : undefined;
      if (!ladder) c.error('assessments', entry.id, 'assessmentNoLadder');
      else c.range('assessments', entry.id, 'maxRung', entry.maxRung, 0, ladder.rungs.length - 1);
    }
  }
}

// ---- equipment

function checkEquipment(c: Collector, overlay: CatalogOverlay): void {
  const baseIds = new Set(CATALOG.equipment.base.map((e) => e.id));
  for (const entry of overlay.equipment ?? []) {
    const builtin = baseIds.has(entry.id);
    checkId(c, 'equipment', entry.id, builtin);
    if (!builtin) {
      if (!entry.name) c.error('equipment', entry.id, 'incomplete', { field: 'name' });
      if (entry.icon !== undefined && !EQUIPMENT_ICONS.includes(entry.icon)) c.error('equipment', entry.id, 'equipmentIcon');
    }
    if (entry.name) c.text('equipment', entry.id, 'name', entry.name, 60);
  }
}

// ---- goals, programs, phases

export interface ParamSchema {
  sample: Record<string, unknown>;
  required: ReadonlySet<string>;
}

export function paramSchema(goal: AnyGoal): ParamSchema {
  const sample: Record<string, unknown> = {};
  const keySets: Set<string>[] = [];
  for (const program of goal.programs) {
    for (const phase of program.phases) {
      const params = phase.params as Record<string, unknown>;
      for (const key of Object.keys(params)) if (key !== 'warmup' && !has(sample, key)) sample[key] = params[key];
      keySets.push(new Set(Object.keys(params).filter((k) => k !== 'warmup')));
    }
  }
  // Required = present in every base phase; the rest (like `emomFromSeconds`) are optional.
  const required = keySets.length === 0 ? new Set<string>() : new Set([...keySets[0]!].filter((k) => keySets.every((set) => set.has(k))));
  return { sample, required };
}

function checkGoals(c: Collector, overlay: CatalogOverlay, content: LayeredContent): void {
  const baseGoals = new Map(GOALS.base.map((g) => [g.id, g]));
  for (const entry of overlay.goals ?? []) {
    const baseGoal = baseGoals.get(entry.id);
    if (!baseGoal) {
      c.error('goals', entry.id, 'goalUnknown');
      continue;
    }
    if (entry.name) c.text('goals', entry.id, 'name', entry.name, 80);
    if (entry.description) c.text('goals', entry.id, 'description', entry.description, 400);
    const schema = paramSchema(baseGoal);
    const merged = content.goals.get(entry.id)!;
    for (const pe of entry.programs ?? []) {
      const baseProgram = baseGoal.programs.find((p) => p.id === pe.id);
      checkId(c, 'goals', `${entry.id}/${pe.id}`, !!baseProgram);
      const program = merged.programs.find((p) => p.id === pe.id);
      if (program) checkProgram(c, entry.id, pe, program, !baseProgram, schema, content);
    }
  }
}

function checkProgram(c: Collector, goalId: string, entry: ProgramEntry, program: AnyGoal['programs'][number], isNew: boolean, schema: ParamSchema, content: LayeredContent): void {
  const id = `${goalId}/${entry.id}`;
  if (isNew) {
    const missing = (['name', 'summary', 'weeks', 'daysPerWeek', 'phases'] as const).filter((f) => entry[f] === undefined);
    if (missing.length > 0) c.error('goals', id, 'incomplete', { field: missing.join(', ') });
  }
  c.text('goals', id, 'name', program.name, 80);
  c.text('goals', id, 'summary', program.summary, 400);
  c.range('goals', id, 'weeks', program.weeks, 1, 52);
  c.range('goals', id, 'daysPerWeek', program.daysPerWeek, 1, 7);
  for (const w of program.assessmentWeeks) if (!isInt(w, 1, program.weeks)) c.error('goals', id, 'assessmentWeek', { week: String(w), weeks: program.weeks });
  for (const ref of program.assessmentIds) if (!content.catalog.assessments.get(ref)) c.error('goals', id, 'unknownAssessment', { ref });

  const phases = entry.phases;
  if (phases === undefined) return;
  if (phases.length < 1 || phases.length > 12) {
    c.error('goals', id, 'phaseCount', { min: 1, max: 12 });
    return;
  }
  checkCoverage(c, id, phases, program.weeks);
  phases.forEach((phase, i) => {
    checkParams(c, id, i + 1, phase.params, schema, content);
    if (phase.note) c.text('goals', id, `phase ${i + 1} note`, phase.note, 200);
  });
}

function checkCoverage(c: Collector, id: string, phases: readonly PhaseEntry[], weeks: number): void {
  let expected = 1;
  for (const [i, p] of phases.entries()) {
    if (!isInt(p.fromWeek, 1, weeks) || !isInt(p.toWeek, 1, weeks) || p.fromWeek > p.toWeek) {
      c.error('goals', id, 'phaseWeeks', { phase: i + 1, weeks });
      return;
    }
    if (p.fromWeek !== expected) {
      c.error('goals', id, 'phaseCoverage', { phase: i + 1, expected });
      return;
    }
    expected = p.toWeek + 1;
  }
  if (expected !== weeks + 1) c.error('goals', id, 'phaseCoverage', { phase: phases.length + 1, expected });
}

function checkParams(c: Collector, id: string, phase: number, params: Record<string, unknown>, schema: ParamSchema, content: LayeredContent): void {
  for (const key of schema.required) if (!has(params, key)) c.error('goals', id, 'paramMissing', { phase, key });
  for (const [key, value] of Object.entries(params)) {
    if (!has(schema.sample, key)) {
      c.error('goals', id, 'paramUnknown', { phase, key });
      continue;
    }
    const sample = schema.sample[key];
    const limits = PARAM_LIMITS[key] ?? DEFAULT_LIMIT;
    const bad = (code: string): void => c.error('goals', id, code, { phase, key, min: limits[0], max: limits[1] });
    if (typeof sample === 'number') {
      if (!isNum(value) || value < limits[0] || value > limits[1]) bad('paramRange');
    } else if (typeof sample === 'boolean') {
      if (typeof value !== 'boolean') bad('paramShape');
    } else if (typeof sample === 'string') {
      const allowed = PARAM_ENUMS[key];
      if (typeof value !== 'string' || (allowed ? !allowed.includes(value) : value !== sample)) bad('paramShape');
    } else if (Array.isArray(sample)) {
      if (!Array.isArray(value) || value.length < 1 || value.some((v) => !(PATTERNS as readonly unknown[]).includes(v)) || new Set(value).size !== value.length) bad('paramPatterns');
      else if (key === 'patterns') for (const p of value as string[]) if (!content.catalog.ladders.get(p)) c.warn('goals', id, 'patternNoLadder', { phase, key: p });
    } else if (sample && typeof sample === 'object') {
      const range = value as Record<string, unknown> | null;
      const keys = Object.keys(sample as object);
      if (!range || typeof range !== 'object' || keys.some((k) => !isNum(range[k]) || (range[k] as number) < limits[0] || (range[k] as number) > limits[1])) bad('paramRange');
      else if ('min' in range && 'max' in range && (range['min'] as number) > (range['max'] as number)) bad('paramOrder');
    }
  }
  const sets = params['setsPerPatternPerDay'];
  const cap = params['capPerPatternPerDay'];
  if (isNum(sets) && isNum(cap) && cap < sets) c.error('goals', id, 'paramOrder', { phase, key: 'capPerPatternPerDay', min: 0, max: 0 });
}

// ---- templates

function checkTemplates(c: Collector, overlay: CatalogOverlay, content: LayeredContent): void {
  const baseIds = new Set(BUILTIN_TEMPLATES.base.map((t) => t.id));
  for (const entry of overlay.templates ?? []) {
    const builtin = baseIds.has(entry.id);
    checkId(c, 'templates', entry.id, builtin);
    const t = content.templates.get(entry.id);
    if (!t) continue;
    if (!builtin) {
      const missing = (['nameText', 'slots', 'format'] as const).filter((f) => entry[f] === undefined);
      if (missing.length > 0) c.error('templates', entry.id, 'incomplete', { field: missing.join(', ') });
    }
    c.text('templates', entry.id, 'name', t.nameText, 80);
    if (t.slots.length < 1 || t.slots.length > 40) c.error('templates', entry.id, 'slotCount', { min: 1, max: 40 });
    t.slots.forEach((slot) => checkSlot(c, entry.id, slot, content));
    if (!FORMATS.includes(t.format)) c.error('templates', entry.id, 'templateFormat');
    if (t.format === 'intervals') {
      c.range('templates', entry.id, 'workSeconds', t.workSeconds, 5, 600);
      c.range('templates', entry.id, 'restSeconds', t.restSeconds, 0, 600);
    } else {
      if (t.workSeconds !== undefined) c.range('templates', entry.id, 'workSeconds', t.workSeconds, 5, 600);
      if (t.restSeconds !== undefined) c.range('templates', entry.id, 'restSeconds', t.restSeconds, 0, 600);
    }
    if (t.minSeconds !== undefined) c.range('templates', entry.id, 'minSeconds', t.minSeconds, 0, 7200);
  }
}

function checkSlot(c: Collector, templateId: string, slot: TemplateSlot, content: LayeredContent): void {
  if (!('exerciseId' in slot)) return;
  const ex = content.catalog.exercises.get(slot.exerciseId);
  if (!ex) {
    c.error('templates', templateId, 'unknownExercise', { ref: slot.exerciseId });
    return;
  }
  if (ex.retired) c.warn('templates', templateId, 'retiredUsed', { ref: ex.id });
  if (slot.dose) {
    const matches = ex.metric === 'reps' ? slot.dose.reps !== undefined : slot.dose.seconds !== undefined;
    if (!matches) c.error('templates', templateId, 'slotDose', { ref: ex.id });
    else c.range('templates', templateId, 'dose', slot.dose.reps ?? slot.dose.seconds, 1, ex.metric === 'reps' ? 100 : 600);
  }
}

// ---- cadences

function checkCadences(c: Collector, overlay: CatalogOverlay): void {
  const baseIds = new Set(CADENCES.base.map((p) => p.id));
  for (const entry of overlay.cadences ?? []) {
    const builtin = baseIds.has(entry.id);
    checkId(c, 'cadences', entry.id, builtin);
    if (!builtin) {
      const missing = (['name', 'focusSeconds', 'breakSeconds'] as const).filter((f) => entry[f] === undefined);
      if (missing.length > 0) c.error('cadences', entry.id, 'incomplete', { field: missing.join(', ') });
    }
    if (entry.name) c.text('cadences', entry.id, 'name', entry.name, 60);
    if (entry.focusSeconds !== undefined) c.range('cadences', entry.id, 'focusSeconds', entry.focusSeconds, 60, 10_800);
    if (entry.breakSeconds !== undefined) c.range('cadences', entry.id, 'breakSeconds', entry.breakSeconds, 30, 3600);
    if (entry.exerciseEvery !== undefined) c.range('cadences', entry.id, 'exerciseEvery', entry.exerciseEvery, 1, 8);
    if (entry.longBreak) {
      c.range('cadences', entry.id, 'longEvery', entry.longBreak.every, 2, 12);
      c.range('cadences', entry.id, 'longSeconds', entry.longBreak.seconds, 30, 3600);
    }
  }
}

// ---- global rules

/** The generator's last resort needs one of these two (`fallbackBlock` in `engine/generate.ts`). */
function checkFallbacks(c: Collector, content: LayeredContent): void {
  const usable = ['marchInPlace', 'standingCatCow'].some((id) => {
    const ex = content.catalog.exercises.get(id);
    return !!ex && !ex.retired;
  });
  if (!usable) c.error('exercises', 'marchInPlace', 'fallbackRetired');
}

/**
 * New ids are never removed: whatever `fd-` item the published version has, this draft must have (an exercise may be retired).
 * Patches of built-ins can be dropped freely (that is going back to the built-in).
 */
function checkContinuity(c: Collector, overlay: CatalogOverlay, published: CatalogOverlay): void {
  for (const section of SECTIONS) {
    const have = new Set((overlay[section] as { id: string }[] | undefined)?.map((e) => e.id));
    for (const entry of (published[section] as { id: string }[] | undefined) ?? []) {
      if (isNewId(entry.id) && !have.has(entry.id)) c.error(section, entry.id, 'dropped');
    }
  }
  for (const goal of published.goals ?? []) {
    const mine = overlay.goals?.find((g) => g.id === goal.id);
    const have = new Set(mine?.programs?.map((p) => p.id));
    for (const program of goal.programs ?? []) if (isNewId(program.id) && !have.has(program.id)) c.error('goals', `${goal.id}/${program.id}`, 'dropped');
  }
}
