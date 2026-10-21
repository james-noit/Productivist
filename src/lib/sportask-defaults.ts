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
  skin: 'cyberpunk',
  skinWholeApp: true,
  cues: true,
  autoStartBreak: false,
};
