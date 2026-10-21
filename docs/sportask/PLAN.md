# Sportask: training in the Pomodoro breaks

Sportask turns Pomodoro breaks into short training blocks. The user picks a **goal** (improve mobility, full-body
strength, burn calories, more later) or **free training** (a template they choose, or a random one). Every break the app
shows what to do, runs the block's timeline, and records the user's marks. A panel shows the history as charts and lists.

This document is the implementation plan for the implementing agent. The exercises, programs and templates are in
[`CONTENT.md`](CONTENT.md). Read `AGENTS.md` first: everything here follows its rules (zoneless + OnPush + signals,
`inject()`, lazy chunks, terse eager strings, optional wire fields emitted only when set, wrapper types in `SyncDtos`,
`.confirm-bar` instead of `window.confirm`, `ui-icon`, `.btn*`/`.field*`, the `--modal-z` scale, safe areas).

**How to work through it.** One phase (section 13) per session and per commit. Each phase lists its files, steps and a
*Done when* checklist. Do not start a phase before the previous one's checklist passes. When this plan and the code
disagree, the code wins: stop and adapt, don't force the plan. Do not improvise anything this plan already decides.

---

## 1. Decisions (and why)

| Question | Decision |
| --- | --- |
| Is Sportask a new `ClockMode`? | **No.** `ClockService` keeps `focus`/`break`. Sportask watches the clock from outside (like `src/core/native/session-notification.ts`) and only adds two small hooks to it: a duration override and a counter of finished focus phases. |
| Time distributions | **Any.** A *cadence* is `focusSeconds` + `breakSeconds` (+ an optional long break every N focus phases) + "exercise every N breaks". Presets go from 5/1 to 50/10, plus custom. **Generators fill whatever block length they get** (30 s to 30 min); nothing assumes 1 minute. |
| Goal per session or per user? | **Per user.** The user *enrols* in a goal's program (goal + program + level + start date). Sessions follow it. Free training is an explicit alternative chosen when a session starts; it does not move the program forward, but its marks are still recorded and charted. |
| Entry points | (1) A *Sportask* button in the Pomodoro view and in the Multitask view; (2) a *Sportask* switch in the Plan-my-day wizard's last step, applied when the plan is launched (Pomodoro or Multitask). Both open the same setup sheet. |
| Sync | **From day one.** Two new synced tables (`sport_blocks`, `sport_templates`), and the user settings inside the existing `settings` state blob under `settings.sportask` (no backend change for the blob). |
| Where does progression state live? | **Nowhere: it is derived from history.** The level of each movement pattern, the next dose and "is a test due" are pure functions of the synced blocks plus the enrolment. Two devices compute the same thing, and no extra rows can drift. |
| Backend validation | **Shape and size, not vocabulary.** Goal, program, exercise, template, equipment and cadence ids are free `TEXT` matching `^[A-Za-z0-9_.-]{1,64}$`. Adding a goal or an exercise never needs a migration. Only `status` is enumerated (structural). |
| Extensibility | **Registries of plain data + small strategy interfaces** (section 3). Adding a goal, an exercise, a piece of equipment, a template, a cadence, a metric or a skin means adding one entry (and its texts). Each recipe is in section 14. |
| Aesthetics | Two **skins** chosen in Configuration: `cyberpunk` (cartoon neon) and `powerYoga` (warm, soft). A skin overrides the theme tokens. **Assumption (open question 1):** it applies to the Sportask surfaces always, and to the whole app while a Sportask session is active (a switch in Configuration, default on). |
| Exercise texts | Names and cues live in the lazy catalog as `{ en, es }`, like `lib/multitask-research.ts`, not in `en.json`. UI strings live in a lazy `SPORTASK_TEXTS` chunk, like `FORGE_TEXTS`. Only 3 or 4 keys are eager. |
| Equipment | Configured in Configuration (bands, kettlebell, dumbbells, jump rope, yoga ball), with optional details (weights in kg, band strengths). The setup sheet allows a per-session override ("today at the office: nothing"). The generator only picks exercises the available equipment allows. |
| Calories | Shown as an **estimate of net kcal**, `(MET − 1) × kg × hours of work time`, only if the user enters their body weight. Weight is **device-local, never synced** (health data). METs are approximate and must be checked (CONTENT.md §6). |
| Safety | An enrolment disclaimer that must be accepted once (stored in the blob), a warm-up rule (the first block of the day is easy and is never a test), pain = stop (a cue on every block), daily caps, rest days that fall back to mobility. |
| Charts | Hand-written SVG (like `lib/burnup.ts`); no chart library. |
| Tests for the pure logic | No framework is added. A self-check script, `scripts/check-sportask.mjs`, bundles `scripts/sportask-check.ts` with the `esbuild` already in `node_modules`, runs it with Node and asserts invariants (section 12). Script: `npm run check:sportask`. |

---

## 2. Glossary

- **Goal** (`GoalDef`): what training aims for (`mobility`, `strength`, `calories`). It owns one or more programs, a
  generator, a progression model, its assessments and the metrics its dashboard shows.
- **Program** (`ProgramDef`): a goal's plan over weeks: phases with generator parameters, assessment weeks, days per week.
- **Enrolment**: the user's choice `{ goalId, programId, level, startedOn, acceptedDisclaimerAt }`. Synced.
- **Cadence** (`CadencePreset`): the focus/break lengths, an optional long break, and how many breaks carry exercise.
- **Session**: a run of the Pomodoro (or Multitask) with Sportask on. Device-local, like the timer.
- **Block** (`SportBlock`): what happens in one break: the plan (steps) plus the results. One synced row per block.
- **Step** (`BlockStep`): one exercise slot in the block's timeline: work seconds, rest seconds, target reps or seconds.
- **Exercise** (`ExerciseDef`): a catalog entry with pattern, zones, equipment, level, impact, floor/space needs, MET,
  dose, pictogram and texts.
- **Ladder** (`LadderDef`): an ordered list of difficulty rungs for a movement pattern. Each rung holds alternative
  exercises (bodyweight or equipment variants) of similar difficulty.
- **Assessment** (`AssessmentDef`): a test (max push-ups, plank hold, knee-to-wall cm...) scheduled by the program.
- **Template** (`SportTemplate`): a reusable free-training block (built-in or user-made, the latter synced).
- **Skin** (`SkinDef`): a visual style over the current theme.
- **Metric** (`MetricDef`): a computed series for the dashboard.

---

## 3. Architecture

### 3.1 Principles

1. **Data, not classes.** Exercises, ladders, goals, programs, templates, cadences, equipment, metrics and skins are
   plain objects registered in typed arrays. Behaviour is attached only through small strategy interfaces
   (`BlockGenerator`, `ProgressionModel`, `MetricDef.compute`).
2. **One pure engine.** `lib/sportask/engine/*` takes a `GenerationContext` (everything it needs, the catalog included)
   and returns a `BlockPlan`. No Angular, no `Date.now()`, no `Math.random()`: the clock is `ctx.now`/`ctx.today` and
   randomness is `ctx.rng`, seeded from the block id, so a plan is reproducible and testable.
3. **Store what happened, derive the rest.** A block row stores its plan *and* its results, plus `catalogVersion`, so
   history stays readable when the catalog changes. Levels, targets and due tests are recomputed from history.
4. **Eager code stays tiny.** Only the session flag, the clock hooks, the settings signals, the two dumb stores and the
   codecs are in the initial bundle. Everything else is lazy (section 11).
5. **Ids are forever.** Exercise, ladder, goal, program, template, equipment, cadence and skin ids are stored and synced:
   never rename or remove one (mark it `retired: true` instead, which hides it from generation and pickers).

### 3.2 Types (`src/types/sportask.ts`, framework-free, types only)

