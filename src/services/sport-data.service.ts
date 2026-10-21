import { Injectable } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import type { SportBlock, SportExport, SportTemplate } from '../types/sportask';

/**
 * The persisted Sportask history: one block per break with exercise, plus the user's own free-training templates.
 * Dumb stores, like FlowService: no dependencies, no rules (the lazy Sportask code decides what a block means). The
 * writes (add, update and remove a block, upsert and remove a template) are in `lib/sportask/data-ops.ts`, lazy.
 * Blocks are about 0.5 kB each and are never pruned in v1.
 */
@Injectable({ providedIn: 'root' })
export class SportDataService {
  readonly blocks = localStorageSignal<SportBlock[]>('productivist.sportBlocks', []);
  readonly templates = localStorageSignal<SportTemplate[]>('productivist.sportTemplates', []);

  exportSport(): SportExport {
    return { sportBlocks: this.blocks(), sportTemplates: this.templates() };
  }

  /** Replaces both stores with an export's, sanitised (see `importSport` in `lib/sportask/data-ops.ts`, a lazy chunk an import file is the only thing to need). */
  async importSport(data: Partial<SportExport> | null | undefined): Promise<void> {
    (await import('../lib/sportask/data-ops')).importSport(this, data);
  }

  reset(): void {
    this.blocks.set([]);
    this.templates.set([]);
  }
}
