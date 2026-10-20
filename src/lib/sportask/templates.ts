import type { Dose, SportTemplate, TemplateSlot } from '../../types/sportask';
import { createRegistry } from './registry';

const ex = (exerciseId: string, dose?: Dose): TemplateSlot => (dose ? { exerciseId, dose } : { exerciseId });
const exs = (...ids: string[]): TemplateSlot[] => ids.map((id) => ex(id));

let order = 0;
function tpl(
  id: string,
  es: string,
  en: string,
  format: SportTemplate['format'],
  minSeconds: number,
  slots: TemplateSlot[],
  work?: number,
  rest?: number,
): SportTemplate {
  const t: SportTemplate = { id, name: en, nameText: { en, es }, slots, format, minSeconds, order: order++, createdAt: 0, updatedAt: 0, builtin: true };
  if (work !== undefined) t.workSeconds = work;
  if (rest !== undefined) t.restSeconds = rest;
  return t;
}

/** CONTENT.md section 8. Ids are prefixed `tpl.`. */
export const BUILTIN_TEMPLATES = createRegistry<SportTemplate>([
  tpl('tpl.deskReset', 'Reinicio de escritorio', 'Desk reset', 'sequence', 60, exs('chinTucks', 'seatedThoracicRotation', 'wristFlexorStretch', 'standingHipCars')),
  tpl('tpl.oneMinutePush', 'Un minuto de empuje', 'One-minute push', 'sequence', 30, [{ pattern: 'push', tag: 'strength' }]),
  tpl('tpl.mobilityRandom', 'Movilidad al azar', 'Random mobility', 'sequence', 60, [
    { pattern: 'mobility', zone: 'hips' },
    { pattern: 'mobility', zone: 'shoulders' },
    { pattern: 'mobility', zone: 'thoracic' },
  ]),
  tpl('tpl.coreFloor', 'Core en el suelo', 'Floor core', 'sequence', 120, exs('deadBug', 'plank', 'sidePlank', 'birdDog')),
  tpl('tpl.tabataLegs', 'Tabata de piernas', 'Leg tabata', 'intervals', 240, [ex('airSquat'), ex('reverseLunge'), { pattern: 'cardio', tag: 'calories' }, ex('skaterStep')], 20, 10),
  tpl('tpl.lowImpactCardio', 'Cardio sin saltos', 'Low-impact cardio', 'intervals', 60, exs('highKneeMarch', 'stepJack', 'shadowBoxing', 'skaterStep', 'stepBackBurpee'), 30, 30),
  tpl('tpl.fullBodyEmom', 'EMOM cuerpo completo', 'Full-body EMOM', 'emom', 240, [
    ex('pushUp', { reps: 8 }),
    ex('airSquat', { reps: 12 }),
    ex('gluteBridge', { reps: 12 }),
    ex('slowMountainClimber', { seconds: 30 }),
  ]),
  tpl('tpl.bands', 'Circuito con gomas', 'Band circuit', 'sequence', 150, exs('bandPullApart', 'bandBentOverRow', 'bandChestPress', 'bandSquat', 'bandGoodMorning')),
  tpl('tpl.kettlebell', 'Kettlebell exprés', 'Kettlebell express', 'intervals', 120, exs('kettlebellSwing', 'gobletSquat', 'dumbbellRow', 'kettlebellHalo'), 30, 30),
  tpl('tpl.dumbbells', 'Mancuernas exprés', 'Dumbbell express', 'sequence', 150, exs('dumbbellRow', 'gobletSquat', 'dumbbellShoulderPress', 'dumbbellRdl')),
  tpl('tpl.rope', 'Comba', 'Jump rope', 'intervals', 120, exs('jumpRopeBasic', 'shadowBoxing', 'jumpRopeAlternate', 'marchInPlace'), 30, 30),
  tpl('tpl.fitballCore', 'Core con fitball', 'Yoga ball core', 'sequence', 120, exs('ballRollout', 'ballHamstringCurl', 'ballHipCircles', 'ballThoracicExtension')),
]);