```ts
export type Lang = 'en' | 'es';
export interface LocalizedText { en: string; es: string }

export type GoalTag = 'mobility' | 'strength' | 'calories';          // which goals may pick an exercise (extend freely)
export type MovementPattern = 'squat' | 'lunge' | 'hinge' | 'push' | 'pushVertical' | 'pull' | 'core' | 'cardio' | 'mobility';
export type BodyZone = 'neck' | 'shoulders' | 'thoracic' | 'spine' | 'hips' | 'hamstrings' | 'ankles' | 'wrists';
export type MetricKind = 'reps' | 'seconds' | 'cm';
export type Impact = 'none' | 'low' | 'high';
export type Level = 1 | 2 | 3 | 4 | 5;

export interface Dose { reps?: number; seconds?: number }         // exactly one is set

export interface ExerciseDef {
  id: string;
  name: LocalizedText;
  cues: LocalizedText[];               // 1-3 short form cues, shown during the step
  pattern: MovementPattern;
  zones?: BodyZone[];                  // mobility zones it covers (also set on some strength moves)
  tags: GoalTag[];
  metric: MetricKind;                  // what the user records
  perSide?: boolean;                   // the runner splits the work into left/right
  needsOneOf: string[];                // equipment ids, any one suffices; [] = bodyweight
  loadable?: boolean;                  // uses a weight from the inventory (kettlebell/dumbbells)
  level: Level;
  impact: Impact;
  floor: boolean;                      // needs getting down on the floor
  space?: boolean;                     // needs room (jump rope)
  wall?: boolean;
  chair?: boolean;                     // a stable chair or desk
  met: number;                         // approximate MET while working (CONTENT.md §6)
  secondsPerRep?: number;              // to turn a rep target into work time; default 3
  dose: Dose;                          // the default dose at level 1 of a program
  pictogram: string;                   // PictogramId (section 9.3)
  retired?: boolean;
}

export interface LadderDef { id: string; pattern: MovementPattern; rungs: string[][] }  // rungs[i] = alternatives

export interface EquipmentDef {
  id: string;                          // 'band' | 'kettlebell' | 'dumbbells' | 'jumpRope' | 'yogaBall' | ...
  name: LocalizedText;
  icon: string;                        // ui-icon name
  details?: 'weights' | 'bandStrengths'; // which optional details the settings form shows
}
export interface EquipmentItem { owned: boolean; weightsKg?: number[]; bandStrengths?: ('light' | 'medium' | 'heavy')[] }
export type EquipmentInventory = Record<string, EquipmentItem>;   // keyed by EquipmentDef.id; unknown keys are ignored

export interface Constraints { lowImpact: boolean; noFloor: boolean }

export interface CadencePreset {
  id: string;
  name: LocalizedText;
  focusSeconds: number;
  breakSeconds: number;
  longBreak?: { every: number; seconds: number };   // every N-th break is long
  exerciseEvery: number;                            // 1 = every break, 2 = every other break...
}

export interface BlockStep {
  exerciseId: string;
  workSeconds: number;
  restSeconds: number;                 // after this step; the last step's rest may be 0
  target?: Dose;                       // reps or seconds to aim for (absent for "as many as possible")
  side?: 'left' | 'right';
  loadKg?: number;
  round?: number;                      // 1-based round index when the block repeats a circuit
}
export type BlockKind = 'train' | 'warmup' | 'test';
export interface BlockPlan { kind: BlockKind; prepSeconds: number; steps: BlockStep[]; totalSeconds: number; assessmentId?: string }

export interface StepResult { stepIndex: number; done: boolean; value?: number; loadKg?: number }
export type BlockStatus = 'done' | 'partial' | 'skipped';
export type Feedback = 'tooEasy' | 'ok' | 'tooHard';

/** One synced row per break with Sportask exercise. */
export interface SportBlock {
  id: string;
  startedAt: number;                   // epoch ms
  date: string;                        // local 'YYYY-MM-DD' of startedAt
  origin: 'goal' | 'free';
  goalId?: string;
  programId?: string;
  programWeek?: number;                // 1-based
  templateId?: string;                 // free training
  kind: BlockKind;
  assessmentId?: string;
  blockSeconds: number;
  prepSeconds: number;
  steps: BlockStep[];
  results: StepResult[];
  status: BlockStatus;
  rpe?: number;                        // 1..10
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
  name: string;                        // user templates: free text; built-ins use `nameText`
  nameText?: LocalizedText;
  slots: TemplateSlot[];
  format: 'sequence' | 'intervals' | 'emom';
  workSeconds?: number;                // intervals: work per slot
  restSeconds?: number;                // intervals: rest per slot
  minSeconds?: number;                 // shortest block it makes sense in; the random pick respects it
  order: number;
  createdAt: number;
  updatedAt: number;
  builtin?: boolean;
}

export interface Enrolment { goalId: string; programId: string; level: 1 | 2 | 3; startedOn: string; acceptedDisclaimerAt: number }

/** Synced settings, stored as `settings.sportask` in the state blob. */
export interface SportaskSettings {
  enrolment: Enrolment | null;
  cadenceId: string;                   // a preset id or 'custom'
  customCadence?: Omit<CadencePreset, 'id' | 'name'>;
  equipment: EquipmentInventory;
  constraints: Constraints;
  skin: string;                        // SkinDef id
  skinWholeApp: boolean;
  cues: boolean;                       // step sounds
  autoStartBreak: boolean;             // start the block countdown without the preview tap (default false)
}

/** Device-local, never synced. */
export interface SportaskSession {
  active: boolean;
  source: 'pomodoro' | 'multitask' | 'planner';
  mode: 'goal' | 'free';
  templateId: string | 'random' | null;
  cadence: Omit<CadencePreset, 'id' | 'name'>;     // resolved when the session starts
  equipmentOverride: EquipmentInventory | null;    // null = use settings
  startedAt: number;
  breaksSeen: number;                              // focus phases finished in this session
  pending: { blockId: string; plan: BlockPlan; startedAt: number | null } | null;
}
```

### 3.3 Registries and strategies (`src/lib/sportask/`, all lazy)

```ts
// registry.ts
export interface Registry<T extends { id: string }> { all: readonly T[]; byId: ReadonlyMap<string, T>; get(id: string): T | undefined }
export function createRegistry<T extends { id: string }>(items: readonly T[]): Registry<T>; // throws on duplicate ids at module load

// engine/context.ts
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
  rng: () => number;                   // mulberry32(hashString(blockId))
}

// The strategies. P = the generator's phase parameters (typed per goal).
export interface BlockGenerator<P> { id: string; generate(ctx: GenerationContext, params: P): BlockPlan }
export interface ProgressionModel<P> {
  id: string;
  /** Current rung index per ladder, replayed from history (section 8.3). */
  levels(ctx: GenerationContext, params: P): ReadonlyMap<string, number>;
  dose(ex: ExerciseDef, rung: number, ctx: GenerationContext, params: P): { target: Dose; loadKg?: number };
}

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
  higherIsBetter: boolean;             // false for back-scratch gap, toe-touch distance
}

export interface PhaseDef<P> { fromWeek: number; toWeek: number; params: P }
export interface ProgramDef<P> {
  id: string;
  name: LocalizedText;
  summary: LocalizedText;
  weeks: number;                       // after the last week the program repeats from week 1 at the reached levels
  daysPerWeek: number;                 // training days; extra days fall back to restDayGoalId
  phases: PhaseDef<P>[];
  assessmentWeeks: number[];           // weeks whose first eligible block of a day runs a pending assessment
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
  metricIds: string[];                 // dashboard metrics, in display order
  restDayGoalId?: string;              // e.g. strength -> mobility
}
/** The registry stores goals with their parameter type erased; defineGoal keeps each one checked. */
export type AnyGoal = GoalDef<any>;    // the one allowed `any`, documented here
export function defineGoal<P>(goal: GoalDef<P>): AnyGoal { return goal; }

export interface MetricDef {
  id: string;
  name: LocalizedText;
  unit: LocalizedText;
  chart: 'line' | 'bars' | 'stackedBars' | 'heatmap' | 'stat';
  compute(blocks: readonly SportBlock[], range: DateRange, env: MetricEnv): Series;
}
export interface SkinDef { id: string; name: LocalizedText; colorScheme: 'light' | 'dark'; preview: [string, string, string] }
```

Typing notes: `noPropertyAccessFromIndexSignature` is on, so read `EquipmentInventory` with `inv['band']`. Do not
use constructor parameter properties. `GoalDef<any>` behind `defineGoal` is the only `any` allowed.

### 3.4 File map

