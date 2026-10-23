import { EQUIPMENT } from '../equipment';
import type { Catalog } from '../engine/context';
import { createRegistry } from '../registry';
import { ASSESSMENTS } from './assessments';
import { CALORIES_EXERCISES } from './calories';
import { LADDERS } from './ladders';
import { MOBILITY_EXERCISES } from './mobility';
import { STRENGTH_EXERCISES } from './strength';

export { MET } from './met';
export type { MetClass } from './met';
export { PICTOGRAM_IDS } from './pictograms';

/** Bump when an exercise, ladder or assessment is added or changed (stored on every block). */
export const CATALOG_VERSION = 2;

export const CATALOG: Catalog = {
  exercises: createRegistry([...MOBILITY_EXERCISES, ...STRENGTH_EXERCISES, ...CALORIES_EXERCISES]),
  ladders: createRegistry(LADDERS),
  equipment: EQUIPMENT,
  assessments: createRegistry(ASSESSMENTS),
};
