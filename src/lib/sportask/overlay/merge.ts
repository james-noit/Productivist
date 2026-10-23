import type { CadencePreset, EquipmentDef, ExerciseDef, LadderDef, SportTemplate } from '../../../types/sportask';
import { CADENCES } from '../cadences';
import { CATALOG } from '../catalog';
import type { AnyGoal, AssessmentDef, Catalog, PhaseDef, ProgramDef } from '../engine/context';
import { EQUIPMENT } from '../equipment';
import { GOALS } from '../goals';
import { type Registry, createRegistry } from '../registry';
import { BUILTIN_TEMPLATES } from '../templates';
import { isNewId, type CatalogOverlay, type ExerciseEntry, type ProgramEntry, type TemplateEntry } from './types';

/**
 * The built-in registries with an overlay layered over them, as fresh registries (nothing global is touched). The same function
 * builds what the app applies (`apply.ts`), what the editor previews and what the checks sweep. Total: it never throws, whatever
 * the overlay says (a patch for an unknown id is ignored, a new item with missing fields gets defaults); `validate.ts` is what
 * reports such things.
 */
export interface LayeredContent {
  catalog: Catalog;
  goals: Registry<AnyGoal>;
  templates: Registry<SportTemplate>;
  cadences: Registry<CadencePreset>;
}

/** What a new exercise gets for the fields its entry leaves out (validation reports them as missing). */
const EXERCISE_DEFAULTS: Omit<ExerciseDef, 'id'> = {
  name: { en: '', es: '' },
  cues: [],
  pattern: 'core',
  tags: ['strength'],
  metric: 'reps',
  needsOneOf: [],
  level: 1,
  impact: 'none',
  floor: false,
  met: 3.5,
  dose: { reps: 8 },
  pictogram: 'march',
};

/** The entry's fields without its id and without keys set to `undefined` (which would otherwise erase the built-in's value). */
function withoutId<T extends { id: string }>(entry: T): Omit<T, 'id'> {
  return Object.fromEntries(Object.entries(entry).filter(([key, value]) => key !== 'id' && value !== undefined)) as Omit<T, 'id'>;
}

/** Built-ins in their order (patched in place), then the director's new items sorted by id. */
function layer<T extends { id: string }, E extends { id: string }>(base: readonly T[], entries: readonly E[] | undefined, patch: (item: T, entry: E) => T, create?: (entry: E, index: number) => T): T[] {
  if (!entries || entries.length === 0) return [...base];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out = base.map((item) => {
    const entry = byId.get(item.id);
    return entry ? patch(item, entry) : item;
  });
  if (create) {
    const known = new Set(base.map((b) => b.id));
    entries
      .filter((e) => !known.has(e.id) && isNewId(e.id))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .forEach((e, i) => out.push(create(e, i)));
  }
  return out;
}

function exerciseOf(entry: ExerciseEntry, base?: ExerciseDef): ExerciseDef {
  const fields = withoutId(entry);
  const merged: ExerciseDef = { ...(base ?? EXERCISE_DEFAULTS), ...fields, id: entry.id };
  // A copy, so editing the overlay in place later can never reach the built-in.
  return { ...merged, name: { ...merged.name }, cues: merged.cues.map((c) => ({ ...c })), tags: [...merged.tags], needsOneOf: [...merged.needsOneOf], dose: { ...merged.dose }, ...(merged.zones ? { zones: [...merged.zones] } : {}) };
}

function programOf(entry: ProgramEntry, base: ProgramDef<unknown> | undefined, fallbackParams: Record<string, unknown>): ProgramDef<unknown> {
  const defaults = (base?.phases[0]?.params ?? fallbackParams) as Record<string, unknown>;
  const phases: PhaseDef<unknown>[] = entry.phases
    ? entry.phases.map((p) => ({ fromWeek: p.fromWeek, toWeek: p.toWeek, params: { ...defaults, ...p.params }, ...(p.note ? { note: p.note } : {}) }))
    : (base?.phases ?? []);
  return {
    id: entry.id,
    name: entry.name ?? base?.name ?? { en: entry.id, es: entry.id },
    summary: entry.summary ?? base?.summary ?? { en: '', es: '' },
    weeks: entry.weeks ?? base?.weeks ?? 4,
    daysPerWeek: entry.daysPerWeek ?? base?.daysPerWeek ?? 5,
    phases,
    assessmentWeeks: entry.assessmentWeeks ?? base?.assessmentWeeks ?? [],
    assessmentIds: entry.assessmentIds ?? base?.assessmentIds ?? [],
  };
}

