import type { ActivityLevel, ReachLevel, SportProfile } from '../../types/sportask';

/**
 * The pure rules behind the optional "About you" step (0.25): what a profile says about where each ladder should start, how much the
 * user can take (a capacity factor for the goals that have no ladders) and how many days a week they want to train. Lazy like the
 * rest of `lib/sportask`; no Angular, no storage. Without a profile every function gives the answer the program gave before 0.25.
 */

export const PROFILE_LIMITS = {
  daysPerWeek: { min: 1, max: 7 },
  pushUps: { min: 0, max: 100 },
  squats: { min: 0, max: 200 },
  plankSeconds: { min: 0, max: 600 },
} as const;

export const ACTIVITY_LEVELS: readonly ActivityLevel[] = ['low', 'some', 'regular'];
export const REACH_LEVELS: readonly ReachLevel[] = ['far', 'near', 'touch'];

/** Whether the profile says anything at all (an empty one is stored as absent). */
export function hasProfile(p: SportProfile | undefined | null): p is SportProfile {
  return !!p && Object.values(p).some((v) => v !== undefined);
}

/** `[smallest value, rung]` rows: the rung of the last row whose value the measure reaches. Rungs are indexes into the ladder. */
type Table = readonly (readonly [number, number])[];

/** Floor push-ups in a row -> rung of the `push` ladder (0 = wall, 1 = desk, 2 = knee, 3 = floor, 4 = feet elevated). Never the top. */
const PUSH_TABLE: Table = [[0, 1], [1, 2], [10, 3], [30, 4]];
/** Squats in a row -> rung of the `squat` ladder (0 = sit-to-stand, 1 = air squat, 2 = pause/goblet). Never the jumping rung. */
const SQUAT_TABLE: Table = [[0, 0], [8, 1], [35, 2]];
/** Plank seconds -> rung of the `core` ladder (0 = desk plank/dead bug, 1 = plank, 2 = side plank). */
const PLANK_TABLE: Table = [[0, 0], [30, 1], [90, 2]];

function lookup(table: Table, value: number): number {
  let rung = table[0]![1];
  for (const [min, r] of table) if (value >= min) rung = r;
  return rung;
}

const clampRung = (n: number): number => Math.max(0, Math.min(2, n));

/** The rung a program level starts on when nothing else is known (level 1 -> 0 ... 3 -> 2), nudged by how active the user is. */
function fromLevel(level: number, activity: ActivityLevel | undefined): number {
  const shift = activity === 'low' ? -1 : activity === 'regular' ? 1 : 0;
  return clampRung(level - 1 + shift);
}

/**
 * The rung a ladder should start on, before the equipment is taken into account (`settleRung` does that). A measured push, squat or
 * plank sets its own ladder; pull, hinge, lunge and vertical push follow the closest measured one, one rung at most; anything
 * unmeasured starts from the level the user picked, tempered by their activity. No profile: exactly `level - 1`.
 */
export function desiredRung(ladderId: string, level: number, profile: SportProfile | undefined): number {
  const base = fromLevel(level, profile?.activity);
  if (!profile) return base;
  const push = profile.pushUps !== undefined ? lookup(PUSH_TABLE, profile.pushUps) : undefined;
  const squat = profile.squats !== undefined ? lookup(SQUAT_TABLE, profile.squats) : undefined;
  const plank = profile.plankSeconds !== undefined ? lookup(PLANK_TABLE, profile.plankSeconds) : undefined;
  switch (ladderId) {
    case 'push':
      return push ?? base;
    case 'squat':
      return squat ?? base;
    case 'core':
      return plank ?? base;
    case 'pull':
      return push !== undefined ? Math.min(1, Math.max(0, push - 1)) : base;
    case 'pushVertical':
      return push !== undefined ? (push >= 4 ? 1 : 0) : Math.min(base, 1);
    case 'hinge':
    case 'lunge':
      return squat !== undefined ? Math.min(1, squat) : base;
    default:
      return base;
  }
}

const LEVEL_FACTOR = [1, 1.1, 1.2] as const;
const ACTIVITY_FACTOR: Record<ActivityLevel, number> = { low: 0.9, some: 1, regular: 1.1 };
const REACH_FACTOR: Record<ReachLevel, number> = { far: 0.9, near: 1, touch: 1.1 };

export const MIN_CAPACITY = 0.8;
export const MAX_CAPACITY = 1.3;

/**
 * How much of the program's dose this user starts with, for the goals that have no ladders (mobility holds, calorie intervals): the
 * level they picked (1 = 1.0, so people who never filled anything in keep the program as it was), their activity and, for mobility,
 * how far they reach. A starting point only: the effort ratings and absences adjust it from there (`engine/adapt.ts`).
 */
export function capacityFactor(goalId: string, level: number, profile: SportProfile | undefined): number {
  let f = LEVEL_FACTOR[Math.max(1, Math.min(3, level)) - 1]!;
  if (profile?.activity) f *= ACTIVITY_FACTOR[profile.activity];
  if (goalId === 'mobility' && profile?.reach) f *= REACH_FACTOR[profile.reach];
  return Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, f));
}

/** Training days a week: what the user asked for, never more than the program prescribes. */
export function trainingDays(programDays: number, profile: SportProfile | undefined): number {
  const want = profile?.daysPerWeek;
  return want === undefined ? programDays : Math.max(1, Math.min(programDays, want));
}

/** The weekly-minutes scale for the user's activity (a regular exerciser gets a bigger weekly target, a sedentary one a gentler one). */
export function activityScale(profile: SportProfile | undefined): number {
  return profile?.activity === 'low' ? 0.75 : profile?.activity === 'regular' ? 1.2 : 1;
}