```
src/types/sportask.ts                          types only (eager is fine: erased)
src/services/sportask-settings.service.ts      EAGER  localStorageSignal 'productivist.sportask' (SportaskSettings, raw) + setters
src/services/sportask.service.ts               EAGER  session (localStorageSignal 'productivist.sportaskSession'), clock hooks, entry API
src/services/sport-data.service.ts             EAGER  blocks + templates stores (dumb CRUD), like FlowService
src/lib/sync-engine.ts                         EAGER  + sportBlockCodec, sportTemplateCodec, canonical step/result/slot order
src/lib/sportask/registry.ts                   lazy
src/lib/sportask/equipment.ts                  lazy   EQUIPMENT registry
src/lib/sportask/catalog/mobility.ts           lazy   ExerciseDef[] (CONTENT.md §2)
src/lib/sportask/catalog/strength.ts           lazy   (CONTENT.md §3)
src/lib/sportask/catalog/calories.ts           lazy   (CONTENT.md §4)
src/lib/sportask/catalog/ladders.ts            lazy   (CONTENT.md §3.1)
src/lib/sportask/catalog/assessments.ts        lazy   (CONTENT.md §5)
src/lib/sportask/catalog/index.ts              lazy   CATALOG: Catalog, CATALOG_VERSION
src/lib/sportask/goals/mobility.ts             lazy   defineGoal(...) + its generator/progression params
src/lib/sportask/goals/strength.ts             lazy
src/lib/sportask/goals/calories.ts             lazy
src/lib/sportask/goals/index.ts                lazy   GOALS: Registry<AnyGoal>
src/lib/sportask/templates.ts                  lazy   BUILTIN_TEMPLATES (CONTENT.md §8)
src/lib/sportask/cadences.ts                   lazy   CADENCES (section 5.1)
src/lib/sportask/skins.ts                      lazy   SKINS
src/lib/sportask/engine/rng.ts                 lazy   mulberry32, seedFrom(id)
src/lib/sportask/engine/filter.ts              lazy   available(ex, ctx): equipment, constraints, retired
src/lib/sportask/engine/select.ts              lazy   pickExercise(candidates, ctx, opts): weighted, avoids recent ones
src/lib/sportask/engine/fit.ts                 lazy   slotsFor(blockSeconds, kind), toSteps(...): fill the block length
src/lib/sportask/engine/progression.ts         lazy   ladder replay (double progression), shared by goals
src/lib/sportask/engine/schedule.ts            lazy   programWeek, phaseFor, isTrainingDay, assessmentDue
src/lib/sportask/engine/generate.ts            lazy   generateBlock(ctx, session, settings): BlockPlan (the one entry point)
src/lib/sportask/engine/template-plan.ts       lazy   planFromTemplate(template, ctx)
src/lib/sportask/runner.ts                     lazy   stepAt(plan, elapsedSeconds): the timeline state (section 6.3)
src/lib/sportask/metrics/*.ts                  lazy   MetricDef[] + METRICS registry (section 10)
src/lib/sportask/kcal.ts                       lazy   netKcal(block, catalog, kg)
src/lib/sportask/sanitize.ts                   lazy   sanitizeSettings, sanitizeBlock, sanitizeTemplate (untrusted input)
src/lib/sportask/charts.ts                     lazy   pure SVG geometry for the chart components
src/lib/sportask/texts.ts                      lazy   localize(text, lang); loadSportaskTexts(translate)
src/i18n/sportask-texts.ts                     lazy   SPORTASK_TEXTS { en, es }
src/app/components/sportask-*/                 lazy   components (section 9, 10)
backend/.../V8__sportask.sql + DTOs + SyncService + README
scripts/sportask-check.ts, scripts/check-sportask.mjs
```

---

## 4. Persistence and sync

### 4.1 Client stores

- `SportaskSettingsService` (root, eager): `settings = localStorageSignal<unknown>('productivist.sportask', DEFAULTS)`
  plus `update(patch)`. It does **no** validation (that code would sit in the initial bundle). Lazy consumers read
  `sanitizeSettings(settings())` in a `computed`, and sanitizing fills defaults for missing or unknown fields.
  Defaults: `enrolment: null`, `cadenceId: 'classic'`, empty `equipment`, both constraints `false`, `skin: 'cyberpunk'`,
  `skinWholeApp: true`, `cues: true`, `autoStartBreak: false`. Body weight: a separate device-local
  `localStorageSignal<number | null>('productivist.sportaskWeightKg', null)` that is **not** in the blob.
- `SportDataService` (root, eager, no dependencies): `blocks = localStorageSignal<SportBlock[]>('productivist.sportBlocks', [])`,
  `templates = localStorageSignal<SportTemplate[]>('productivist.sportTemplates', [])`, `addBlock`, `updateBlock(id, patch)`
  (stamps `updatedAt`), `removeBlock`, `upsertTemplate`, `removeTemplate`, `exportSport()`/`importSport()` (the import
  sanitizes through a dynamic `import('../lib/sportask/sanitize')`), `reset()`. Keep it as small as `FlowService`.
  **Retention:** blocks are small (~0.5 kB). No pruning in v1; note the size in the README.

### 4.2 Sync engine (`src/lib/sync-engine.ts`)

- `sportBlockCodec` and `sportTemplateCodec`, following the existing codecs. Optional fields (`goalId`, `programId`,
  `programWeek`, `templateId`, `assessmentId`, `rpe`, `feedback`, and in steps `target`, `side`, `loadKg`, `round`, and in
  results `value`, `loadKg`) are emitted **only when set**.
- **Canonical order inside JSON arrays.** `steps`, `results` and `slots` are stored as Postgres JSONB, which reorders
  object keys. Write `canonicalSteps`/`canonicalResults`/`canonicalSlots` (fixed key order, optionals only when set,
  `null`s dropped), as `canonicalSource` does, and use them in `toWire`, so a row's hash survives the round trip. The
  self-check asserts it.
- `SyncService`: diff the two new signals like the others, then add `sportBlocks` and `sportTemplates` to push/pull.
  Also add `sportask: settings.settings()` inside `buildState().settings`, and in `applyState` apply it only when it is a
  plain object (`isObject`). `SportDataService` needs no knowledge of sync.

### 4.3 Backend

`backend/src/main/resources/db/migration/V8__sportask.sql`:

```sql
-- Sportask: one row per training block (a break's plan + results) and the user's free-training templates.
-- Same conventions as the other synced tables (client ids, last-write-wins on updated_at, tombstones, seq cursor).
-- Vocabulary (goal, program, exercise, template ids) is free text on purpose: new content needs no migration.
CREATE TABLE sport_blocks (
    user_id        BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id             TEXT    NOT NULL,
    started_at     BIGINT  NOT NULL,
    date           TEXT    NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
    origin         TEXT    NOT NULL CHECK (origin ~ '^[A-Za-z0-9_.-]{1,64}$'),
    goal_id        TEXT    CHECK (goal_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
    program_id     TEXT    CHECK (program_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
    program_week   INTEGER CHECK (program_week BETWEEN 1 AND 520),
    template_id    TEXT    CHECK (length(template_id) <= 64),
    kind           TEXT    NOT NULL CHECK (kind ~ '^[A-Za-z0-9_.-]{1,64}$'),
    assessment_id  TEXT    CHECK (assessment_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
    block_seconds  INTEGER NOT NULL CHECK (block_seconds BETWEEN 1 AND 7200),
    prep_seconds   INTEGER NOT NULL CHECK (prep_seconds BETWEEN 0 AND 120),
    steps          JSONB   NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 120),
    results        JSONB   NOT NULL CHECK (jsonb_typeof(results) = 'array' AND jsonb_array_length(results) <= 120),
    status         TEXT    NOT NULL CHECK (status IN ('done', 'partial', 'skipped')),
    rpe            INTEGER CHECK (rpe BETWEEN 1 AND 10),
    feedback       TEXT    CHECK (feedback ~ '^[A-Za-z0-9_.-]{1,32}$'),
    catalog_version INTEGER NOT NULL CHECK (catalog_version >= 0),
    created_at     BIGINT  NOT NULL,
    updated_at     BIGINT  NOT NULL,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    seq            BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX sport_blocks_seq_idx ON sport_blocks (user_id, seq);

CREATE TABLE sport_templates (
    user_id      BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id           TEXT    NOT NULL,
    name         TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    slots        JSONB   NOT NULL CHECK (jsonb_typeof(slots) = 'array' AND jsonb_array_length(slots) BETWEEN 1 AND 40),
    format       TEXT    NOT NULL CHECK (format ~ '^[A-Za-z0-9_.-]{1,32}$'),
    work_seconds INTEGER CHECK (work_seconds BETWEEN 5 AND 600),
    rest_seconds INTEGER CHECK (rest_seconds BETWEEN 0 AND 600),
    min_seconds  INTEGER CHECK (min_seconds BETWEEN 0 AND 7200),
    sort_order   DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at   BIGINT  NOT NULL,
    updated_at   BIGINT  NOT NULL,
    deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    seq          BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX sport_templates_seq_idx ON sport_templates (user_id, seq);
```

