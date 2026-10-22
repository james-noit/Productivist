import type { SportaskSettings } from '../types/sportask';

/**
 * The default Sportask settings (docs/sportask/PLAN.md 4.1). Eager and tiny on purpose: the settings service starts
 * from it, and the lazy sanitiser (`lib/sportask/sanitize.ts`) fills gaps from the same object. Never mutate it.
 */
export const SPORTASK_DEFAULTS: Readonly<SportaskSettings> = {
  enrolment: null,
  cadenceId: 'classic',
  equipment: {},
  constraints: { lowImpact: false, noFloor: false },
  skin: 'app',
  skinWholeApp: true,
  cues: true,
  autoStartBreak: false,
};

/**
 * Whether Sportask is switched on, and whether its setup is done, from the stored settings (`raw`, as they are) and whether this
 * device used it before (`usedElsewhere`: any stored block, or a session running). Settings written before 0.24 have no `enabled`:
 * then a stored enrolment, a block or a session means the user already uses it (on, and set up); new users start off. Once
 * `enabled` is stored it alone decides (only `true` turns it on). Pure and tiny: the settings service evaluates it in the initial bundle.
 */
export function sportaskSwitch(raw: unknown, usedElsewhere: boolean): { enabled: boolean; setupDone: boolean } {
  const s = (raw ?? {}) as Record<string, unknown>;
  const used = s['enabled'] === undefined && (usedElsewhere || !!s['enrolment']);
  return { enabled: used || s['enabled'] === true, setupDone: used || Number(s['setupDoneAt']) > 0 };
}
