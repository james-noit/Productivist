import type {
  BlockPlan,
  Constraints,
  Dose,
  Enrolment,
  EquipmentDef,
  EquipmentInventory,
  ExerciseDef,
  GoalTag,
  LadderDef,
  LocalizedText,
  MetricKind,
  SportBlock,
} from '../../../types/sportask';
import type { Registry } from '../registry';

export interface AssessmentDef {
  id: string;
  name: LocalizedText;
  instructions: LocalizedText;
  metric: MetricKind;
  perSide?: boolean;
  exerciseIds?: string[];              // the first available one is used...
  ladderId?: string;                   // ...or the user's current rung of this ladder
  maxRung?: number;                    // cap for ladderId
  seconds: number;                     // how long the test step lasts (cap for holds, window for AMRAP)
  higherIsBetter: boolean;
}

export interface Catalog {
  exercises: Registry<ExerciseDef>;
  ladders: Registry<LadderDef>;
  equipment: Registry<EquipmentDef>;
  assessments: Registry<AssessmentDef>;
}

export interface GenerationContext {
  blockId: string;
  blockSeconds: number;
  now: number;
  today: string;
  catalog: Catalog;
  equipment: EquipmentInventory;       // the effective one (override or settings)
  constraints: Constraints;
  history: readonly SportBlock[];      // every non-deleted block, oldest first
  todayBlocks: readonly SportBlock[];
  enrolment: Enrolment | null;
  rng: () => number;                   // mulberry32(seed of blockId)
}

/** The block a generator returns; generate.ts fills in the final timing. */
export interface BlockGenerator<P> {
  id: string;
  generate(ctx: GenerationContext, params: P): BlockPlan;
}

export interface ProgressionModel<P> {
  id: string;
  /** Current rung index per ladder, replayed from history (PLAN section 8.3). */
  levels(ctx: GenerationContext, params: P): ReadonlyMap<string, number>;
  dose(ex: ExerciseDef, rung: number, ctx: GenerationContext, params: P): { target: Dose; loadKg?: number };
}

export interface PhaseDef<P> {
  fromWeek: number;
  toWeek: number;
  params: P;
  note?: LocalizedText;                // preview hint for the phase
}
export interface ProgramDef<P> {
  id: string;
  name: LocalizedText;
  summary: LocalizedText;
  weeks: number;                       // after the last week the program repeats from week 1 at the reached levels
  daysPerWeek: number;
  phases: PhaseDef<P>[];
  assessmentWeeks: number[];
  assessmentIds: string[];
}
export interface GoalDef<P> {
  id: string;
  tag: GoalTag;
  name: LocalizedText;
  description: LocalizedText;
  icon: string;
  programs: ProgramDef<P>[];
  generator: BlockGenerator<P>;
  progression: ProgressionModel<P>;
  metricIds: string[];
  restDayGoalId?: string;
}
/** The registry stores goals with their parameter type erased; defineGoal keeps each one checked. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGoal = GoalDef<any>;    // the one allowed `any`
export function defineGoal<P>(goal: GoalDef<P>): AnyGoal {
  return goal;
}
