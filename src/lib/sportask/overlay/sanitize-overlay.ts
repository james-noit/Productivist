import type { BodyZone, Dose, GoalTag, Impact, LocalizedText, MovementPattern, TemplateSlot } from '../../../types/sportask';
import {
  type AssessmentEntry,
  type CadenceEntry,
  type CatalogOverlay,
  EQUIPMENT_DETAILS,
  EQUIPMENT_ICONS,
  type EquipmentEntry,
  type ExerciseEntry,
  FORMATS,
  type GoalEntry,
  ID_RE,
  IMPACTS,
  type LadderEntry,
  OVERLAY_SCHEMA,
  PATTERNS,
  type PhaseEntry,
  type ProgramEntry,
  TAGS,
  type TemplateEntry,
  ZONES,
} from './types';

/**
 * Untrusted input (the server, the device cache, a hand-edited draft): returns a well-typed overlay and the list of things it had to
 * leave out. It checks **types and vocabulary of the enumerations**, not meaning (an unknown exercise id is `validateOverlay`'s to flag).
 * Entries without a valid unique id are dropped; fields of the wrong type are dropped; strings are trimmed and truncated; lists are
 * bounded. Pure; never throws.
 */
export interface SanitizeReport {
  overlay: CatalogOverlay;
  /** Where something was dropped, e.g. `exercises[3].dose`. */
  dropped: string[];
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => list.find((x) => x === v);

const MAX_ENTRIES = 500;
const MAX_TEXT = 2000;

export function sanitizeOverlay(raw: unknown): CatalogOverlay {
  return sanitizeOverlayReport(raw).overlay;
}

export function sanitizeOverlayReport(raw: unknown): SanitizeReport {
  const dropped: string[] = [];
  const out: CatalogOverlay = { schema: OVERLAY_SCHEMA };
  if (!isRec(raw)) {
    if (raw !== undefined && raw !== null) dropped.push('document');
    return { overlay: out, dropped };
  }

  const entries = <T extends { id: string }>(section: string, one: (r: Rec, path: string) => Omit<T, 'id'> | null): T[] | undefined => {
    const list = raw[section];
    if (list === undefined) return undefined;
    if (!Array.isArray(list)) {
      dropped.push(section);
      return undefined;
    }
    const seen = new Set<string>();
    const result: T[] = [];
    list.slice(0, MAX_ENTRIES).forEach((item, i) => {
      const path = `${section}[${i}]`;
      if (!isRec(item) || !isId(item['id']) || seen.has(item['id'])) {
        dropped.push(path);
        return;
      }
      const body = one(item, path);
      if (!body) {
        dropped.push(path);
        return;
      }
      seen.add(item['id']);
      result.push({ id: item['id'], ...body } as T);
    });
    if (list.length > MAX_ENTRIES) dropped.push(`${section}[${MAX_ENTRIES}…]`);
    result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return result.length > 0 ? result : undefined;
  };

  /** Picks the optional fields of an entry through their readers; a present field the reader rejects is reported and dropped. */
  const fields = <T extends object>(r: Rec, path: string, readers: { [K in keyof T]?: (v: unknown) => T[K] | undefined }): T => {
    const out: Partial<T> = {};
    for (const key of Object.keys(readers) as (keyof T)[]) {
      const v = r[key as string];
      if (v === undefined) continue;
      const read = readers[key] as (v: unknown) => T[keyof T] | undefined;
      const value = read(v);
      if (value === undefined) dropped.push(`${path}.${String(key)}`);
      else out[key] = value;
    }
    return out as T;
  };

  const exercises = entries<ExerciseEntry>('exercises', (r, path) =>
    fields<Omit<ExerciseEntry, 'id'>>(r, path, {
      name: localized,
      cues: (v) => (Array.isArray(v) ? v.slice(0, 6).map(localized).filter((t): t is LocalizedText => !!t) : undefined),
      pattern: (v) => oneOf(PATTERNS, v),
      zones: (v) => (Array.isArray(v) ? [...new Set(v.map((z) => oneOf(ZONES, z)).filter((z): z is BodyZone => !!z))] : undefined),
      tags: (v) => (Array.isArray(v) ? [...new Set(v.map((t) => oneOf(TAGS, t)).filter((t): t is GoalTag => !!t))] : undefined),
      metric: (v) => (v === 'reps' || v === 'seconds' ? v : undefined),
      perSide: bool,
      needsOneOf: ids(8),
      loadable: bool,
      level: (v) => (isNum(v) && Number.isInteger(v) && v >= 1 && v <= 5 ? (v as 1 | 2 | 3 | 4 | 5) : undefined),
      impact: (v): Impact | undefined => oneOf(IMPACTS, v),
      floor: bool,
      space: bool,
      wall: bool,
      chair: bool,
      met: num,
      secondsPerRep: num,
      dose,
      pictogram: shortText(40),
      retired: bool,
    }),
  );

  const ladders = entries<LadderEntry>('ladders', (r, path) => {
    const rungs = rungsOf(r['rungs']);
    if (!rungs) {
      dropped.push(`${path}.rungs`);
      return null;
    }
    return { rungs };
  });

  const assessments = entries<AssessmentEntry>('assessments', (r, path) =>
    fields<Omit<AssessmentEntry, 'id'>>(r, path, { name: localized, instructions: localized, seconds: num, exerciseIds: ids(8), maxRung: num }),
  );

  const equipment = entries<EquipmentEntry>('equipment', (r, path) =>
    fields<Omit<EquipmentEntry, 'id'>>(r, path, {
      name: localized,
      icon: (v) => (typeof v === 'string' && EQUIPMENT_ICONS.includes(v) ? v : undefined),
      details: (v) => oneOf(EQUIPMENT_DETAILS, v),
    }),
  );

  const goals = entries<GoalEntry>('goals', (r, path) => {
    const body = fields<Omit<GoalEntry, 'id' | 'programs'>>(r, path, { name: localized, description: localized });
    const programs = r['programs'];
    if (programs === undefined) return body;
    if (!Array.isArray(programs)) {
      dropped.push(`${path}.programs`);
      return body;
    }
    const seen = new Set<string>();
    const list: ProgramEntry[] = [];
    programs.slice(0, 40).forEach((p, i) => {
      const ppath = `${path}.programs[${i}]`;
      if (!isRec(p) || !isId(p['id']) || seen.has(p['id'])) {
        dropped.push(ppath);
        return;
      }
      seen.add(p['id']);
      const pbody = fields<Omit<ProgramEntry, 'id' | 'phases'>>(p, ppath, {
        name: localized,
        summary: localized,
        weeks: num,
        daysPerWeek: num,
        assessmentWeeks: (v) => (Array.isArray(v) ? v.filter(isNum).slice(0, 52) : undefined),
        assessmentIds: ids(12),
      });
      const phases = p['phases'];
      const entry: ProgramEntry = { id: p['id'], ...pbody };
      if (phases !== undefined) {
        if (Array.isArray(phases)) entry.phases = phases.slice(0, 24).map((ph, j) => phaseOf(ph, `${ppath}.phases[${j}]`, dropped)).filter((x): x is PhaseEntry => !!x);
        else dropped.push(`${ppath}.phases`);
      }
      list.push(entry);
    });
    return list.length > 0 ? { ...body, programs: list.sort((a, b) => (a.id < b.id ? -1 : 1)) } : body;
  });

  const templates = entries<TemplateEntry>('templates', (r, path) =>
    fields<Omit<TemplateEntry, 'id'>>(r, path, {
      nameText: localized,
      slots: (v) => (Array.isArray(v) ? v.slice(0, 40).map(slotOf).filter((s): s is TemplateSlot => !!s) : undefined),
      format: (v) => oneOf(FORMATS, v),
      workSeconds: num,
      restSeconds: num,
      minSeconds: num,
    }),
  );

  const cadences = entries<CadenceEntry>('cadences', (r, path) =>
    fields<Omit<CadenceEntry, 'id'>>(r, path, {
      name: localized,
      focusSeconds: num,
      breakSeconds: num,
      exerciseEvery: num,
      longBreak: (v) => (v === null ? null : isRec(v) && isNum(v['every']) && isNum(v['seconds']) ? { every: v['every'], seconds: v['seconds'] } : undefined),
    }),
  );

  if (exercises) out.exercises = exercises;
  if (ladders) out.ladders = ladders;
  if (assessments) out.assessments = assessments;
  if (equipment) out.equipment = equipment;
  if (goals) out.goals = goals;
  if (templates) out.templates = templates;
  if (cadences) out.cadences = cadences;
  return { overlay: out, dropped };
}

// ---- readers

function text(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : undefined;
}
function shortText(max: number): (v: unknown) => string | undefined {
  return (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
}
function localized(v: unknown): LocalizedText | undefined {
  if (!isRec(v)) return undefined;
  const en = text(v['en']);
  const es = text(v['es']);
  return en === undefined || es === undefined ? undefined : { en, es };
}
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const num = (v: unknown): number | undefined => (isNum(v) ? v : undefined);
function ids(max: number): (v: unknown) => string[] | undefined {
  return (v) => (Array.isArray(v) ? [...new Set(v.filter(isId))].slice(0, max) : undefined);
}
function dose(v: unknown): Dose | undefined {
  if (!isRec(v)) return undefined;
  if (isNum(v['reps']) && v['seconds'] === undefined) return { reps: v['reps'] };
  if (isNum(v['seconds']) && v['reps'] === undefined) return { seconds: v['seconds'] };
  return undefined;
}
function rungsOf(v: unknown): string[][] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.slice(0, 12).map((rung) => (Array.isArray(rung) ? [...new Set(rung.filter(isId))].slice(0, 8) : []));
}
function slotOf(v: unknown): TemplateSlot | undefined {
  if (!isRec(v)) return undefined;
  if (isId(v['exerciseId'])) {
    const d = v['dose'] === undefined ? undefined : dose(v['dose']);
    return d ? { exerciseId: v['exerciseId'], dose: d } : { exerciseId: v['exerciseId'] };
  }
  const pattern = oneOf(PATTERNS, v['pattern']);
  if (!pattern) return undefined;
  const slot: Extract<TemplateSlot, { pattern: MovementPattern }> = { pattern };
  const tag = oneOf(TAGS, v['tag']);
  if (tag) slot.tag = tag;
  const zone = oneOf(ZONES, v['zone']);
  if (zone) slot.zone = zone;
  if (isNum(v['maxLevel']) && Number.isInteger(v['maxLevel']) && v['maxLevel'] >= 1 && v['maxLevel'] <= 5) slot.maxLevel = v['maxLevel'] as 1 | 2 | 3 | 4 | 5;
  return slot;
}
function phaseOf(v: unknown, path: string, dropped: string[]): PhaseEntry | undefined {
  if (!isRec(v) || !isNum(v['fromWeek']) || !isNum(v['toWeek']) || !isRec(v['params'])) {
    dropped.push(path);
    return undefined;
  }
  const params = cleanParams(v['params']);
  const phase: PhaseEntry = { fromWeek: v['fromWeek'], toWeek: v['toWeek'], params };
  if (v['note'] !== undefined) {
    const note = localized(v['note']);
    if (note) phase.note = note;
    else dropped.push(`${path}.note`);
  }
  return phase;
}
/** Parameters are numbers, booleans, short strings, ranges of numbers and lists of short strings; anything else is left out. */
function cleanParams(r: Rec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(r).slice(0, 24)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(key) || key === 'warmup') continue;
    const v = r[key];
    if (isNum(v) || typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'string') out[key] = v.slice(0, 32);
    else if (Array.isArray(v)) out[key] = v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 32)).slice(0, 16);
    else if (isRec(v)) {
      const range: Record<string, number> = {};
      for (const k of Object.keys(v).slice(0, 4)) if (isNum(v[k])) range[k] = v[k];
      out[key] = range;
    }
  }
  return out;
}
