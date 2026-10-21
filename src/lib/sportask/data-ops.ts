import type { SportDataService } from '../../services/sport-data.service';
import type { SportBlock, SportExport, SportTemplate } from '../../types/sportask';
import { sanitizeBlock, sanitizeTemplate } from './sanitize';

/*
 * The writes on the Sportask stores that only lazy code needs. They live here, not in `SportDataService`, so the eager service
 * keeps just the two signals, the export and the reset (the initial-bundle budget); they write the service's signals directly.
 */

export function addBlock(data: SportDataService, block: SportBlock): void {
  data.blocks.update((list) => [...list.filter((b) => b.id !== block.id), block]);
}

/** Merges `patch` into the block and stamps `updatedAt`. */
export function updateBlock(data: SportDataService, id: string, patch: Partial<Omit<SportBlock, 'id'>>): void {
  if (!data.blocks().some((b) => b.id === id)) return;
  data.blocks.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b)));
}

export function removeBlock(data: SportDataService, id: string): void {
  if (data.blocks().some((b) => b.id === id)) data.blocks.update((list) => list.filter((b) => b.id !== id));
}

/** Adds the template or replaces the one with the same id, and stamps `updatedAt`. */
export function upsertTemplate(data: SportDataService, template: SportTemplate): void {
  const next = { ...template, updatedAt: Date.now() };
  data.templates.update((list) => (list.some((t) => t.id === template.id) ? list.map((t) => (t.id === template.id ? next : t)) : [...list, next]));
}

export function removeTemplate(data: SportDataService, id: string): void {
  if (data.templates().some((t) => t.id === id)) data.templates.update((list) => list.filter((t) => t.id !== id));
}

/**
 * Replaces both stores with an export's. Rows go through the sanitiser: malformed ones are dropped, numbers clamped, unknown
 * keys removed, duplicate ids keep the first. Missing arrays mean none.
 */
export function importSport(data: SportDataService, file: Partial<SportExport> | null | undefined): void {
  const keep = <T extends { id: string }>(rows: unknown, sanitize: (row: unknown) => T | null): T[] => {
    const seen = new Set<string>();
    const list: T[] = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const item = sanitize(row);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      list.push(item);
    }
    return list;
  };
  data.blocks.set(keep(file?.sportBlocks, sanitizeBlock));
  data.templates.set(keep(file?.sportTemplates, sanitizeTemplate));
}