- `SyncDtos`: `SportBlockDto` and `SportTemplateDto`. Every optional field is a **wrapper type** (`Integer programWeek`,
  `Integer rpe`, `Integer workSeconds`...), never a primitive (see AGENTS.md: Jackson 3 + `FAIL_ON_NULL_FOR_PRIMITIVES`).
  `steps`/`results`/`slots` are `JsonNode`. Add `@Size`/`@Pattern` mirroring the SQL. Add optional
  `List<@Valid SportBlockDto> sportBlocks` and `sportTemplates` to `PushRequest`/`PullResponse`, so older clients keep
  working.
- `SyncService.java`: read/write like recurrences. Validate JSON element shapes as is done for flow layouts. A step needs
  an `exerciseId` string ≤ 64, `workSeconds`/`restSeconds` integers 0..3600, and if present `target.reps` 1..1000,
  `target.seconds` 1..3600, `side` in left/right, `loadKg` 0..500, `round` 1..100. A result needs a `stepIndex` integer
  0..119, a boolean `done`, and if present `value` −1000..100000 (number) and `loadKg` 0..500. A slot has an `exerciseId`
  or a `pattern`, each a string ≤ 64. Each JSONB value is capped at 32 kB of text. Reject the row (like other invalid
  rows), not the whole push.
- `AdminController.Stats`: add `sportBlocks` (count where not deleted). Never expose content.
- `backend/README.md`: document both tables, the shapes and the "vocabulary is free text" rule.

### 4.4 Export / import / reset

Export becomes `version: 6` and adds `sportBlocks` and `sportTemplates`. Import accepts 2 to 6 (missing arrays are empty)
and sanitizes every row (`sanitizeBlock`/`sanitizeTemplate`: drop malformed rows, clamp numbers, drop unknown keys).
Settings travel through the state blob as today. The full Reset clears `SportDataService`, the settings, the session and
the weight.

---

## 5. Cadences and the clock

### 5.1 Presets (`lib/sportask/cadences.ts`)

| id | Focus / break | Long break | Exercise every | Typical use |
| --- | --- | --- | --- | --- |
| `micro` | 5 min / 1 min | — | 1 | micro-blocks: one exercise or two short ones |
| `short` | 10 min / 2 min | — | 1 | two exercises or one with rest |
| `classic` | 25 min / 5 min | 15 min every 4 | 1 | a mini-circuit; a longer session in the long break |
| `deep` | 50 min / 10 min | — | 1 | a full circuit (2-3 rounds) |
| `classicAlt` | 25 min / 5 min | 15 min every 4 | 2 | exercise every other break; the rest are normal breaks |
| `custom` | user-defined (focus 5..180 min, break 0.5..60 min in 30 s steps, long break optional) | | 1..8 | |

The limits are `MIN_DURATION_SECONDS`, `MAX_FOCUS_SECONDS` and `MAX_BREAK_SECONDS` from `settings.service.ts`.

### 5.2 Hooks in `ClockService` (the only changes there)

1. `readonly focusCount = signal(0)`, incremented in `switchToNextMode()` when a focus phase ends (`wasFocus`). Not
   persisted. `SportaskService` reads it.
2. `durationSeconds` reads an override:
   ```ts
   private readonly sportask = inject(SportaskService);   // eager and tiny; it must not inject ClockService back
   readonly durationSeconds = computed(() => {
     const o = this.sportask.durationOverride();          // { focus: number; break: number } | null
     if (o) return this.mode() === 'focus' ? o.focus : o.break;
     return this.mode() === 'focus' ? this.settings.focusSeconds() : this.settings.breakSeconds();
   });
   ```
   **DI direction:** `SportaskService` must not inject `ClockService`, or the two would form a cycle. Instead,
   `SportaskService` exposes `bindClock(clock: ClockPort)`, called once by `AppComponent` with a narrow adapter
   (`mode`, `running`, `focusCount`, `sessionModalOpen`, `start()`, `startNextSession()`, `dismissSessionModal()`,
   `reset()`). `durationOverride` is computed from the session: the cadence's focus and break, and for the long break
   the case `(breaksSeen + 1) % longBreak.every === 0`.
   The existing effect that resets the remainder when the duration changes already skips a running session, so turning
   Sportask on mid-focus changes the lengths from the next phase on. Keep it that way, and verify Pause still keeps the
   remainder (see the `untracked` note in AGENTS.md).
3. `playCue(id: 'step' | 'countdown' | 'end')`: loads `lib/bell-sounds.ts` (lazy, as `start()` does) and plays a short
   synthesized cue through the existing `AudioContext`. Add `cue(ctx, id)` to `bell-sounds.ts`: three 80-150 ms tones
   through the master gain. It respects `settings.bellSound()` and `sportask.cues`.

### 5.3 `SportaskService` (root, eager, minimal)

- State: `session = localStorageSignal<SportaskSession | null>('productivist.sportaskSession', null)`, plus
  `active = computed(() => session()?.active === true)`.
- Entry API:
  - `start(opts: { source; mode; templateId; cadence; equipmentOverride })` sets `breaksSeen: 0` and `pending: null`.
  - `stop()` clears the session. It does not touch the clock state beyond what the override change implies.
  - `armForPlanner(opts)` / `disarmPlanner()` / `armed` keep a device-local "start Sportask when this plan launches"
    (`productivist.sportaskArmed`).
  - `activateArmed(source)` is called by the planner's launch functions.
- The break trigger, in an `effect` that reads `clock.focusCount()` and only schedules a microtask (never writes signals
  inside the effect): when it increases while `active()`, increment `breaksSeen`. If
  `breaksSeen % cadence.exerciseEvery === 0`, set `breakOpen` (a signal) to true and leave `pending` for the lazy modal
  to fill. Otherwise this is a normal break: do nothing.
- `breakOpen` is a signal that `AppComponent` renders from (section 6). `closeBreak()`.
- `suppressSessionModal = computed(() => breakOpen())`. `pomodoro-clock` hides its "session complete" dialog while it is
  true (one `@if` condition). Multitask has no such dialog.
- No catalog, no engine, no texts here.

### 5.4 Multitask

The Multitask view uses the same `ClockService`, so the hooks work as-is. Before implementing, check in
`multitask-view` and `multitask.service.ts` what happens when a focus phase ends (there is no session dialog). The
Sportask modal must not double-start or skip a lot advance. If Multitask auto-starts the break, the modal opens on the
running break and skips its preview.

---

## 6. Running a block

### 6.1 Where it renders

`AppComponent` renders `@if (sportask.breakOpen()) { @defer (on immediate) { <app-sportask-break-modal /> } }` outside
the view chain, like `alarm-modal`, with `--modal-z: 60`: above the Plan-my-day modal and task details, below the alarm
modal (200), which must still show over it.

### 6.2 Modal states (`sportask-break-modal`)

1. **Generate** (on init, lazy). If `session.pending` exists with a plan (reload, other tab), reuse it. Otherwise build
   the `GenerationContext` (history from `SportDataService`, settings sanitized, effective equipment), call
   `generateBlock`, and store `pending = { blockId: createId(), plan, startedAt: null }`.
2. **Preview**: a heading with the block kind ("Fuerza · semana 2" / "Entrenamiento libre · Tabata piernas" /
   "Test: flexiones máximas"), the list of steps (pictogram, name, dose, side), the total time, and the always-visible
   line "Si algo duele, para." Actions: *Empezar* (primary, focused; `clock.start()` from this click, which also unlocks
   audio), *Otro* (regenerate with a new block id: at most 3 per break, then hidden), *Saltar* (records a `skipped`
   block and closes, so the clock goes back to a normal break: the caller dismisses the modal and the user starts the
   break as usual), and *Salir de Sportask* (in a ⋯ menu: `stop()`).
   With `autoStartBreak`, or when the break is already running, go straight to Running.
