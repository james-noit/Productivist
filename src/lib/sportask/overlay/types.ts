import type {
  BodyZone,
  ExerciseDef,
  GoalTag,
  Impact,
  LocalizedText,
  MovementPattern,
  SportTemplate,
  TemplateSlot,
} from '../../../types/sportask';

/**
 * The Fitness director's catalog overlay (docs/sportask/DIRECTOR.md): one JSON document layered over the built-in registries.
 * An entry whose id is a built-in id is a *patch* (only the fields it carries replace the built-in's); an entry with an `fd-` id
 * is a *new* item and carries every field. Ids are never renamed or removed (an exercise is retired instead). Framework-free.
 */
export const OVERLAY_SCHEMA = 1;

/** Ids of items the director creates: never collide with a built-in (`tpl.` templates, camelCase exercises) or a user template. */
export const NEW_ID_RE = /^fd-[A-Za-z0-9][A-Za-z0-9_.-]{0,60}$/;
export const isNewId = (id: string): boolean => NEW_ID_RE.test(id);
/** Any id the backend and the sync accept (`^[A-Za-z0-9_.-]{1,64}$`). */
export const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export const PATTERNS: readonly MovementPattern[] = ['squat', 'lunge', 'hinge', 'push', 'pushVertical', 'pull', 'core', 'cardio', 'mobility'];
export const ZONES: readonly BodyZone[] = ['neck', 'shoulders', 'thoracic', 'spine', 'hips', 'hamstrings', 'ankles', 'wrists'];
export const TAGS: readonly GoalTag[] = ['mobility', 'strength', 'calories'];
export const IMPACTS: readonly Impact[] = ['none', 'low', 'high'];
export const FORMATS: readonly SportTemplate['format'][] = ['sequence', 'intervals', 'emom'];
/** The equipment icons the `ui-icon` set has. */
export const EQUIPMENT_ICONS: readonly string[] = ['band', 'kettlebell', 'dumbbell', 'rope', 'ball'];
export const EQUIPMENT_DETAILS: readonly ('weights' | 'bandStrengths')[] = ['weights', 'bandStrengths'];
/** Phase parameters that are a fixed vocabulary of strings (the rest are numbers, booleans, ranges or pattern lists). */
export const PARAM_ENUMS: Readonly<Record<string, readonly string[]>> = { longFormat: ['circuit', 'tabata', 'emom'] };

/** Sections of the document that hold lists of entries. */
export const SECTIONS = ['exercises', 'ladders', 'assessments', 'equipment', 'goals', 'templates', 'cadences'] as const;
export type Section = (typeof SECTIONS)[number];

export type ExerciseEntry = { id: string } & Partial<Omit<ExerciseDef, 'id'>>;
export interface LadderEntry {
  id: string;
  rungs: string[][];
}
export interface AssessmentEntry {
  id: string;
  name?: LocalizedText;
  instructions?: LocalizedText;
  seconds?: number;
  exerciseIds?: string[];
  maxRung?: number;
}
export interface EquipmentEntry {
  id: string;
  name?: LocalizedText;
  icon?: string;
  details?: 'weights' | 'bandStrengths';
}
export interface PhaseEntry {
  fromWeek: number;
  toWeek: number;
  /** Every parameter of the phase (the shape of the base phase of the goal), without `warmup`. */
  params: Record<string, unknown>;
  note?: LocalizedText;
}
export interface ProgramEntry {
  id: string;
  name?: LocalizedText;
  summary?: LocalizedText;
  weeks?: number;
  daysPerWeek?: number;
  assessmentWeeks?: number[];
  assessmentIds?: string[];
  phases?: PhaseEntry[];
}
export interface GoalEntry {
  id: string;
  name?: LocalizedText;
  description?: LocalizedText;
  programs?: ProgramEntry[];
}
export interface TemplateEntry {
  id: string;
  nameText?: LocalizedText;
  slots?: TemplateSlot[];
  format?: SportTemplate['format'];
  workSeconds?: number;
  restSeconds?: number;
  minSeconds?: number;
}
export interface CadenceEntry {
  id: string;
  name?: LocalizedText;
  focusSeconds?: number;
  breakSeconds?: number;
  /** `null` removes the long break of a built-in preset. */
  longBreak?: { every: number; seconds: number } | null;
  exerciseEvery?: number;
}

export interface CatalogOverlay {
  schema: number;
  exercises?: ExerciseEntry[];
  ladders?: LadderEntry[];
  assessments?: AssessmentEntry[];
  equipment?: EquipmentEntry[];
  goals?: GoalEntry[];
  templates?: TemplateEntry[];
  cadences?: CadenceEntry[];
}

export type EntryOf<S extends Section> = NonNullable<CatalogOverlay[S]>[number];

export const emptyOverlay = (): CatalogOverlay => ({ schema: OVERLAY_SCHEMA });
