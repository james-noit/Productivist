import type { Constraints, EquipmentInventory } from '../../../types/sportask';
import { addDays } from '../../dates';
import type { GenerationContext } from '../engine/context';
import { type GeneratedBlock, generate } from '../engine/generate';
import { rngFor } from '../engine/rng';
import type { LayeredContent } from './merge';

/**
 * "Preview what a user gets" (docs/sportask/DIRECTOR.md): the real generator, run over a layered catalog for one hypothetical user
 * and one break. Pure and reproducible (`seed` is the block id the generator's random numbers come from).
 */
export interface PreviewOptions {
  mode: 'goal' | 'free';
  goalId: string;
  programId: string;
  /** 1-based week of the program the user is in. */
  week: number;
  level: 1 | 2 | 3;
  /** Free training: the template, or null for the generator's own pick. */
  templateId: string | null;
  blockSeconds: number;
  gear: 'none' | 'all';
  constraints: Constraints;
  /** True = the user already trained today (so no warm-up, and a test may be due). */
  afterBlock: boolean;
  seed: number;
}

/** A Wednesday, so the mobility focus of the day is stable. */
export const PREVIEW_TODAY = '2026-03-04';

/** The whole inventory of the catalog's equipment (weights and band strengths included). */
export function allGear(content: LayeredContent): EquipmentInventory {
  const gear: EquipmentInventory = {};
  for (const e of content.catalog.equipment.all) {
    gear[e.id] = { owned: true, ...(e.details === 'weights' ? { weightsKg: [4, 8, 12] } : {}), ...(e.details === 'bandStrengths' ? { bandStrengths: ['light', 'medium'] as ('light' | 'medium')[] } : {}) };
  }
  return gear;
}

export function previewBlock(content: LayeredContent, o: PreviewOptions): GeneratedBlock {
  const now = Date.parse(`${PREVIEW_TODAY}T10:00:00Z`);
  const blockId = `preview-${o.seed}`;
  const enrolment = o.mode === 'goal' ? { goalId: o.goalId, programId: o.programId, level: o.level, startedOn: addDays(PREVIEW_TODAY, -(Math.max(1, o.week) - 1) * 7), acceptedDisclaimerAt: 1 } : null;
  const todayBlocks = o.afterBlock
    ? [{ id: 'preview-done', startedAt: now - 3_600_000, date: PREVIEW_TODAY, origin: 'goal' as const, kind: 'train' as const, blockSeconds: 60, prepSeconds: 0, steps: [], results: [], status: 'done' as const, catalogVersion: 0, createdAt: now, updatedAt: now }]
    : [];
  const ctx: GenerationContext = {
    blockId,
    blockSeconds: o.blockSeconds,
    now,
    today: PREVIEW_TODAY,
    catalog: content.catalog,
    goals: content.goals,
    templates: content.templates,
    equipment: o.gear === 'all' ? allGear(content) : {},
    constraints: o.constraints,
    history: todayBlocks,
    todayBlocks,
    enrolment,
    rng: rngFor(blockId),
  };
  return generate(ctx, { mode: o.mode, templateId: o.mode === 'free' ? o.templateId : null }, { enrolment });
}