3. **Running**: the runner state `stepAt(plan, elapsed)` comes from the clock's remaining time
   (`elapsed = totalSeconds - remainingSeconds`), so pause/resume and reloads are free. The screen shows the current
   step (large pictogram, name, cue, side, target), the step countdown, a progress strip of all steps, and "Next: …"
   during rest. Controls: *Pausa/Reanudar* (the clock), *Terminar ya* (to Results), *Hecho* on rep steps (marks the step
   done early; the timeline is not shifted, the rest just gets longer). A visually hidden `role="status"` announces step
   changes ("Siguiente: sentadillas, 30 segundos"). `playCue('countdown')` at 3-2-1 and `playCue('step')` at each change
   (only while the page is visible).
4. **Results**: shown when the break ends (the clock switched to focus; the bell rang) or on *Terminar ya*. One row per
   step, or per exercise when rounds repeat: a `number-stepper` prefilled with the target (reps, seconds or cm), a
   `loadKg` stepper if loadable, and a done check. Quick feedback is a `.segmented` *Fácil / Bien / Duro* (default Bien)
   plus an optional RPE 1..10. For a test: one big field with the unit, and per side when `perSide`.
   *Guardar y volver al trabajo* (primary): `addBlock(...)`, then `clock.startNextSession()`. *Guardar* only saves and
   closes, leaving the session dialog to the clock. Status is `done` if every step is done, else `partial`.
   Escape on Results asks to save first: an inline `.confirm-bar` "¿Descartar las marcas?" with *Guardar* and
   *Descartar* (the latter records `skipped`).
5. Close: clear `pending`, `closeBreak()`.

Focus is trapped, Escape behaves as above, and it is `role="dialog" aria-modal`. On phones the modal is a full-screen
sheet using the safe areas. It must work in the Thunderbird tab, which has no inline scripts.

### 6.3 Runner (`lib/sportask/runner.ts`, pure)

```ts
export interface RunnerState { phase: 'prep' | 'work' | 'rest' | 'done'; stepIndex: number; stepElapsed: number; stepRemaining: number; next: BlockStep | null }
export function timeline(plan: BlockPlan): { start: number; end: number; phase: 'prep' | 'work' | 'rest'; stepIndex: number }[];
export function stepAt(plan: BlockPlan, elapsedSeconds: number): RunnerState;
```

`plan.totalSeconds === prepSeconds + Σ(work + rest)` and it must be ≤ the block length (the self-check asserts it).

### 6.4 Native and the chip

Out of scope for v1, listed in phase 8. The mobile notification at the end of focus can name the exercise once
`pending` is generated at focus end. The `pomodoro-chip` can show a small Sportask dot.

---

## 7. Entry points

### 7.1 Pomodoro and Multitask views

A `.btn--secondary.btn--sm` *Sportask* button (a new `ui-icon` named `dumbbell`, drawn on the 24px grid with a 1.75
stroke; icon-only below 600 px with an `aria-label`) next to the existing mode controls in `pomodoro-clock` and in
`multitask-view`.

- **Off:** it opens `sportask-setup-sheet`.
- **On:** it shows as pressed (`aria-pressed="true"`) with a small summary ("Fuerza · 25/5"), and clicking it opens a
  small popover with *Cambiar…* (the setup sheet) and *Salir de Sportask*.

The views are lazy chunks already, so the button costs nothing in the initial bundle. Only its eager label key
`sportask.name` is eager.

### 7.2 Setup sheet (`sportask-setup-sheet`, lazy, modal)

- **What to train:** a `.segmented` *Mi objetivo* | *Entrenamiento libre*.
  - Objetivo: the enrolled goal's card (name, program, "Semana 3 de 6", next test). With no enrolment: "Elige un
    objetivo" opens Configuration › Sportask, through `ViewService.openConfiguration('sportask')`.
  - Libre: a list of templates (built-in and user ones) filtered to those whose `minSeconds` fits the chosen break, plus
    *Al azar*. A template that needs equipment the user lacks shows as unavailable, with the reason.
- **Rhythm:** the cadence presets as radio rows with a one-line description, plus custom fields (focus, break, long
  break every/length, exercise every N) through `number-stepper`. A short warning appears for combinations that make
  little sense (a 30 s break with a strength goal: "Solo cabe un ejercicio corto").
- **Equipment today:** chips of owned equipment, toggleable for this session only (`equipmentOverride`), plus "Sin
  material".
- **Footer:** *Cancelar*, *Activar Sportask* (primary).
- **First time with a goal:** if the disclaimer is not accepted, a `.confirm-bar`-style block shows the disclaimer text
  (CONTENT.md §9) and the primary button reads *Acepto y activo*.
- **Context:** when opened from the planner, the primary button reads *Guardar para el plan* and calls
  `armForPlanner(opts)` instead of `start`.

### 7.3 Plan my day

In `plan-objectives-step`'s sticky footer, a `.switch` *Sportask* with the summary line and *Cambiar* (it opens the
setup sheet in planner context). On → `armForPlanner`, off → `disarmPlanner`. In `daily-backlog-view.component.ts`,
`goToPomodoro()` and `doLaunchMultitask()` call `this.sportask.activateArmed('planner')` after setting the view.
`activateArmed` starts the armed session and clears `armed`. The switch's state is `SportaskService.armed`, shown again
if the wizard is reopened.

---

## 8. The engine

### 8.1 `generateBlock(ctx, session, settings): BlockPlan`

1. **Free mode:** pick a template (`templateId`, or random among available ones whose `minSeconds ≤ blockSeconds`,
   avoiding the last 2 used, weighted by `rng`), then `planFromTemplate`.
2. **Goal mode:** `goal = GOALS.get(enrolment.goalId)`, `program`, `week = programWeek(enrolment.startedOn, today, program.weeks)`
   (cycling after the last week), `phase = phaseFor(program, week)`.
   - If today is not a training day (`isTrainingDay`: the count of distinct dates with a `done`/`partial` goal block this
     ISO week has reached `daysPerWeek`, and today is not one of them) and the goal has `restDayGoalId`, generate with
     that goal at its first program's phase 1. The preview labels it "Día de descanso: movilidad". *Entrenar igualmente*
     in the preview regenerates with the main goal.
   - If an assessment is due (`assessmentDue`: an assessment week, this assessment not yet recorded this week, today
     already has ≥ 1 `done` block, and it fits: `assessment.seconds + prep ≤ blockSeconds`), return the test plan:
     prep 15 s + one step (two when `perSide`).
   - Otherwise `goal.generator.generate(ctx, phase.params)`.
3. **Warm-up rule:** if `todayBlocks` has no `done` block, the generator is called with `warmup: true` in its params.
   Each generator then caps the level at 2, the impact at `low`, and the dose at 70%, and the plan's kind is `warmup`.
4. **Fallback:** if no exercise survives the filters (e.g. `noFloor` + nothing owned), use `mobility` with the same block
   length, and if even that is empty, a single `marchInPlace`/`standingCatCow` step (both bodyweight, no floor). The
   preview explains why ("Con estas restricciones solo hay …"). Never return an empty plan.

### 8.2 Shared helpers

- `available(ex, ctx)` returns false when the exercise is `retired`, or `needsOneOf` is not empty and none of those items
  is `owned` in the effective inventory, or `constraints.lowImpact && ex.impact === 'high'`, or
  `constraints.noFloor && ex.floor`. `space`/`wall`/`chair` are informational (shown in the preview), not filters.
- `pickExercise(candidates, ctx, { avoidIds, preferZones?, maxLevel? })` scores each candidate: 1, ×0.2 if used in the
  last 3 blocks, ×0.5 if used today, ×1.5 if it covers a preferred zone, ×1.2 if it uses owned equipment (so equipment
  actually gets used). Then it does a weighted pick with `ctx.rng`. Deterministic for a given seed.
- `slotsFor(blockSeconds)` → `{ prep, slots, rounds }`. This is how a block length becomes a structure. Each generator
  decides what a slot holds; this only sizes it:

  | Block length | Prep | Structure |
  | --- | --- | --- |
  | < 45 s | 5 s | 1 slot, no rest |
  | 45-89 s | 10 s | 1 slot (strength/calories) or 2 slots (mobility) |
  | 90-179 s | 10 s | 2 slots, rest between |
  | 180-419 s | 15 s | 3-4 slots, 1 round |
  | 420-899 s | 15 s | 3-5 slots × 2 rounds |
  | ≥ 900 s | 20 s | 4-6 slots × 2-3 rounds, + 60-90 s of mobility at the end |

  Each generator turns slots into steps whose time adds up to ≤ the block length. Leftover time becomes the last step's
  rest ("Respira / camina"), never a silent gap.
