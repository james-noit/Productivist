import type { AssessmentDef } from '../engine/context';

/** CONTENT.md section 5. */
export const ASSESSMENTS: AssessmentDef[] = [
  {
    id: 'mobDeepSquat',
    name: { en: 'Deep squat hold', es: 'Sentadilla profunda: tiempo' },
    instructions: { en: 'Heels down, hold as long as you are comfortable (max 2 min).', es: 'Talones en el suelo; aguanta todo lo que te resulte cómodo (máximo 2 min).' },
    metric: 'seconds', exerciseIds: ['deepSquatHold'], seconds: 120, higherIsBetter: true,
  },
  {
    id: 'mobKneeToWall',
    name: { en: 'Knee-to-wall distance', es: 'Rodilla a la pared: distancia' },
    instructions: {
      en: 'Move the foot back until the knee only just touches the wall with the heel down; measure toe-to-wall.',
      es: 'Aleja el pie hasta que la rodilla justo toque la pared con el talón abajo; mide la distancia de los dedos a la pared.',
    },
    metric: 'cm', perSide: true, exerciseIds: ['kneeToWall'], seconds: 60, higherIsBetter: true,
  },
  {
    id: 'mobToeTouch',
    name: { en: 'Toe touch distance', es: 'Tocar los pies: distancia' },
    instructions: {
      en: 'Legs straight, reach down; measure fingertip to floor (0 = touching).',
      es: 'Con las piernas rectas, baja las manos; mide la distancia de los dedos al suelo (0 = tocas el suelo).',
    },
    metric: 'cm', exerciseIds: ['heelUpHamstringStretch'], seconds: 30, higherIsBetter: false,
  },
  {
    id: 'mobBackScratch',
    name: { en: 'Back scratch gap', es: 'Manos a la espalda: distancia' },
    instructions: {
      en: 'One hand over the shoulder, the other up the back; measure the gap (negative if the fingers overlap). The side is the hand on top.',
      es: 'Una mano por encima del hombro y la otra por la espalda; mide el hueco (negativo si los dedos se solapan). El lado es la mano de arriba.',
    },
    metric: 'cm', perSide: true, exerciseIds: ['shoulderCars'], seconds: 60, higherIsBetter: false,
  },
  {
    id: 'strMaxPushUps',
    name: { en: 'Max push-ups', es: 'Flexiones máximas' },
    instructions: { en: 'As many good reps as you can in 60 s; stop when the form breaks.', es: 'Todas las repeticiones buenas que puedas en 60 s; para cuando se rompa la técnica.' },
    metric: 'reps', ladderId: 'push', seconds: 60, higherIsBetter: true,
  },
  {
    id: 'strPlank',
    name: { en: 'Max plank', es: 'Plancha máxima' },
    instructions: { en: 'Hold good form as long as you can (max 3 min).', es: 'Mantén una buena postura todo lo que puedas (máximo 3 min).' },
    metric: 'seconds', exerciseIds: ['plank', 'deskPlank'], seconds: 180, higherIsBetter: true,
  },
  {
    id: 'strSquats60',
    name: { en: 'Squats in 60 s', es: 'Sentadillas en 60 s' },
    instructions: { en: 'Full, controlled reps; count them.', es: 'Repeticiones completas y controladas; cuéntalas.' },
    metric: 'reps', ladderId: 'squat', maxRung: 1, seconds: 60, higherIsBetter: true,
  },
  {
    id: 'calCardio60',
    name: { en: '60-second cardio test', es: 'Test de 60 s' },
    instructions: { en: 'Count full reps in 60 s, then rate the effort (RPE).', es: 'Cuenta las repeticiones completas en 60 s y valora el esfuerzo (RPE).' },
    metric: 'reps', exerciseIds: ['jumpingJack', 'stepJack'], seconds: 60, higherIsBetter: true,
  },
];
