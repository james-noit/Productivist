import { createId } from '../../core/create-id';
import type { PendingBlock, SingleBlock, SportBlock, SportTemplate, SportaskSettings } from '../../types/sportask';
import { generate } from './engine/generate';
import { ensureOverlay } from './overlay/store';
import { buildContext } from './session-context';

export interface MakeBlockInput {
  /** What to train: the session's (or the *Train now* block's) request. */
  request: Pick<SingleBlock, 'mode' | 'templateId' | 'equipmentOverride'>;
  /** The time the block has. */
  blockSeconds: number;
  blocks: readonly SportBlock[];
  templates: readonly SportTemplate[];
  settings: SportaskSettings;
  /** The block this one replaces ("Another one", "Train anyway"): its re-roll count and `forceTrain` carry over. */
  previous?: PendingBlock | null;
  reroll?: boolean;
  forceTrain?: boolean;
}

/** A new pending block (not started): the one place that turns a request and the stored history into a plan. */
export function makePending(input: MakeBlockInput): PendingBlock {
  ensureOverlay();
  const blockId = createId();
  const forceTrain = input.forceTrain ?? input.previous?.forceTrain ?? false;
  const ctx = buildContext({
    blockId,
    blockSeconds: input.blockSeconds,
    blocks: input.blocks,
    settings: input.settings,
    equipmentOverride: input.request.equipmentOverride,
  });
  const { plan, meta } = generate(ctx, { mode: input.request.mode, templateId: input.request.templateId }, input.settings, {
    templates: input.templates,
    forceTrain,
  });
  const next: PendingBlock = {
    blockId,
    plan,
    startedAt: null,
    meta,
    blockSeconds: ctx.blockSeconds,
    rerolls: (input.previous?.rerolls ?? 0) + (input.reroll ? 1 : 0),
  };
  if (forceTrain) next.forceTrain = true;
  return next;
}
