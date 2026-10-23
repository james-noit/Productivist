import { todayIso, toIso } from '../dates';
import type { BlockStatus, EquipmentInventory, Feedback, PendingBlock, SportBlock, SportaskSettings, StepResult } from '../../types/sportask';
import { CATALOG } from './catalog';
import type { GenerationContext } from './engine/context';
import { rngFor } from './engine/rng';
import { effectiveCatalogVersion } from './overlay/version';

export interface ContextInput {
  blockId: string;
  blockSeconds: number;
  /** Every stored block (any order). */
  blocks: readonly SportBlock[];
  settings: Pick<SportaskSettings, 'equipment' | 'constraints' | 'enrolment' | 'profile'>;
  /** The session's equipment for today, or null to use the settings. */
  equipmentOverride: EquipmentInventory | null;
}

/** The engine's input for a block made now (UI side: this is where the clock and the stored history come in). */
export function buildContext(input: ContextInput): GenerationContext {
  const history = [...input.blocks].sort((a, b) => a.startedAt - b.startedAt);
  const today = todayIso();
  return {
    blockId: input.blockId,
    blockSeconds: Math.max(1, Math.round(input.blockSeconds)),
    now: Date.now(),
    today,
    catalog: CATALOG,
    equipment: input.equipmentOverride ?? input.settings.equipment,
    constraints: input.settings.constraints,
    history,
    todayBlocks: history.filter((b) => b.date === today),
    enrolment: input.settings.enrolment,
    ...(input.settings.profile ? { profile: input.settings.profile } : {}),
    rng: rngFor(input.blockId),
  };
}

export interface BlockMarks {
  status: BlockStatus;
  results: StepResult[];
  rpe?: number | null;
  feedback?: Feedback | null;
}

/** The row to store for a pending block. Optional fields are only present when set (the sync wire rule). */
export function blockRow(pending: PendingBlock, marks: BlockMarks): SportBlock {
  const now = Date.now();
  const startedAt = pending.startedAt ?? now;
  const { meta, plan } = pending;
  const row: SportBlock = {
    id: pending.blockId,
    startedAt,
    date: toIso(new Date(startedAt)),
    origin: meta.origin,
    kind: plan.kind,
    blockSeconds: Math.min(7200, Math.max(1, Math.round(pending.blockSeconds))),
    prepSeconds: plan.prepSeconds,
    steps: plan.steps,
    results: marks.results,
    status: marks.status,
    catalogVersion: effectiveCatalogVersion(),
    createdAt: now,
    updatedAt: now,
  };
  if (meta.goalId) row.goalId = meta.goalId;
  if (meta.programId) row.programId = meta.programId;
  if (meta.programWeek !== undefined) row.programWeek = meta.programWeek;
  if (meta.templateId) row.templateId = meta.templateId;
  const assessmentId = meta.assessmentId ?? plan.assessmentId;
  if (assessmentId) row.assessmentId = assessmentId;
  if (marks.rpe) row.rpe = marks.rpe;
  if (marks.feedback) row.feedback = marks.feedback;
  return row;
}
