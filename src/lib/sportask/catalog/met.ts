/**
 * MET classes (CONTENT.md section 6), checked against the 2024 Adult Compendium of Physical Activities
 * (pacompendium.com, "conditioning exercise"). Where a value could not be confirmed the lower plausible one is used.
 *   stretch          2.3  02101 Stretching, mild (confirmed)
 *   walkInPlace      3.0  no entry for marching in place; lower than the 3.5 of CONTENT.md (walking, firm surface, 2.5 mph in the 2011 list) - unconfirmed
 *   lightCal         2.8  02024 Calisthenics at light effort (confirmed)
 *   lightCardio      3.8  02022 Calisthenics at moderate effort; CONTENT.md says 4.0, lowered because no entry confirms it
 *   moderateCal      3.8  02022 Calisthenics at moderate effort (confirmed)
 *   resistance       3.5  02054 Resistance training, multiple exercises, 8-15 reps (confirmed)
 *   resistanceVig    5.0  02052 Resistance training: squats and deadlifts, slow or explosive effort; 02035 circuit training, moderate (confirmed)
 *   boxing           5.0  no shadow-boxing entry in the 2024 list; CONTENT.md says 5.5 (2011 punching bag), lowered to the 02035 moderate-circuit value
 *   vigorousCal      7.5  02020 Calisthenics at vigorous effort (the 2024 value; the 2011 list said 8.0, which CONTENT.md used)
 *   ropeSlow         8.8  2011 "rope jumping, slow"; the 2024 02069 (machine-paced, 120/min) is 9.0, so 8.8 stays below it
 *   ropeModerate    11.0  02068 Rope skipping, general (the 2024 value; CONTENT.md said 11.8 from the 2011 list)
 */
export const MET = {
  stretch: 2.3,
  walkInPlace: 3.0,
  lightCal: 2.8,
  lightCardio: 3.8,
  moderateCal: 3.8,
  resistance: 3.5,
  resistanceVig: 5.0,
  boxing: 5.0,
  vigorousCal: 7.5,
  ropeSlow: 8.8,
  ropeModerate: 11.0,
} as const;
export type MetClass = keyof typeof MET;
