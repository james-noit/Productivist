/**
 * Sportask types (framework-free, types only). See docs/sportask/PLAN.md section 3.2.
 * Ids of goals, programs, exercises, templates, equipment, cadences and skins are stored and synced: never rename one.
 */

export type Lang = 'en' | 'es';
export interface LocalizedText {
  en: string;
  es: string;
}

export type GoalTag = 'mobility' | 'strength' | 'calories';
export type MovementPattern = 'squat' | 'lunge' | 'hinge' | 'push' | 'pushVertical' | 'pull' | 'core' | 'cardio' | 'mobility';
export type BodyZone = 'neck' | 'shoulders' | 'thoracic' | 'spine' | 'hips' | 'hamstrings' | 'ankles' | 'wrists';
export type MetricKind = 'reps' | 'seconds' | 'cm';
export type Impact = 'none' | 'low' | 'high';
export type Level = 1 | 2 | 3 | 4 | 5;

/** Exactly one field is set. */
export interface Dose {
  reps?: number;
  seconds?: number;
}

export interface ExerciseDef {
  id: string;
  name: LocalizedText;
  cues: LocalizedText[];
  pattern: MovementPattern;
  zones?: BodyZone[];
  tags: GoalTag[];
  metric: MetricKind;
  perSide?: boolean;
  needsOneOf: string[];
  loadable?: boolean;
  level: Level;
  impact: Impact;
  floor: boolean;
  space?: boolean;
  wall?: boolean;
  chair?: boolean;
  met: number;
  secondsPerRep?: number;
  dose: Dose;
  pictogram: string;
  retired?: boolean;
}

export interface LadderDef {
  id: string;
  pattern: MovementPattern;
  rungs: string[][];
}

export interface EquipmentDef {
  id: string;
  name: LocalizedText;
  icon: string;
  details?: 'weights' | 'bandStrengths';
}
export interface EquipmentItem {
  owned: boolean;
  weightsKg?: number[];
  bandStrengths?: ('light' | 'medium' | 'heavy')[];
}
export type EquipmentInventory = Record<string, EquipmentItem>;

export interface Constraints {
  lowImpact: boolean;
  noFloor: boolean;
}

export interface CadencePreset {
  id: string;
  name: LocalizedText;
  focusSeconds: number;
  breakSeconds: number;
  longBreak?: { every: number; seconds: number };
  exerciseEvery: number;
}

export interface BlockStep {
  exerciseId: string;
  workSeconds: number;
  restSeconds: number;
  target?: Dose;
  side?: 'left' | 'right';
  loadKg?: number;
  round?: number;
}
export type BlockKind = 'train' | 'warmup' | 'test';
export interface BlockPlan {
  kind: BlockKind;
  prepSeconds: number;
  steps: BlockStep[];
  totalSeconds: number;
  assessmentId?: string;
}

export interface StepResult {
  stepIndex: number;
  done: boolean;
  value?: number;
  loadKg?: number;
}
export type BlockStatus = 'done' | 'partial' | 'skipped';
export type Feedback = 'tooEasy' | 'ok' | 'tooHard';

/** One synced row per break with Sportask exercise. */
export interface SportBlock {
  id: string;
  startedAt: number;
  date: string;
  origin: 'goal' | 'free';
  goalId?: string;
  programId?: string;
  programWeek?: number;
  templateId?: string;
  kind: BlockKind;
  assessmentId?: string;
  blockSeconds: number;
  prepSeconds: number;
  steps: BlockStep[];
  results: StepResult[];
  status: BlockStatus;
  rpe?: number;
  feedback?: Feedback;
  catalogVersion: number;
  createdAt: number;
  updatedAt: number;
}

export type TemplateSlot =
  | { exerciseId: string; dose?: Dose }
  | { pattern: MovementPattern; tag?: GoalTag; zone?: BodyZone; maxLevel?: Level };

/** A free-training template. Built-ins live in code; user ones are synced rows. */
export interface SportTemplate {
  id: string;
  name: string;
  nameText?: LocalizedText;
  slots: TemplateSlot[];
  format: 'sequence' | 'intervals' | 'emom';
  workSeconds?: number;
  restSeconds?: number;
  minSeconds?: number;
  order: number;
  createdAt: number;
  updatedAt: number;
  builtin?: boolean;
}

export interface Enrolment {
  goalId: string;
  programId: string;
  level: 1 | 2 | 3;
  startedOn: string;
  acceptedDisclaimerAt: number;
}

/** Synced settings, stored as `settings.sportask` in the state blob. */
export interface SportaskSettings {
  enrolment: Enrolment | null;
  cadenceId: string;
  customCadence?: Omit<CadencePreset, 'id' | 'name'>;
  equipment: EquipmentInventory;
  constraints: Constraints;
  skin: string;
  skinWholeApp: boolean;
  cues: boolean;
  autoStartBreak: boolean;
  disclaimerAcceptedAt?: number;       // epoch ms; kept when leaving a program (Enrolment.acceptedDisclaimerAt is a copy)
}

/** Device-local, never synced. */
export interface SportaskSession {
  active: boolean;
  source: 'pomodoro' | 'multitask' | 'planner';
  mode: 'goal' | 'free';
  templateId: string | 'random' | null;
  cadence: Omit<CadencePreset, 'id' | 'name'>;
  equipmentOverride: EquipmentInventory | null;
  startedAt: number;
  breaksSeen: number;
  pending: PendingBlock | null;
}

/** What the generator says about a block besides its steps; stored on the block row and shown in the preview. */
export interface BlockMeta {
  origin: 'goal' | 'free';
  /** The goal that actually generated the block (the rest-day goal on a rest day). */
  goalId?: string;
  programId?: string;
  programWeek?: number;
  templateId?: string;
  assessmentId?: string;
  /** Today is not a training day of the program: the block comes from the rest-day goal. */
  restDay?: boolean;
  /** The requested block could not be made with these constraints. */
  fallback?: 'mobility' | 'minimal';
  phaseNote?: LocalizedText;
}

/** The block of the current break, kept in the session so a reload (or another tab) resumes it. */
export interface PendingBlock {
  blockId: string;
  plan: BlockPlan;
  /** Epoch ms of the press on Start; null while the preview is showing. */
  startedAt: number | null;
  meta: BlockMeta;
  /** The break's length when the plan was made (the clock's own total changes once the break is over). */
  blockSeconds: number;
  /** How many times "Another one" was used for this break (at most 3). */
  rerolls: number;
  /** "Train anyway" on a rest day. */
  forceTrain?: boolean;
}

/** What a session (or the armed planner session) needs to start. */
export type SportaskStartOptions = Pick<SportaskSession, 'source' | 'mode' | 'templateId' | 'cadence' | 'equipmentOverride'>;

/** The Sportask part of an export file (version 6). User templates only: the built-in ones live in code. */
export interface SportExport {
  sportBlocks: SportBlock[];
  sportTemplates: SportTemplate[];
}
