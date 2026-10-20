import type { EquipmentDef } from '../../types/sportask';
import { createRegistry } from './registry';

/** Ids are permanent. Band exercises in v1 need no anchor (CONTENT.md section 1). */
export const EQUIPMENT = createRegistry<EquipmentDef>([
  { id: 'band', name: { en: 'Resistance bands', es: 'Gomas elásticas' }, icon: 'band', details: 'bandStrengths' },
  { id: 'kettlebell', name: { en: 'Kettlebell', es: 'Kettlebell' }, icon: 'kettlebell', details: 'weights' },
  { id: 'dumbbells', name: { en: 'Dumbbells', es: 'Mancuernas' }, icon: 'dumbbell', details: 'weights' },
  { id: 'jumpRope', name: { en: 'Jump rope', es: 'Comba' }, icon: 'rope' },
  { id: 'yogaBall', name: { en: 'Yoga ball (Swiss ball)', es: 'Balón de yoga (fitball)' }, icon: 'ball' },
]);
