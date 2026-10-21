import { type AnyGoal } from '../engine/context';
import { createRegistry } from '../registry';
import { CALORIES_GOAL } from './calories';
import { MOBILITY_GOAL } from './mobility';
import { STRENGTH_GOAL } from './strength';

export const GOALS = createRegistry<AnyGoal>([MOBILITY_GOAL, STRENGTH_GOAL, CALORIES_GOAL]);
