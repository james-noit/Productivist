import type { PhaseDef, ProgramDef } from '../engine/context';
import { entryOf, putEntry, removeEntry, stable } from './edit';
import type { CatalogOverlay, GoalEntry, PhaseEntry, ProgramEntry } from './types';

/** Pure helpers behind the Programs editor: a program (merged) to and from its entry, and the entry inside its goal's entry. */

export function phaseEntries(program: Pick<ProgramDef<unknown>, 'phases'>): PhaseEntry[] {
  return program.phases.map((p: PhaseDef<unknown>) => {
    const { warmup: _warmup, ...params } = p.params as Record<string, unknown>;
    return { fromWeek: p.fromWeek, toWeek: p.toWeek, params, ...(p.note ? { note: p.note } : {}) };
  });
}

const FIELDS = ['name', 'summary', 'weeks', 'daysPerWeek', 'assessmentWeeks', 'assessmentIds'] as const;

/** The entry that makes `full` out of `base` (only the fields that differ), or every field for a new program. Null = identical. */
export function programEntry(base: ProgramDef<unknown> | undefined, full: ProgramDef<unknown>): ProgramEntry | null {
  const entry: ProgramEntry = { id: full.id };
  for (const key of FIELDS) {
    if (!base || stable(full[key]) !== stable(base[key])) (entry as unknown as Record<string, unknown>)[key] = full[key];
  }
  if (!base || stable(phaseEntries(full)) !== stable(phaseEntries(base))) entry.phases = phaseEntries(full);
  return base && Object.keys(entry).length === 1 ? null : entry;
}

/** The overlay with the program's entry set (or removed with `null`) inside its goal's entry; an emptied goal entry is removed. */
export function withProgram(overlay: CatalogOverlay, goalId: string, programId: string, entry: ProgramEntry | null): CatalogOverlay {
  const goal: GoalEntry = entryOf(overlay, 'goals', goalId) ?? { id: goalId };
  const programs = (goal.programs ?? []).filter((p) => p.id !== programId);
  if (entry) programs.push(entry);
  programs.sort((a, b) => (a.id < b.id ? -1 : 1));
  const { programs: _old, ...rest } = goal;
  const next: GoalEntry = programs.length > 0 ? { ...rest, programs } : rest;
  return Object.keys(next).length > 1 ? putEntry(overlay, 'goals', next) : removeEntry(overlay, 'goals', goalId);
}

/** The overlay with the goal's own texts set (`undefined` = back to the built-in text). */
export function withGoalTexts(overlay: CatalogOverlay, goalId: string, texts: Pick<GoalEntry, 'name' | 'description'>): CatalogOverlay {
  const goal: GoalEntry = entryOf(overlay, 'goals', goalId) ?? { id: goalId };
  const { name: _n, description: _d, ...rest } = goal;
  const next: GoalEntry = { ...rest, ...(texts.name ? { name: texts.name } : {}), ...(texts.description ? { description: texts.description } : {}) };
  return Object.keys(next).length > 1 ? putEntry(overlay, 'goals', next) : removeEntry(overlay, 'goals', goalId);
}