- Time for a rep target: `reps × (secondsPerRep ?? 3)`, plus 5 s, capped by the slot. If the slot is shorter, the target
  is reduced to fit, never the opposite.
- Per-side exercises become two consecutive steps (`side: 'left'`, then `'right'`) splitting the slot.

### 8.3 Progression (`engine/progression.ts`, shared by strength and, for holds, mobility)

**Double progression on ladders.** It is replayed from history so it needs no stored state:

- Start rung per ladder: from `enrolment.level` (1 → rung 0, 2 → rung 1, 3 → rung 2), clamped to the ladder.
- Walk the goal's `done`/`partial` blocks oldest first. For each step whose exercise belongs to a ladder rung:
  - "success" = recorded `value ≥ phase.repRange.max` (or `≥ holdRange.max` for seconds) and the block's feedback is not
    `tooHard`.
  - "failure" = `value < phase.repRange.min`, or feedback `tooHard`.
  - Two successes in a row on the current rung (across blocks) → the next rung that has an available alternative
    (unavailable rungs are skipped); with none above, the dose keeps increasing, up to 1.5 × the range max.
  - Two failures in a row → rung − 1 (not below 0).
  - Feedback `tooEasy` counts as one extra success.
  - An assessment result above the rung's range max moves the user up immediately.
- **Dose** at the current rung: reps = the range min at first, then the last value + 1, up to the range max (or the
  seconds equivalent). For a loadable exercise, `loadKg` = the lightest owned weight that is ≥ the last load. After two
  successes at the range max with load, take the next owned weight and reset the reps to the min. Without owned weights
  (unknown kg), show "carga moderada" and no number.

The rules are deliberately simple and conservative. The self-check covers: never two rungs up in one block, never above
the top, never a rung the equipment can't do.

### 8.4 The three generators

The exact parameters per goal and phase are in CONTENT.md. Summary:

- **Mobility:** the day's focus is from `dayFocus = ['upper', 'lower', 'spine']` by day index in the week. The zones of
  the focus are covered round-robin across the day's blocks, preferring zones not covered today. Each slot is a hold
  (`seconds`) or controlled reps from the params, with holds growing by phase (20 → 30 → 45 s). Loaded variants (halo,
  goblet pry, band pass-throughs) are only from phase 2 and only if owned.
- **Strength:** the pattern order cycles `push → squat → pull → hinge → core → lunge` (plus `pushVertical` when
  dumbbells/kettlebell/band are owned, in phase 2+). The next pattern is the one with the biggest deficit against today's
  target sets (`phase.setsPerPatternPerDay`), never the same pattern as the previous block, and never above the daily
  cap. In a multi-slot block, the slots take the next patterns in that order. Dose from the progression. Rest between
  sets from the params.
- **Calories:** intervals with `work:rest` from the phase (20:40 → 30:30 → 40:20). Exercises alternate lower body / full
  body / upper body to spread fatigue. Impact `high` is only allowed from phase 2 and if `!lowImpact`. Long blocks use
  the phase's `longFormat`: `circuit`, `tabata` (8 × 20:10 on 2-4 exercises, only phase 3) or `emom`.

### 8.5 Free templates (`engine/template-plan.ts`)

`planFromTemplate(t, ctx)` resolves each slot: an `exerciseId` if available, otherwise an equivalent from the same
pattern; a `{ pattern, tag, zone }` slot through `pickExercise`. Then it fits by format:

- `sequence`: each slot gets an equal share.
- `intervals`: slots cycle with `workSeconds/restSeconds` until the block is full.
- `emom`: per minute, the slot's reps, then rest until the minute ends; needs ≥ 120 s.

The dose is the exercise's default (or the slot's). Free blocks are not used by the progression replay (origin
`free`), but they count in metrics.

---

## 9. UI: Configuration and skins

### 9.1 Configuration › Sportask

`ConfigSection` gains `'sportask'` (and so does `ViewService.openConfiguration`). The section's content is a lazy
`sportask-settings` inside `@defer`. Only `config.sportask` ("Sportask") is an eager key. Blocks, top to bottom:

1. **Objetivo:** the goal cards (icon, name, one-line description, program length). The selected one shows its program
   picker (only one program per goal in v1, still a picker), level (*Empiezo de cero* / *Algo de base* / *Entreno
   habitualmente*) and *Empezar el programa* (sets `startedOn = today`). A different goal or program asks inline to
   change, saying that history is kept. *Dejar el programa* sets `enrolment = null`. The disclaimer is accepted here or
   in the setup sheet.
2. **Material en casa:** one row per `EquipmentDef`, a `.switch` *owned*, and when owned and the def has `details`: the
   weights as `tag-input`-like chips of numbers in kg (e.g. 8, 12, 16) or the band strengths as `.filter-chip`s.
3. **Restricciones:** `.switch`es *Sin saltos (bajo impacto)* and *Sin suelo (oficina)*.
4. **Ritmo por defecto:** the cadence presets (radio rows) and the custom fields.
5. **Estilo:** two large preview tiles for the skins (`SkinDef.preview` colours + name), a `.switch` *Aplicar a toda la
   app durante la sesión*, a `.switch` *Sonidos de cada paso*, and a `.switch` *Empezar el bloque sin confirmar*.
6. **Peso corporal (opcional, solo en este dispositivo):** a `number-stepper` in kg, with the note "Solo para estimar
   calorías. No se sincroniza."

### 9.2 Skins

- **Mechanism.** `AppComponent` sets `data-sport-skin="<id>"` on `<html>` with an `effect()` (next to the `data-theme`
  effect) when `view === 'sportask'`, or when Sportask's `active()` and `skinWholeApp`, or always on the Sportask
  surfaces, which also carry the class `sport-skin` themselves. The tokens live in a lazy `sportask-skin` component
  (`ViewEncapsulation.None`, no template) rendered by `AppComponent` inside `@if (skinOn()) { @defer … }`, so the CSS
  ships in a lazy chunk and never in the initial `style.css`. Its stylesheet redefines **every** `--color-*` token from
  `style.css` `:root` (read the list there) under `:root[data-sport-skin='cyberpunk']` and
  `:root[data-sport-skin='powerYoga']` (and the same under `.sport-skin`). It also sets `color-scheme`, and adds the
  skin's own tokens: `--sport-radius`, `--sport-outline`, `--sport-shadow`, `--sport-font-display`, `--sport-glow`,
  `--sport-bg-pattern`. The Sportask components only use those tokens, so a third skin is one more CSS block plus a
  `SKINS` entry.
- **Cyberpunk (cartoon neon), dark.**
  - Colours: background `#0f0a1f`, surface `#1a1233`, surface-alt `#251a47`, text `#f4f1ff`, muted `#b7a9e6`, primary
    `#ff2e88` (neon magenta), accent cyan `#19e3ff`, yellow `#ffe14d`, border `#3d2d73`.
  - Cartoon look: 3px dark ink outlines (`#07040f`), hard offset shadows `4px 4px 0 #07040f`, slightly skewed headings
    (`transform: skewX(-6deg)` on display titles only), a faint perspective grid as `--sport-bg-pattern` (CSS gradients,
    no image), and a neon glow (`text-shadow`/`drop-shadow` in primary/cyan) on the timer.
  - Display font: **Orbitron** (OFL 1.1) for numbers and headings, bundled as `src/fonts/orbitron-*.woff2` with its
    licence file; body stays system-ui.
  - Motion: the timer flickers once per step change; a scanline sweep on the preview. Both are off under
    `prefers-reduced-motion`.
- **Power yoga, light.**
  - Colours: background `#fbf4ea` (sand), surface `#fffaf3`, surface-alt `#f3e5d3`, text `#3b2a35` (plum), muted
    `#7c6670`, primary `#c4572f` (terracotta), saffron `#eaa13b`, sage `#7f9f7a`, border `#ead9c4`.
  - Look: 20-24px radii, soft shadows `0 8px 24px rgb(60 30 20 / 0.08)`, a sun/mandala line drawing as a background
    SVG (inline, in the component CSS as a data URI ≤ 2 kB), and a "breathing" ring on the timer
    (`scale 1 → 1.04`, 4 s ease-in-out loop).
  - Display font: **Quicksand** (OFL 1.1), bundled the same way.
  - Motion: the slow breathing ring; off under `prefers-reduced-motion`.
- **Contrast:** check every text/background pair of both skins against WCAG AA (4.5:1 body, 3:1 large and UI) and fix
  the values if any pair fails. Write the measured ratios in a comment above each block.
