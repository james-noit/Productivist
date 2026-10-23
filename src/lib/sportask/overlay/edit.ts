import type { ExerciseDef } from '../../../types/sportask';
import { type CatalogOverlay, type EntryOf, type ExerciseEntry, OVERLAY_SCHEMA, SECTIONS, type Section, isNewId } from './types';

/** Pure helpers behind the editor and the versions panel: entries in and out of the document, patches, continuity and the diff. */

export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export const sameOverlay = (a: CatalogOverlay, b: CatalogOverlay): boolean => stable(a) === stable(b);

export function entriesOf<S extends Section>(overlay: CatalogOverlay, section: S): readonly EntryOf<S>[] {
  return (overlay[section] ?? []) as readonly EntryOf<S>[];
}

export function entryOf<S extends Section>(overlay: CatalogOverlay, section: S, id: string): EntryOf<S> | undefined {
  return entriesOf(overlay, section).find((e) => e.id === id);
}

/** A copy of the overlay with the entry added or replaced (sorted by id, so the document and its diffs are stable). */
export function putEntry<S extends Section>(overlay: CatalogOverlay, section: S, entry: EntryOf<S>): CatalogOverlay {
  const list = [...entriesOf(overlay, section).filter((e) => e.id !== entry.id), entry].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ...overlay, [section]: list } as CatalogOverlay;
}

/** A copy without the entry (and without the key when the list becomes empty). */
export function removeEntry(overlay: CatalogOverlay, section: Section, id: string): CatalogOverlay {
  const list = entriesOf(overlay, section).filter((e) => e.id !== id);
  const { [section]: _removed, ...rest } = overlay;
  return list.length > 0 ? ({ ...rest, [section]: list } as CatalogOverlay) : (rest as CatalogOverlay);
}

const OPTIONAL_FLAGS = ['perSide', 'loadable', 'space', 'wall', 'chair', 'retired'] as const;

/**
 * The entry that makes `full` out of `base`: only the fields that differ (a flag that is off counts as absent). Without a base (a new
 * `fd-` exercise) it is every field that is set. Null when nothing differs.
 */
export function exerciseEntry(base: ExerciseDef | undefined, full: ExerciseDef): ExerciseEntry | null {
  const entry: Record<string, unknown> = { id: full.id };
  for (const key of Object.keys(full) as (keyof ExerciseDef)[]) {
    if (key === 'id') continue;
    const value = full[key];
    if ((OPTIONAL_FLAGS as readonly string[]).includes(key)) {
      if (!!value !== !!(base && base[key])) entry[key] = !!value;
      continue;
    }
    if (key === 'zones' && Array.isArray(value) && value.length === 0 && !base?.zones) continue;
    if (!base || stable(value) !== stable(base[key])) entry[key] = value;
  }
  return Object.keys(entry).length > 1 || !base ? (entry as ExerciseEntry) : null;
}

/**
 * The entry that makes `full` out of `base`: only the listed fields that differ (compared as data), or every listed field that is set
 * for a new item (no base). Null when a built-in is unchanged.
 */
export function patchEntry<T extends { id: string }>(base: T | undefined, full: T, keys: readonly (keyof T)[]): T | null {
  const entry: Record<string, unknown> = { id: full.id };
  for (const key of keys) {
    const value = full[key];
    if (value === undefined && !base) continue;
    if (!base || stable(value) !== stable(base[key])) entry[key as string] = value;
  }
  return base && Object.keys(entry).length === 1 ? null : (entry as unknown as T);
}

/**
 * Puts back whatever new (`fd-`) item the published overlay has and `draft` lost, so ids are never removed: an exercise comes back
 * retired, anything else as it was published. Returns the draft itself when nothing was missing.
 */
export function keepPublished(draft: CatalogOverlay, published: CatalogOverlay): CatalogOverlay {
  let out = draft;
  for (const section of SECTIONS) {
    const have = new Set(entriesOf(out, section).map((e) => e.id));
    for (const entry of entriesOf(published, section)) {
      if (!isNewId(entry.id) || have.has(entry.id)) continue;
      out = putEntry(out, section, (section === 'exercises' ? { ...entry, retired: true } : entry) as EntryOf<typeof section>);
    }
  }
  for (const goal of published.goals ?? []) {
    const lost = (goal.programs ?? []).filter((p) => isNewId(p.id) && !out.goals?.find((g) => g.id === goal.id)?.programs?.some((q) => q.id === p.id));
    if (lost.length === 0) continue;
    const mine = out.goals?.find((g) => g.id === goal.id) ?? { id: goal.id };
    out = putEntry(out, 'goals', { ...mine, programs: [...(mine.programs ?? []), ...lost].sort((a, b) => (a.id < b.id ? -1 : 1)) });
  }
  return out;
}

/** `fd-` + the English name in camel case (accents stripped), unique among `taken`. */
export function newItemId(name: string, taken: ReadonlySet<string>, fallback = 'item'): string {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const camel = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join('');
  const base = `fd-${camel || fallback}`.slice(0, 56);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export interface Change {
  section: Section;
  id: string;
  kind: 'added' | 'removed' | 'changed';
  /** For a change: the top-level fields that differ (programs as `program <id>`). */
  fields: string[];
}

/** What differs between two overlays, per entry (the versions panel's readable change list). */
export function diffOverlays(from: CatalogOverlay, to: CatalogOverlay): Change[] {
  const out: Change[] = [];
  for (const section of SECTIONS) {
    const a = new Map(entriesOf(from, section).map((e) => [e.id, e as Record<string, unknown>]));
    const b = new Map(entriesOf(to, section).map((e) => [e.id, e as Record<string, unknown>]));
    for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const x = a.get(id);
      const y = b.get(id);
      if (!x && y) out.push({ section, id, kind: 'added', fields: [] });
      else if (x && !y) out.push({ section, id, kind: 'removed', fields: [] });
      else if (x && y && stable(x) !== stable(y)) {
        const fields = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => k !== 'id' && stable(x[k]) !== stable(y[k]));
        if (section === 'goals' && fields.includes('programs')) {
          const px = new Map(((x['programs'] as { id: string }[] | undefined) ?? []).map((p) => [p.id, p]));
          const py = new Map(((y['programs'] as { id: string }[] | undefined) ?? []).map((p) => [p.id, p]));
          const changed = [...new Set([...px.keys(), ...py.keys()])].filter((pid) => stable(px.get(pid)) !== stable(py.get(pid))).sort();
          fields.splice(fields.indexOf('programs'), 1, ...changed.map((pid) => `program ${pid}`));
        }
        out.push({ section, id, kind: 'changed', fields: fields.sort() });
      }
    }
  }
  return out;
}

export const isEmptyOverlay = (o: CatalogOverlay): boolean => SECTIONS.every((s) => entriesOf(o, s).length === 0);

export const withSchema = (o: CatalogOverlay): CatalogOverlay => ({ ...o, schema: OVERLAY_SCHEMA });
