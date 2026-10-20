import type { BodyZone, ExerciseDef, GoalTag, Impact, Level, MovementPattern } from '../../../types/sportask';
import { MET, type MetClass } from './met';
import type { PictogramId } from './pictograms';

/** Compact row of the CONTENT.md tables. */
export interface Row {
  pattern?: MovementPattern;            // default: the file's pattern
  zones?: BodyZone[];
  tags?: GoalTag[];                     // added to the file's base tag
  dose: string;                         // '8r' or '30s'
  side?: boolean;
  needs?: string[];
  lvl: Level;
  imp?: Impact;                         // default 'none'
  floor?: boolean;
  hints?: string;                       // space-separated: wall chair space load
  met: MetClass;
  pict: PictogramId;
  spr?: number;                         // secondsPerRep
  cue: string;
  cueEs: string;
}

export function makeExercise(baseTag: GoalTag, basePattern: MovementPattern) {
  return (id: string, es: string, en: string, r: Row): ExerciseDef => {
    const dose = /^(\d+)([rs])$/.exec(r.dose);
    if (!dose) throw new Error(`Bad dose "${r.dose}" for ${id}`);
    const amount = Number(dose[1]);
    const timed = dose[2] === 's';
    const hints = new Set((r.hints ?? '').split(' ').filter(Boolean));
    const def: ExerciseDef = {
      id,
      name: { en, es },
      cues: [{ en: r.cue, es: r.cueEs }],
      pattern: r.pattern ?? basePattern,
      tags: [baseTag, ...(r.tags ?? [])],
      metric: timed ? 'seconds' : 'reps',
      needsOneOf: r.needs ?? [],
      level: r.lvl,
      impact: r.imp ?? 'none',
      floor: r.floor === true,
      met: MET[r.met],
      dose: timed ? { seconds: amount } : { reps: amount },
      pictogram: r.pict,
    };
    if (r.zones) def.zones = r.zones;
    if (r.side) def.perSide = true;
    if (hints.has('load')) def.loadable = true;
    if (hints.has('space')) def.space = true;
    if (hints.has('wall')) def.wall = true;
    if (hints.has('chair')) def.chair = true;
    if (r.spr !== undefined) def.secondsPerRep = r.spr;
    return def;
  };
}