- **Thunderbird CSP:** fonts and data-URI images in CSS are fine; no inline `<script>`, no remote URLs.

### 9.3 Pictograms (`sportask-pictogram`)

One component, `<app-sportask-pictogram [id]="ex.pictogram" [animate]="running" />`. It draws inline SVG on a 64px grid
with two key poses per pictogram (`A`, `B`) as stroke paths, alternated by CSS (`animation: steps(1)` at the exercise's
tempo; static pose A under reduced motion). The shapes are data in a lazy `lib/sportask/pictogram-paths.ts`
(`PICTOGRAMS: Record<string, { a: string[]; b: string[] }>`), like `project-icon-paths.ts`. Stroke width and colour come
from the skin tokens: neon stroke + glow + ink outline in cyberpunk, rounded soft stroke in power yoga. The v1 set is 17
pictograms, one per movement family:

`squat, lunge, hinge, bridge, pushup, plank, sidePlank, row, press, pullApart, jump, march, rope, ballSit, seated, stretchStand, stretchFloor`

The catalog maps each exercise to one of them. Per-exercise artwork is a later phase.

---

## 10. The Sportask panel (view `sportask`)

- `AppView` gains `'sportask'`: add it to `VIEWS`, give it an `@defer (on immediate)` branch in `app.component.html`
  with `sportask-view`, add an entry in `app-menu` (an eager label key `menu.sportask`, or reuse `sportask.name`), and
  register it in `check-lazy-chunks.mjs`.
- `sportask-view` is the shell: the title "Sportask", the enrolment line ("Fuerza · semana 3/6 · próximo test el
  lunes"), *Entrenar ahora* (runs one block outside the Pomodoro: opens the setup sheet in "single block" mode with a
  block length picker of 1/2/5/10 min, then the break modal driven by a local countdown instead of the clock; implement
  this in phase 7 only if time allows, otherwise move it to phase 8), and `.tabs`: **Resumen | Progreso | Historial |
  Plantillas**.
- **Resumen:** stat tiles (this week: blocks done / offered, active minutes, streak in days, kcal if a weight is set), a
  12-week activity heatmap (days × blocks), and the goal's headline metric chart.
- **Progreso:** a range `.segmented` (4 / 12 / 52 weeks, Todo), then one chart per id in `goal.metricIds`, then the
  assessments: a line per assessment with the left/right series when per side, the best value and the change since the
  first test. Free-mode metrics are shown when there is no enrolment.
- **Historial:** blocks grouped by day (newest first). Each row: time, kind badge, goal/template, exercise summary
  ("3 × flexiones · 2 × sentadillas"), status, RPE. A ⋯ `kebab-menu` has *Editar marcas* (reopens the Results form in a
  modal on that block → `updateBlock`) and *Eliminar* (inline `.confirm-bar`). Personal records go at the top: the best
  value per exercise and metric.
- **Plantillas:** built-ins (read-only, *Duplicar*) and user templates (*Editar*, *Eliminar*). *Nueva plantilla* opens
  `sportask-template-editor`, which follows the `task-detail-modal` draft pattern (draft against a baseline, Save
  disabled until dirty, discard `.confirm-bar`). Its fields: name, format, work/rest, and slots, each a fixed exercise
  (searchable picker using `normalizeQuery` over the localized names) or a pattern + tag/zone, reorderable with Alt+↑/↓
  and a ⋯ menu.
- **Metrics** (`lib/sportask/metrics/`, a `METRICS` registry; v1 list):

  | id | chart | what |
  | --- | --- | --- |
  | `adherence` | stackedBars | per week: done / partial / skipped blocks |
  | `activeMinutes` | bars + target line | per week: Σ work seconds / 60; target from the calories program, else none |
  | `netKcal` | bars | per week: Σ net kcal (only with weight) |
  | `heatmap` | heatmap | per day: blocks done |
  | `setsPerPattern` | stackedBars | per week: sets by movement pattern |
  | `ladderLevel` | line (stepped) | per pattern: the rung over time (replayed) |
  | `zonesCovered` | stackedBars | per week: blocks per body zone (a block counts once in every zone it works, so a stack adds up zone visits) |
  | `assessment:<id>` | line | one series per assessment (and side) |
  | `density` | line | per week: work / (work + rest) of calories blocks |

  Goals list theirs: mobility `heatmap, zonesCovered, assessment:*`; strength `setsPerPattern, ladderLevel,
  assessment:*`; calories `activeMinutes, netKcal, density, assessment:*`.
- **Chart components:** `sport-line-chart`, `sport-bar-chart` (grouped/stacked + optional target line) and
  `sport-heatmap`. They are presentational, SVG, with geometry from `lib/sportask/charts.ts` (scales, ticks, paths) in a
  `computed`. They use tokens only (series colours `--color-primary`, `--color-quadrant-schedule`,
  `--color-capacity-safe`, `--color-capacity-high`, which the skins redefine). Each has a `<title>`/`aria-label`
  summary, and a visually hidden table of the data for screen readers. No method calls in templates.
- **Lists:** built from one `computed` per tab; every row id-keyed (`track`).

---

## 11. Bundle, i18n and lazy rules

- **Eager additions (target ≤ +3.5 kB):** `SportaskService`, `SportaskSettingsService`, `SportDataService`, the two
  codecs and the canonical helpers, the clock hooks, the `AppComponent` `@if`/`@defer` branches and the skin effect, and
  the eager keys `sportask.name`, `config.sportask`, `menu.sportask` (reuse where possible). Measure `initial` before
  and after (`npm run build`) and write both numbers in AGENTS.md's budget paragraph.
- **Lazy texts:** `src/i18n/sportask-texts.ts` (`SPORTASK_TEXTS = { en: {...}, es: {...} }`, merged under the
  `sportask` key) and `lib/sportask/texts.ts` `loadSportaskTexts(translate)`, a copy of the `loadForgeTexts` pattern:
  merged for English and the active language, re-applied on language/translation changes, and lazy components hold
  their first render on a `ready` signal.
  Optional refactor, only if it stays trivial: extract `lib/lazy-texts.ts`
  `registerLazyTexts(translate, key, load)` and make both loaders thin wrappers. Run `check:lazy` after it.
- **Catalog texts:** `localize(text, lang)` falls back to `en`.
- **`check-lazy-chunks.mjs`:** add every `src/lib/sportask/**` file, every `sportask-*` component, `sport-*-chart`,
  `sportask-skin`, `src/i18n/sportask-texts.ts` and `lib/sportask/pictogram-paths.ts` to `NEVER_INITIAL_UI`.
  `sportask-view` goes wherever the views are checked.
- **No `FormsModule`:** forms use signals with `[value]`/`(input)` as elsewhere, or follow the existing modals.

---

## 12. Self-check script

`scripts/sportask-check.ts` imports the pure libs and asserts invariants. `scripts/check-sportask.mjs` bundles it with
`esbuild` (`import { build } from 'esbuild'`; it is already in `node_modules` through `@angular/build`; `platform: 'node'`,
`format: 'esm'`, output in `node_modules/.cache/sportask-check.mjs`) and runs it. `package.json`:
`"check:sportask": "node scripts/check-sportask.mjs"`. It exits non-zero on the first failed assertion, with a message.

Assertions (seeded loops over many block ids, every cadence, every goal/phase, warm-up on/off, several equipment and
constraint combinations, and all built-in templates):

1. The registries load (no duplicate ids). Every ladder rung, template slot, assessment and goal refers to existing
   exercises. Every exercise has `en` and `es` texts, a known pictogram, `met > 0` and a dose with exactly one field.
2. `generateBlock` never returns an empty plan. `plan.totalSeconds ≤ blockSeconds`, and it equals
   `prep + Σ(work + rest)`. Every step's exercise passes `available()` for the context (except the documented fallback
   step).
3. Same `blockId` → identical plan; different ids → plans vary across 50 seeds (at least 2 distinct plans).
4. Warm-up plans: level ≤ 2, no `high` impact. `lowImpact` → no `high`; `noFloor` → no `floor`.
5. Strength: never the same pattern in two consecutive blocks of a simulated day; sets per pattern never above the cap.
6. Progression replay: two successes → +1 rung; two failures → −1; never two rungs in one block; never out of range;
   never a rung without an available alternative.
