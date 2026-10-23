import type { ExerciseDef } from '../../../types/sportask';
import { makeExercise } from './define';

const c = makeExercise('calories', 'cardio');

/** CONTENT.md section 4. Pattern cardio, tag calories (strength.ts and mobility.ts carry the other calories-tagged moves). */
export const CALORIES_EXERCISES: ExerciseDef[] = [
  c('marchInPlace', 'Marcha en el sitio', 'Marching in place', {
    dose: '40s', lvl: 1, imp: 'low', met: 'walkInPlace', pict: 'march',
    cue: 'Brisk pace, swing the arms, stay tall.',
    cueEs: 'Ritmo vivo, balancea los brazos y mantente erguido.',
  }),
  c('stepJack', 'Jumping jack sin salto', 'Step jacks', {
    dose: '30s', lvl: 1, imp: 'low', met: 'lightCardio', pict: 'march',
    cue: 'Step one foot out as the arms go up; alternate sides quickly.',
    cueEs: 'Abre un pie hacia el lado mientras subes los brazos; alterna los lados con rapidez.',
  }),
  c('highKneeMarch', 'Marcha con rodillas altas', 'High-knee march', {
    dose: '30s', lvl: 1, imp: 'low', met: 'lightCardio', pict: 'march',
    cue: 'Knees to hip height, opposite arm drives, no bouncing.',
    cueEs: 'Rodillas a la altura de la cadera, el brazo contrario impulsa y sin rebotes.',
  }),
  c('shadowBoxing', 'Boxeo de sombra', 'Shadow boxing', {
    dose: '30s', lvl: 1, imp: 'low', met: 'boxing', pict: 'punch',
    cue: 'Light on the feet, fast straight punches, guard back up each time.',
    cueEs: 'Ligero de pies, puñetazos rectos y rápidos, y vuelve a la guardia cada vez.',
  }),
  c('ballSquatReach', 'Sentadilla con fitball arriba', 'Ball squat and reach', {
    dose: '12r', needs: ['yogaBall'], lvl: 1, met: 'moderateCal', pict: 'squat',
    cue: 'Hold the ball at the chest, squat, then press it overhead as you stand.',
    cueEs: 'Sujeta el balón en el pecho, baja en sentadilla y súbelo sobre la cabeza al levantarte.',
  }),
  c('skaterStep', 'Paso de patinador', 'Skater steps', {
    dose: '30s', lvl: 2, imp: 'low', met: 'lightCardio', pict: 'lunge',
    cue: 'Step wide and back behind, swing the arms like a skater.',
    cueEs: 'Da un paso amplio hacia el lado cruzando la otra pierna por detrás y balancea los brazos como un patinador.',
  }),
  c('stepBackBurpee', 'Burpee sin salto', 'Step-back burpee', {
    dose: '6r', lvl: 2, imp: 'low', floor: true, met: 'vigorousCal', pict: 'burpee', spr: 5,
    cue: 'Hands down, step back to a plank, step in and stand tall.',
    cueEs: 'Apoya las manos, retrocede a una plancha, vuelve y ponte de pie erguido.',
  }),
  c('slowMountainClimber', 'Escalador lento', 'Slow mountain climbers', {
    dose: '30s', lvl: 2, imp: 'low', floor: true, met: 'moderateCal', pict: 'mountainClimber',
    cue: 'High plank, bring one knee in at a time, hips level.',
    cueEs: 'En plancha alta, lleva una rodilla cada vez hacia el pecho con la cadera nivelada.',
  }),
  c('bandThruster', 'Thruster con goma', 'Band thruster', {
    dose: '12r', needs: ['band'], lvl: 2, met: 'resistanceVig', pict: 'thruster',
    cue: 'Stand on the band, squat, then press overhead as you rise.',
    cueEs: 'De pie sobre la goma, baja en sentadilla y empuja por encima de la cabeza al subir.',
  }),
  c('jumpingJack', 'Jumping jacks', 'Jumping jacks', {
    dose: '30s', lvl: 2, imp: 'high', met: 'vigorousCal', pict: 'jump',
    cue: 'Land softly on the balls of the feet, arms all the way up.',
    cueEs: 'Aterriza suave sobre la parte delantera del pie y sube los brazos del todo.',
  }),
  c('jumpRopeBasic', 'Comba, salto básico', 'Jump rope, basic bounce', {
    dose: '30s', needs: ['jumpRope'], lvl: 2, imp: 'high', hints: 'space', met: 'ropeSlow', pict: 'rope',
    cue: 'Small jumps, wrists turn the rope, elbows close to the body.',
    cueEs: 'Saltos pequeños, las muñecas giran la cuerda y los codos pegados al cuerpo.',
  }),
  c('highKnees', 'Rodillas altas corriendo', 'High knees', {
    dose: '30s', lvl: 3, imp: 'high', met: 'vigorousCal', pict: 'march',
    cue: 'Run in place, knees to hip height, quick light feet.',
    cueEs: 'Corre en el sitio con las rodillas a la altura de la cadera y pies rápidos y ligeros.',
  }),
  c('skaterHop', 'Salto de patinador', 'Skater hops', {
    dose: '30s', lvl: 3, imp: 'high', met: 'vigorousCal', pict: 'jump',
    cue: 'Leap sideways onto one foot, land soft, pause, bound back.',
    cueEs: 'Salta de lado sobre un pie, aterriza suave, haz una pausa y vuelve al otro lado.',
  }),
  c('mountainClimber', 'Escaladores', 'Mountain climbers', {
    dose: '30s', lvl: 3, imp: 'low', floor: true, met: 'vigorousCal', pict: 'mountainClimber',
    cue: 'Hands under the shoulders, drive the knees in fast, hips down.',
    cueEs: 'Manos bajo los hombros, lleva las rodillas al pecho con rapidez y mantén la cadera baja.',
  }),
  c('jumpRopeAlternate', 'Comba, paso alterno', 'Jump rope, alternate step', {
    dose: '30s', needs: ['jumpRope'], lvl: 3, imp: 'high', hints: 'space', met: 'ropeModerate', pict: 'rope',
    cue: 'Jog over the rope one foot at a time, stay on the balls of the feet.',
    cueEs: 'Trota sobre la cuerda un pie cada vez y mantente sobre la parte delantera del pie.',
  }),
  c('dumbbellThruster', 'Thruster con peso', 'Weighted thruster', {
    dose: '10r', needs: ['dumbbells', 'kettlebell'], lvl: 3, hints: 'load', met: 'resistanceVig', pict: 'thruster',
    cue: 'Weight at the shoulders, squat, then drive it overhead in one motion.',
    cueEs: 'Peso en los hombros, baja en sentadilla y súbelo sobre la cabeza en un solo movimiento.',
  }),
  c('burpee', 'Burpees', 'Burpees', {
    dose: '6r', lvl: 4, imp: 'high', floor: true, met: 'vigorousCal', pict: 'burpee', spr: 5,
    cue: 'Chest to the floor is optional; jump with arms up and land softly.',
    cueEs: 'Bajar el pecho al suelo es opcional; salta con los brazos arriba y aterriza suave.',
  }),
];
