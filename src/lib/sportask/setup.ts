import { SPORTASK_DEFAULTS } from '../sportask-defaults';
import type { Constraints, Enrolment, EquipmentInventory, EquipmentItem, SportProfile, SportaskSettings } from '../../types/sportask';
import { CADENCES, type CadenceValues } from './cadences';
import { GOALS } from './goals';
import { hasProfile } from './profile';
import { SKINS } from './skins';

/**
 * The pure side of the guided setup (Configuration > Sportask, `sportask-setup-wizard`) and of the form blocks it shares with the
 * settings page: the value shapes of those blocks, the wizard's draft, the Quick preset, and the single patch that *Finish* writes.
 * Lazy like everything under `lib/sportask`. No Angular, no storage; `scripts/sportask-check.ts` exercises it.
 */

/** What the goal block edits: the goal, one of its programs and the level. `null` (where allowed) means no program: free training only. */
export interface GoalPick {
  goalId: string;
  programId: string;
  level: 1 | 2 | 3;
}

/** What the rhythm block edits: a preset id or `custom`, plus the custom values (kept while a preset is picked, like the settings do). */
export interface RhythmValue {
  cadenceId: string;
  customCadence?: CadenceValues;
}

/** What the style block edits. */
export interface StyleValue {
  skin: string;
  skinWholeApp: boolean;
  cues: boolean;
  autoStartBreak: boolean;
}

/** Everything the wizard collects before *Finish*. */
export interface SetupDraft {
  pick: GoalPick | null;
  /** The optional "About you" answers; `{}` = none given. Quick setup leaves it empty. */
  profile: SportProfile;
  equipment: EquipmentInventory;
  constraints: Constraints;
  rhythm: RhythmValue;
  style: StyleValue;
}

/** The steps of the personalised path, in order (the summary is the last). */
export const SETUP_STEPS = ['goal', 'profile', 'gear', 'limits', 'rhythm', 'style', 'summary'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/** The pick for a goal: `programId` falls back to the goal's first program. */
export function pickFor(goalId: string, programId?: string, level: 1 | 2 | 3 = 1): GoalPick {
  const goal = GOALS.get(goalId) ?? GOALS.all[0]!;
  return { goalId: goal.id, programId: goal.programs.find((p) => p.id === programId)?.id ?? goal.programs[0]!.id, level };
}

/** Quick setup: Improve mobility, Desk reset, level 1, no equipment or limits, Classic 25/5, the default skin everywhere, step sounds on. */
export function quickDraft(): SetupDraft {
  const d = SPORTASK_DEFAULTS;
  return {
    pick: pickFor(GOALS.all[0]!.id),
    profile: {},
    equipment: {},
    constraints: { ...d.constraints },
    rhythm: { cadenceId: d.cadenceId },
    style: { skin: d.skin, skinWholeApp: d.skinWholeApp, cues: d.cues, autoStartBreak: d.autoStartBreak },
  };
}

/** The personalised path starts from the current settings (`sanitizeSettings` output); without a program it starts on the first goal, or on free training when `keepFree`. */
export function draftFromSettings(s: SportaskSettings, keepFree: boolean): SetupDraft {
  const e = s.enrolment;
  const equipment: EquipmentInventory = {};
  for (const [id, item] of Object.entries(s.equipment)) {
    const copy: EquipmentItem = { owned: item.owned };
    if (item.weightsKg) copy.weightsKg = [...item.weightsKg];
    if (item.bandStrengths) copy.bandStrengths = [...item.bandStrengths];
    equipment[id] = copy;
  }
  const rhythm: RhythmValue = { cadenceId: s.cadenceId };
  if (s.customCadence) rhythm.customCadence = { ...s.customCadence };
  return {
    pick: e ? pickFor(e.goalId, e.programId, e.level) : keepFree ? null : quickDraft().pick,
    profile: s.profile ? { ...s.profile } : {},
    equipment,
    constraints: { ...s.constraints },
    rhythm,
    style: { skin: s.skin, skinWholeApp: s.skinWholeApp, cues: s.cues, autoStartBreak: s.autoStartBreak },
  };
}

/** Whether the personalised step can be left with Next. Only the summary has a real gate (the notice); the rest checks the draft makes sense. */
export function stepValid(step: SetupStep, draft: SetupDraft, noticeAccepted: boolean): boolean {
  switch (step) {
    case 'goal': {
      const p = draft.pick;
      return p === null || !!GOALS.get(p.goalId)?.programs.some((x) => x.id === p.programId);
    }
    case 'profile': // Every answer is optional.
    case 'gear': // Any inventory is valid (owned equipment without weights or bands is allowed).
    case 'limits':
      return true;
    case 'rhythm': {
      const { cadenceId, customCadence } = draft.rhythm;
      return cadenceId === 'custom' ? !!customCadence : !!CADENCES.get(cadenceId);
    }
    case 'style':
      return !!SKINS.get(draft.style.skin);
    case 'summary':
      return noticeAccepted;
  }
}

/** When the notice was accepted before (the settings keep it when a program is left, the enrolment carries a copy), else 0. */
export function acceptedAt(s: SportaskSettings): number {
  return s.disclaimerAcceptedAt ?? ((s.enrolment?.acceptedDisclaimerAt ?? 0) > 0 ? s.enrolment!.acceptedDisclaimerAt : 0);
}

/**
 * The one patch *Finish* writes (`SportaskSettingsService.update`): everything the draft holds, the switch on, `setupDoneAt` and the
 * notice acceptance. An unchanged program keeps its enrolment (and its start date); a different one starts today; none leaves it.
 */
export function setupPatch(draft: SetupDraft, current: SportaskSettings, now: number, today: string): Partial<SportaskSettings> {
  const accepted = acceptedAt(current) || now;
  const e = current.enrolment;
  const p = draft.pick;
  let enrolment: Enrolment | null = null;
  if (p) {
    enrolment =
      e && e.goalId === p.goalId && e.programId === p.programId && e.level === p.level
        ? e
        : { goalId: p.goalId, programId: p.programId, level: p.level, startedOn: today, acceptedDisclaimerAt: accepted };
  }
  const patch: Partial<SportaskSettings> = {
    enabled: true,
    setupDoneAt: now,
    disclaimerAcceptedAt: accepted,
    enrolment,
    equipment: draft.equipment,
    constraints: draft.constraints,
    cadenceId: draft.rhythm.cadenceId,
    skin: draft.style.skin,
    skinWholeApp: draft.style.skinWholeApp,
    cues: draft.style.cues,
    autoStartBreak: draft.style.autoStartBreak,
  };
  if (draft.rhythm.customCadence) patch.customCadence = draft.rhythm.customCadence;
  // Absent when empty (the wire rule); `undefined` clears an earlier profile when the stored settings are merged with this patch.
  patch.profile = hasProfile(draft.profile) ? draft.profile : undefined;
  return patch;
}