7. `stepAt` covers `[0, totalSeconds]` without gaps; phases are in order; `stepRemaining` never negative.
8. Codecs: `toWire → JSON round trip with shuffled keys inside steps/results/slots → fromWire → toWire` hashes
   identically. Rows without optional fields have no such keys on the wire.
9. `sanitizeBlock`/`sanitizeTemplate`/`sanitizeSettings` accept every valid generated row unchanged, and turn garbage
   (wrong types, huge arrays, unknown keys) into either `null` or a valid row.
10. `netKcal` is 0 without a weight; it is monotonic in work seconds.

---

## 13. Phases

Each phase ends with `npm run build` (no warnings beyond the existing ones), `npm run check:lazy` and, from phase 1 on,
`npm run check:sportask`. Backend phases also build the backend (`cd backend && mvn -q -DskipTests package`, or
whatever its README says). Phases with UI are checked in the browser preview (`.claude/launch.json`, `openpomodoro-dev`).
Bump the version in `package.json` once, at the start of phase 2, to `0.23.0`. Update AGENTS.md (a **Sportask**
architecture bullet + the `NEVER_INITIAL_UI` list + the budget numbers) in phase 8, keeping it as dense as the other
bullets.

### Phase 1: domain core (no UI, no Angular)
Files: `src/types/sportask.ts`, every `src/lib/sportask/**` file except `texts.ts`, `charts.ts`, `metrics/` and
`pictogram-paths.ts`, plus `scripts/sportask-check.ts`, `scripts/check-sportask.mjs` and the `package.json` script.
Steps: types → registry → equipment → catalog from CONTENT.md (transcribe exactly; the Spanish cues are yours to write,
following the English) → ladders and assessments → cadences → templates → rng/filter/select/fit → progression → schedule
→ the three goals → `generateBlock` → `template-plan` → runner → kcal → sanitize.
**Done when:** `npm run check:sportask` passes all of section 12 except 8, and nothing in `src/app` imports the new files.

### Phase 2: persistence and sync (client + backend)
Files: `sportask-settings.service.ts`, `sport-data.service.ts`, `sync-engine.ts` (codecs + canonical helpers),
`sync.service.ts`, the export/import/reset code in `app-menu`, `V8__sportask.sql`, `SyncDtos.java`, `SyncService.java`,
`AdminController.java`, `backend/README.md`.
**Done when:** assertion 8 passes. With the backend running locally (README), a block added through the dev console on
device A (`ng.getInjector`… or a temporary button removed before commit) appears on device B (a second browser profile)
after a sync. A push from a client without the new lists still succeeds. Existing rows' hashes are unchanged (no
re-push of old rows after upgrading: check the network tab). Export → import round-trips blocks and templates.
`initial` budget measured.

### Phase 3: Configuration › Sportask + lazy texts
Files: `view.service.ts` (`ConfigSection`), `config-modal` (a new section with `@defer`), `sportask-settings` component,
`lib/sportask/texts.ts`, `i18n/sportask-texts.ts`, eager key `config.sportask`, the `dumbbell`, `band`, `kettlebell`,
`rope` and `ball` icons in `ui-icon` (24px grid, 1.75 stroke, like the others).
**Done when:** enrolment (with the disclaimer), equipment with weights/bands, constraints, the default cadence, the
skin choice and the weight all persist across reloads; the settings sync (check the blob in the push); English and
Spanish both render, with no raw keys flashing; `check:lazy` is green.

### Phase 4: session, clock hooks and the break modal
Files: `sportask.service.ts`, `clock.service.ts` (the three hooks), `bell-sounds.ts` (`cue`), `app.component.{ts,html}`
(`bindClock`, the modal `@defer`), `pomodoro-clock` (button + `suppressSessionModal`), `multitask-view` (button),
`sportask-setup-sheet`, `sportask-break-modal`, `sportask-pictogram` with `pictogram-paths.ts` (simple first-pass
drawings; phase 6 polishes them).
**Done when,** verified in the preview with the `micro` cadence shortened by a custom 1 min / 30 s cadence:
- Turning Sportask on from Pomodoro changes the next phases' lengths.
- The break opens the modal over any view; Start runs the timeline with cues.
- Pause/Resume keep the step; a reload mid-block restores it.
- Results save a block and *Guardar y volver al trabajo* starts the next focus.
- Skip records `skipped`. `exerciseEvery: 2` leaves every other break normal. The long break is longer.
- Turning it off restores the user's own durations.
- The same works in Multitask. The alarm modal still shows above. Escape/Tab behave as specified.
- Normal Pomodoro use without Sportask is unchanged, Pause included.

### Phase 5: Plan my day entry
Files: `plan-objectives-step` (switch + summary), `daily-backlog-view.component.ts` (`activateArmed` in both launch
paths), the setup sheet's planner context.
**Done when:** arming from the wizard and launching either Pomodoro or Multitask starts a Sportask session with the
chosen options. Not arming leaves everything as before. Reopening the wizard shows the armed state.

### Phase 6: skins and pictograms
Files: `sportask-skin` component (tokens, both skins), the fonts in `src/fonts/` with their licences, the
`AppComponent` skin effect, `skins.ts`, the polished 16 pictograms with two poses each.
**Done when:** both skins apply to the Sportask surfaces and, with *whole app* on, to the whole app during a session,
and nothing changes when Sportask is off. Contrast ratios are documented and pass AA. Reduced motion stops every
animation. The Thunderbird build (`npm run build:tb`, `npm run tb:lint`) is clean. `initial` CSS is unchanged (the skin
CSS is in a lazy chunk; check the build output).

### Phase 7: the Sportask panel
Files: `view.service.ts` (`AppView`), `app.component.html` (`@defer` branch), `app-menu` (entry), `sportask-view` and
its tabs, `sport-line-chart`, `sport-bar-chart`, `sport-heatmap`, `lib/sportask/charts.ts`, `lib/sportask/metrics/*`,
`sportask-template-editor`, the history edit modal.
**Done when:** with ~3 weeks of generated history (a temporary dev-only seeding helper, removed before commit, or a
crafted export file imported), every tab renders; the charts match hand-computed numbers for a small sample; editing a
mark updates the charts; templates CRUD syncs; the phone width (375 px) works without horizontal scroll; both skins
look right.

### Phase 8: polish and docs
The `pomodoro-chip` Sportask dot. The mobile notification text naming the next exercise (generate `pending` at focus
end, `src/core/native/session-notification.ts` reads it through `SportaskService`: no new import of the engine there).
*Entrenar ahora* if it was not done in phase 7. AGENTS.md (the architecture bullet, `NEVER_INITIAL_UI`, the budget,
the shared building blocks if any component became shared). `docs/sportask/PLAN.md` gets a *Status* section like
`docs/integrations/PLAN.md`.

---

## 14. How to extend (the reason for the registries)

| To add… | Touch |
| --- | --- |
| an exercise | one entry in a `catalog/*.ts` file (+ a ladder rung if it progresses). Bump `CATALOG_VERSION`. |
| a piece of equipment (e.g. pull-up bar) | one `EquipmentDef` in `equipment.ts` (+ `details` kind if new) and exercises whose `needsOneOf` names it. The settings form renders it automatically. |
| a goal (e.g. "posture", "max push-ups") | one `goals/<id>.ts` with `defineGoal({...})` (programs, a generator or a reused one, a progression, metricIds) and a line in `goals/index.ts`. No backend change, no store change. |
| a program for an existing goal | one more `ProgramDef` in that goal's `programs`. |
| a built-in template | one entry in `templates.ts`. |
| a cadence preset | one entry in `cadences.ts`. |
| a metric | one `MetricDef` in `metrics/` and its id in a goal's `metricIds`. |
| a skin | one `SkinDef` and one CSS block in `sportask-skin`. |
| a language | the `LocalizedText` type and the catalog texts, plus `SPORTASK_TEXTS`. |

---

## 15. Open questions (assumptions taken until answered)

1. **Skin scope.** Assumed: Sportask surfaces always + the whole app during a session (switch, default on). The
   alternative is two new app-wide themes in the existing theme list.
2. **Equipment per place.** Assumed: one inventory + a per-session override. Named profiles (home/office) would be one
   more level in `SportaskSettings`.
3. **Weight and other health data stay device-local.** Assumed so. Syncing them would need a privacy-policy update in
   `public/privacy.html`.
4. **Entrenar ahora** (a block outside the Pomodoro) is a nice-to-have in phase 7/8.