function goalOf(goal: AnyGoal, overlay: CatalogOverlay): AnyGoal {
  const entry = overlay.goals?.find((g) => g.id === goal.id);
  if (!entry) return goal;
  const fallback = (goal.programs[0]?.phases[0]?.params ?? {}) as Record<string, unknown>;
  const programs = layer<ProgramDef<unknown>, ProgramEntry>(
    goal.programs,
    entry.programs,
    (p, e) => programOf(e, p, fallback),
    (e) => programOf(e, undefined, fallback),
  );
  return { ...goal, name: entry.name ?? goal.name, description: entry.description ?? goal.description, programs };
}

function templateOf(entry: TemplateEntry, base: SportTemplate | undefined, index: number): SportTemplate {
  const nameText = entry.nameText ?? base?.nameText ?? { en: entry.id, es: entry.id };
  const t: SportTemplate = {
    id: entry.id,
    name: nameText.en,
    nameText,
    slots: entry.slots ?? base?.slots ?? [],
    format: entry.format ?? base?.format ?? 'sequence',
    order: base?.order ?? 1000 + index,
    createdAt: 0,
    updatedAt: 0,
    builtin: true,
  };
  const work = entry.workSeconds ?? base?.workSeconds;
  const rest = entry.restSeconds ?? base?.restSeconds;
  const min = entry.minSeconds ?? base?.minSeconds;
  if (work !== undefined) t.workSeconds = work;
  if (rest !== undefined) t.restSeconds = rest;
  if (min !== undefined) t.minSeconds = min;
  return t;
}

export function contentFor(overlay: CatalogOverlay | null): LayeredContent {
  const o = overlay ?? { schema: 1 };
  const exercises = layer<ExerciseDef, ExerciseEntry>(CATALOG.exercises.base, o.exercises, (b, e) => exerciseOf(e, b), (e) => exerciseOf(e));
  const ladders = layer<LadderDef, NonNullable<CatalogOverlay['ladders']>[number]>(
    CATALOG.ladders.base,
    o.ladders,
    (b, e) => ({ ...b, rungs: e.rungs.map((r) => [...r]) }),
  );
  const assessments = layer<AssessmentDef, NonNullable<CatalogOverlay['assessments']>[number]>(CATALOG.assessments.base, o.assessments, (b, e) => ({
    ...b,
    ...(e.name ? { name: e.name } : {}),
    ...(e.instructions ? { instructions: e.instructions } : {}),
    ...(e.seconds !== undefined ? { seconds: e.seconds } : {}),
    ...(e.exerciseIds ? { exerciseIds: [...e.exerciseIds] } : {}),
    ...(e.maxRung !== undefined ? { maxRung: e.maxRung } : {}),
  }));
  const equipment = layer<EquipmentDef, NonNullable<CatalogOverlay['equipment']>[number]>(
    EQUIPMENT.base,
    o.equipment,
    (b, e) => ({ ...b, ...(e.name ? { name: e.name } : {}), ...(e.icon ? { icon: e.icon } : {}), ...(e.details ? { details: e.details } : {}) }),
    (e) => ({ id: e.id, name: e.name ?? { en: e.id, es: e.id }, icon: e.icon ?? 'dumbbell', ...(e.details ? { details: e.details } : {}) }),
  );
  const goals = GOALS.base.map((g) => goalOf(g, o));
  const templates = layer<SportTemplate, TemplateEntry>(
    BUILTIN_TEMPLATES.base,
    o.templates,
    (b, e) => templateOf(e, b, 0),
    (e, i) => templateOf(e, undefined, i),
  );
  const cadences = layer<CadencePreset, NonNullable<CatalogOverlay['cadences']>[number]>(
    CADENCES.base,
    o.cadences,
    (b, e) => cadenceOf(e, b),
    (e) => cadenceOf(e, undefined),
  );
  return {
    catalog: { exercises: createRegistry(exercises), ladders: createRegistry(ladders), equipment: createRegistry(equipment), assessments: createRegistry(assessments) },
    goals: createRegistry(goals),
    templates: createRegistry(templates),
    cadences: createRegistry(cadences),
  };
}

function cadenceOf(e: NonNullable<CatalogOverlay['cadences']>[number], base: CadencePreset | undefined): CadencePreset {
  const out: CadencePreset = {
    id: e.id,
    name: e.name ?? base?.name ?? { en: e.id, es: e.id },
    focusSeconds: e.focusSeconds ?? base?.focusSeconds ?? 1500,
    breakSeconds: e.breakSeconds ?? base?.breakSeconds ?? 300,
    exerciseEvery: e.exerciseEvery ?? base?.exerciseEvery ?? 1,
  };
  const longBreak = e.longBreak === undefined ? base?.longBreak : e.longBreak;
  if (longBreak) out.longBreak = { ...longBreak };
  return out;
}
