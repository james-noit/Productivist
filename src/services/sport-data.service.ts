import { Injectable } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import type { SportBlock, SportExport, SportTemplate } from '../types/sportask';

/**
 * The persisted Sportask history: one block per break with exercise, plus the user's own free-training templates.
 * Dumb stores, like FlowService: no dependencies, no rules (the lazy Sportask code decides what a block means).
 * Blocks are about 0.5 kB each and are never pruned in v1.
 */
@Injectable({ providedIn: 'root' })
export class SportDataService {
  readonly blocks = localStorageSignal<SportBlock[]>('productivist.sportBlocks', []);
  readonly templates = localStorageSignal<SportTemplate[]>('productivist.sportTemplates', []);

  addBlock(block: SportBlock): void {
    this.blocks.update((list) => [...list.filter((b) => b.id !== block.id), block]);
  }

  /** Merges `patch` into the block and stamps `updatedAt`. */
  updateBlock(id: string, patch: Partial<Omit<SportBlock, 'id'>>): void {
    if (!this.blocks().some((b) => b.id === id)) return;
    this.blocks.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b)));
  }

  removeBlock(id: string): void {
    if (this.blocks().some((b) => b.id === id)) this.blocks.update((list) => list.filter((b) => b.id !== id));
  }

  /** Adds the template or replaces the one with the same id, and stamps `updatedAt`. */
  upsertTemplate(template: SportTemplate): void {
    const next = { ...template, updatedAt: Date.now() };
    this.templates.update((list) =>
      list.some((t) => t.id === template.id) ? list.map((t) => (t.id === template.id ? next : t)) : [...list, next],
    );
  }

  removeTemplate(id: string): void {
    if (this.templates().some((t) => t.id === id)) this.templates.update((list) => list.filter((t) => t.id !== id));
  }

  exportSport(): SportExport {
    return { sportBlocks: this.blocks(), sportTemplates: this.templates() };
  }

  /**
   * Replaces both stores with an export's. Rows go through the sanitiser (a lazy chunk, which an import file is the only
   * thing to need): malformed ones are dropped, numbers clamped, unknown keys removed, duplicate ids keep the first.
   * Missing arrays mean none.
   */
  async importSport(data: Partial<SportExport> | null | undefined): Promise<void> {
    const { sanitizeBlock, sanitizeTemplate } = await import('../lib/sportask/sanitize');
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
    this.blocks.set(keep(data?.sportBlocks, sanitizeBlock));
    this.templates.set(keep(data?.sportTemplates, sanitizeTemplate));
  }

  reset(): void {
    this.blocks.set([]);
    this.templates.set([]);
  }
}
