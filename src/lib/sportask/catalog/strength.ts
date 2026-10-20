import type { ExerciseDef } from '../../../types/sportask';
import { makeExercise } from './define';

const s = makeExercise('strength', 'core');

/** CONTENT.md section 3. Tag strength (plus the extras), impact none unless noted. */
export const STRENGTH_EXERCISES: ExerciseDef[] = [
  // push
  s('wallPushUp', 'Flexiones en la pared', 'Wall push-ups', {
    pattern: 'push', dose: '10r', lvl: 1, hints: 'wall', met: 'lightCal', pict: 'pushup',
    cue: 'Body in one straight line; bring the chest to the wall and push away.',
    cueEs: 'Cuerpo en línea recta; acerca el pecho a la pared y empuja para separarte.',
  }),
  s('deskPushUp', 'Flexiones inclinadas en la mesa', 'Desk incline push-ups', {
    pattern: 'push', dose: '10r', lvl: 2, hints: 'chair', met: 'moderateCal', pict: 'pushup',
    cue: 'Hands on a stable desk edge, lower the chest to it, elbows at 45°.',
    cueEs: 'Manos en el borde de una mesa estable, baja el pecho hasta ella con los codos a 45°.',
  }),
  s('kneePushUp', 'Flexiones de rodillas', 'Knee push-ups', {
    pattern: 'push', dose: '8r', lvl: 2, floor: true, met: 'moderateCal', pict: 'pushup',
    cue: 'Knees down, hips in line with the shoulders; chest to fist height.',
    cueEs: 'Rodillas apoyadas y caderas alineadas con los hombros; baja el pecho hasta la altura de un puño.',
  }),
  s('pushUp', 'Flexiones', 'Push-ups', {
    pattern: 'push', tags: ['calories'], dose: '8r', lvl: 3, floor: true, met: 'moderateCal', pict: 'pushup',
    cue: 'Hands under the shoulders, body rigid, chest to fist height.',
    cueEs: 'Manos bajo los hombros, cuerpo rígido y el pecho baja hasta la altura de un puño.',
  }),
  s('feetElevatedPushUp', 'Flexiones con pies elevados', 'Feet-elevated push-ups', {
    pattern: 'push', dose: '6r', lvl: 4, floor: true, hints: 'chair', met: 'moderateCal', pict: 'pushup',
    cue: 'Feet on a chair, brace the belly so the hips do not sag.',
    cueEs: 'Pies sobre una silla; aprieta el abdomen para que la cadera no se hunda.',
  }),
  s('archerPushUp', 'Flexiones arquero', 'Archer push-ups', {
    pattern: 'push', dose: '4r', side: true, lvl: 5, floor: true, met: 'moderateCal', pict: 'pushup',
    cue: 'Wide hands; lower toward one hand while the other arm stays straight.',
    cueEs: 'Manos muy separadas; baja hacia una mano mientras el otro brazo se mantiene recto.',
  }),
  s('ballPushUp', 'Flexiones con manos en fitball', 'Ball push-ups', {
    pattern: 'push', dose: '6r', needs: ['yogaBall'], lvl: 4, floor: true, met: 'moderateCal', pict: 'pushup',
    cue: 'Hands on the ball, squeeze it to keep it still; slow on the way down.',
    cueEs: 'Manos sobre el balón, apriétalo para que no se mueva y baja despacio.',
  }),
  s('dumbbellFloorPress', 'Press de suelo con mancuernas', 'Dumbbell floor press', {
    pattern: 'push', dose: '10r', needs: ['dumbbells'], lvl: 2, floor: true, hints: 'load', met: 'resistance', pict: 'press',
    cue: 'Lie down, elbows touch the floor softly, press straight up.',
    cueEs: 'Túmbate, toca el suelo suavemente con los codos y empuja recto hacia arriba.',
  }),
  s('bandChestPress', 'Press de pecho con goma', 'Band chest press', {
    pattern: 'push', dose: '12r', needs: ['band'], lvl: 2, met: 'resistance', pict: 'press',
    cue: 'Band behind the back, press forward to straight arms, slow return.',
    cueEs: 'Goma por detrás de la espalda, empuja hacia delante hasta estirar los brazos y vuelve despacio.',
  }),
  s('chairDip', 'Fondos en silla', 'Chair dips', {
    pattern: 'push', dose: '8r', lvl: 3, hints: 'chair', met: 'moderateCal', pict: 'press',
    cue: 'Stable chair against a wall; lower until the elbows reach 90°, shoulders down.',
    cueEs: 'Silla estable contra una pared; baja hasta que los codos formen 90° con los hombros abajo.',
  }),
  // pushVertical
  s('bandOverheadPress', 'Press sobre la cabeza con goma', 'Band overhead press', {
    pattern: 'pushVertical', dose: '12r', needs: ['band'], lvl: 2, met: 'resistance', pict: 'press',
    cue: 'Stand on the band, press overhead without arching the lower back.',
    cueEs: 'De pie sobre la goma, empuja por encima de la cabeza sin arquear la zona lumbar.',
  }),
  s('dumbbellShoulderPress', 'Press de hombro con mancuernas', 'Dumbbell shoulder press', {
    pattern: 'pushVertical', dose: '10r', needs: ['dumbbells'], lvl: 3, hints: 'load', met: 'resistance', pict: 'press',
    cue: 'Ribs down, press up and slightly back so the weights finish over the ears.',
    cueEs: 'Costillas abajo; empuja arriba y un poco atrás para que las pesas acaben sobre las orejas.',
  }),
  s('kettlebellPress', 'Press con kettlebell', 'Kettlebell press', {
    pattern: 'pushVertical', dose: '8r', side: true, needs: ['kettlebell'], lvl: 3, hints: 'load', met: 'resistance', pict: 'press',
    cue: 'Bell in the rack, squeeze the glutes, press until the arm is straight.',
    cueEs: 'Pesa apoyada en el hombro, aprieta los glúteos y empuja hasta estirar el brazo.',
  }),
  s('pikePushUp', 'Flexiones en pica', 'Pike push-ups', {
    pattern: 'pushVertical', dose: '6r', lvl: 4, floor: true, met: 'moderateCal', pict: 'pushup',
    cue: 'Hips high, lower the head between the hands, push back up.',
    cueEs: 'Caderas altas, baja la cabeza entre las manos y empuja para subir.',
  }),
  // pull
  s('proneYTW', 'Y-T-W boca abajo', 'Prone Y-T-W', {
    pattern: 'pull', dose: '6r', lvl: 1, floor: true, met: 'lightCal', pict: 'row', spr: 8,
    cue: 'Face down, thumbs up; lift the arms into Y, T, then W, squeezing the shoulder blades.',
    cueEs: 'Boca abajo con los pulgares hacia arriba; sube los brazos en Y, T y W apretando los omóplatos.',
  }),
  s('reverseSnowAngel', 'Ángel de nieve invertido', 'Reverse snow angels', {
    pattern: 'pull', dose: '8r', lvl: 2, floor: true, met: 'lightCal', pict: 'row', spr: 4,
    cue: 'Face down, arms just off the floor; sweep them from the hips to overhead and back.',
    cueEs: 'Boca abajo con los brazos apenas separados del suelo; llévalos de las caderas a la cabeza y vuelve.',
  }),
  s('bandBentOverRow', 'Remo inclinado con goma', 'Band bent-over row', {
    pattern: 'pull', dose: '12r', needs: ['band'], lvl: 2, met: 'resistance', pict: 'row',
    cue: 'Stand on the band, hinge forward, pull the elbows to the ribs.',
    cueEs: 'De pie sobre la goma, inclina el tronco y lleva los codos hacia las costillas.',
  }),
  s('dumbbellRow', 'Remo a una mano', 'One-arm row', {
    pattern: 'pull', dose: '10r', side: true, needs: ['dumbbells', 'kettlebell'], lvl: 2, hints: 'chair load', met: 'resistance', pict: 'row',
    cue: 'Free hand on a desk, flat back; pull the weight toward the hip.',
    cueEs: 'Apoya la mano libre en una mesa con la espalda plana; lleva el peso hacia la cadera.',
  }),
  s('kettlebellHighPull', 'Tirón alto con kettlebell', 'Kettlebell high pull', {
    pattern: 'pull', dose: '10r', needs: ['kettlebell'], lvl: 3, hints: 'load', met: 'resistanceVig', pict: 'row', spr: 2,
    cue: 'Drive with the hips, pull the elbows high and wide, control it down.',
    cueEs: 'Impulsa con las caderas, sube los codos altos y abiertos y baja el peso con control.',
  }),
  s('renegadeRow', 'Remo renegado', 'Renegade row', {
    pattern: 'pull', dose: '6r', side: true, needs: ['dumbbells'], lvl: 4, floor: true, hints: 'load', met: 'resistanceVig', pict: 'row',
    cue: 'High plank on the dumbbells, feet wide; row one side without twisting the hips.',
    cueEs: 'Plancha alta sobre las mancuernas con los pies separados; rema con un lado sin girar la cadera.',
  }),
  // squat
  s('sitToStand', 'Levantarse de la silla', 'Sit-to-stand', {
    pattern: 'squat', dose: '10r', lvl: 1, hints: 'chair', met: 'lightCal', pict: 'squat',
    cue: 'Arms crossed, stand up without the hands, sit down slowly.',
    cueEs: 'Brazos cruzados, levántate sin usar las manos y siéntate despacio.',
  }),
  s('ballWallSquat', 'Sentadilla con fitball en la pared', 'Ball wall squat', {
    pattern: 'squat', dose: '12r', needs: ['yogaBall'], lvl: 1, hints: 'wall', met: 'lightCal', pict: 'squat',
    cue: 'Ball between your back and the wall, roll down to a comfortable depth.',
    cueEs: 'Balón entre la espalda y la pared; baja rodando hasta una profundidad cómoda.',
  }),
  s('airSquat', 'Sentadillas', 'Air squats', {
    pattern: 'squat', tags: ['calories'], dose: '15r', lvl: 2, met: 'moderateCal', pict: 'squat',
    cue: 'Feet shoulder-width, sit back and down, knees follow the toes.',
    cueEs: 'Pies a la anchura de los hombros, siéntate hacia atrás y abajo con las rodillas siguiendo las puntas.',
  }),
  s('bandSquat', 'Sentadilla con goma', 'Band squat', {
    pattern: 'squat', dose: '12r', needs: ['band'], lvl: 2, met: 'resistance', pict: 'squat',
    cue: 'Stand on the band, hands at the shoulders, squat and drive up through the heels.',
    cueEs: 'De pie sobre la goma con las manos en los hombros, baja y sube empujando con los talones.',
  }),
  s('wallSit', 'Sentadilla isométrica en la pared', 'Wall sit', {
    pattern: 'squat', dose: '30s', lvl: 2, hints: 'wall', met: 'moderateCal', pict: 'squat',
    cue: 'Back flat on the wall, thighs as close to level as is comfortable.',
    cueEs: 'Espalda plana contra la pared y los muslos tan horizontales como te resulte cómodo.',
  }),
  s('pauseSquat', 'Sentadilla con pausa', 'Pause squats', {
    pattern: 'squat', dose: '8r', lvl: 3, met: 'moderateCal', pict: 'squat', spr: 7,
    cue: 'Hold 3 s at the bottom, stay tight, then stand up.',
    cueEs: 'Aguanta 3 s abajo, mantén el cuerpo firme y sube.',
  }),
  s('gobletSquat', 'Sentadilla goblet', 'Goblet squat', {
    pattern: 'squat', dose: '10r', needs: ['kettlebell', 'dumbbells'], lvl: 3, hints: 'load', met: 'resistanceVig', pict: 'squat',
    cue: 'Weight at the chest, elbows inside the knees, chest proud.',
    cueEs: 'Peso pegado al pecho, codos por dentro de las rodillas y pecho alto.',
  }),
  s('jumpSquat', 'Sentadilla con salto', 'Jump squats', {
    pattern: 'squat', tags: ['calories'], dose: '10r', lvl: 4, imp: 'high', met: 'vigorousCal', pict: 'jump', spr: 2,
    cue: 'Land softly on the whole foot and sink straight into the next squat.',
    cueEs: 'Aterriza suave con todo el pie y baja directamente a la siguiente sentadilla.',
  }),
  s('singleLegSitToStand', 'Levantarse de la silla a una pierna', 'Single-leg sit-to-stand', {
    pattern: 'squat', dose: '5r', side: true, lvl: 5, hints: 'chair', met: 'moderateCal', pict: 'squat', spr: 4,
    cue: 'One foot forward off the floor; stand up and sit down with control.',
    cueEs: 'Un pie adelantado sin tocar el suelo; levántate y siéntate con control.',
  }),
  // lunge
  s('staticSplitSquat', 'Sentadilla dividida', 'Split squat', {
    pattern: 'lunge', dose: '8r', side: true, lvl: 2, met: 'moderateCal', pict: 'lunge',
    cue: 'Long stance, the back knee drops straight down, the front heel stays down.',
    cueEs: 'Postura larga; la rodilla de atrás baja en vertical y el talón de delante no se levanta.',
  }),
  s('reverseLunge', 'Zancada atrás', 'Reverse lunge', {
    pattern: 'lunge', tags: ['calories'], dose: '8r', side: true, lvl: 2, met: 'moderateCal', pict: 'lunge',
    cue: 'Step back, both knees to 90°, push through the front heel to return.',
    cueEs: 'Da un paso atrás, flexiona ambas rodillas a 90° y vuelve empujando con el talón delantero.',
  }),
  s('dumbbellReverseLunge', 'Zancada atrás con peso', 'Weighted reverse lunge', {
    pattern: 'lunge', dose: '8r', side: true, needs: ['dumbbells', 'kettlebell'], lvl: 3, hints: 'load', met: 'resistanceVig', pict: 'lunge',
    cue: 'Weights at your sides, tall chest, controlled step back.',
    cueEs: 'Pesas a los lados, pecho alto y un paso atrás controlado.',
  }),
  s('bulgarianSplitSquat', 'Sentadilla búlgara', 'Bulgarian split squat', {
    pattern: 'lunge', dose: '8r', side: true, lvl: 4, hints: 'chair', met: 'moderateCal', pict: 'lunge',
    cue: 'Back foot on a chair, lower straight down, front knee over the foot.',
    cueEs: 'Pie de atrás sobre una silla, baja en vertical con la rodilla delantera sobre el pie.',
  }),
  // hinge
  s('standingGoodMorning', 'Buenos días sin peso', 'Bodyweight good morning', {
    pattern: 'hinge', dose: '12r', lvl: 1, met: 'lightCal', pict: 'hinge',
    cue: 'Hands behind the head, soft knees; push the hips back with a flat back.',
    cueEs: 'Manos tras la cabeza y rodillas flexibles; lleva la cadera atrás con la espalda plana.',
  }),
  s('gluteBridge', 'Puente de glúteo', 'Glute bridge', {
    pattern: 'hinge', dose: '12r', lvl: 1, floor: true, met: 'lightCal', pict: 'bridge',
    cue: 'Feet flat, push through the heels, squeeze the glutes at the top.',
    cueEs: 'Pies apoyados, empuja con los talones y aprieta los glúteos arriba.',
  }),
  s('bandGoodMorning', 'Buenos días con goma', 'Band good morning', {
    pattern: 'hinge', dose: '12r', needs: ['band'], lvl: 2, met: 'resistance', pict: 'hinge',
    cue: 'Band under the feet and behind the neck; hinge and stand by squeezing the glutes.',
    cueEs: 'Goma bajo los pies y tras la nuca; inclínate y vuelve a subir apretando los glúteos.',
  }),
  s('kettlebellDeadlift', 'Peso muerto con kettlebell', 'Kettlebell deadlift', {
    pattern: 'hinge', dose: '10r', needs: ['kettlebell', 'dumbbells'], lvl: 2, hints: 'load', met: 'resistance', pict: 'hinge',
    cue: 'Weight between the feet, hips back, flat back, stand tall.',
    cueEs: 'Peso entre los pies, cadera atrás, espalda plana y sube hasta quedar erguido.',
  }),
  s('singleLegGluteBridge', 'Puente de glúteo a una pierna', 'Single-leg glute bridge', {
    pattern: 'hinge', dose: '8r', side: true, lvl: 3, floor: true, met: 'moderateCal', pict: 'bridge',
    cue: 'One leg up, hips level, drive through the planted heel.',
    cueEs: 'Una pierna elevada, caderas niveladas y empuja con el talón apoyado.',
  }),
  s('dumbbellRdl', 'Peso muerto rumano con peso', 'Romanian deadlift', {
    pattern: 'hinge', dose: '10r', needs: ['dumbbells', 'kettlebell'], lvl: 3, hints: 'load', met: 'resistanceVig', pict: 'hinge',
    cue: 'Weights slide down the thighs, hips back, stop when the back would round.',
    cueEs: 'Las pesas resbalan por los muslos, cadera atrás; para antes de que la espalda se redondee.',
  }),
  s('ballHamstringCurl', 'Curl femoral con fitball', 'Ball hamstring curl', {
    pattern: 'hinge', dose: '10r', needs: ['yogaBall'], lvl: 3, floor: true, met: 'moderateCal', pict: 'bridge',
    cue: 'Heels on the ball, hips up, curl the ball in and roll it out slowly.',
    cueEs: 'Talones sobre el balón y cadera arriba; acerca el balón y aléjalo despacio.',
  }),
  s('singleLegRdl', 'Peso muerto a una pierna', 'Single-leg RDL', {
    pattern: 'hinge', dose: '8r', side: true, lvl: 3, met: 'moderateCal', pict: 'hinge', spr: 4,
    cue: 'Hinge on one leg, the other leg reaches back, hips square; touch a wall for balance.',
    cueEs: 'Inclínate sobre una pierna mientras la otra se extiende atrás con la cadera recta; toca una pared para equilibrarte.',
  }),
  s('kettlebellSwing', 'Swing con kettlebell', 'Kettlebell swing', {
    pattern: 'hinge', tags: ['calories'], dose: '15r', needs: ['kettlebell'], lvl: 3, hints: 'space load', met: 'vigorousCal', pict: 'hinge', spr: 2,
    cue: 'Hike the bell back, snap the hips forward; the arms are just ropes.',
    cueEs: 'Lanza la pesa hacia atrás y extiende la cadera con fuerza; los brazos solo son cuerdas.',
  }),
  // core
  s('deskPlank', 'Plancha inclinada en la mesa', 'Desk incline plank', {
    pattern: 'core', dose: '30s', lvl: 1, hints: 'chair', met: 'lightCal', pict: 'plank',
    cue: 'Forearms on the desk, body in one line, belly braced.',
    cueEs: 'Antebrazos sobre la mesa, cuerpo en línea recta y abdomen firme.',
  }),
  s('deadBug', 'Bicho muerto', 'Dead bug', {
    pattern: 'core', dose: '8r', side: true, lvl: 1, floor: true, met: 'lightCal', pict: 'stretchFloor', spr: 4,
    cue: 'Lower back pressed down; extend the opposite arm and leg slowly.',
    cueEs: 'Zona lumbar pegada al suelo; estira despacio el brazo y la pierna contrarios.',
  }),
  s('birdDog', 'Perro de caza', 'Bird dog', {
    pattern: 'core', dose: '8r', side: true, lvl: 1, floor: true, met: 'lightCal', pict: 'plank', spr: 4,
    cue: 'On all fours, reach the opposite arm and leg long without the hips rotating.',
    cueEs: 'A cuatro patas, estira el brazo y la pierna contrarios sin girar la cadera.',
  }),
  s('plank', 'Plancha', 'Plank', {
    pattern: 'core', dose: '30s', lvl: 2, floor: true, met: 'moderateCal', pict: 'plank',
    cue: 'Elbows under the shoulders, glutes squeezed, do not let the hips sag.',
    cueEs: 'Codos bajo los hombros, glúteos apretados y sin dejar caer la cadera.',
  }),
  s('suitcaseHold', 'Sujeción tipo maleta', 'Suitcase hold', {
    pattern: 'core', dose: '30s', side: true, needs: ['kettlebell', 'dumbbells'], lvl: 2, hints: 'load', met: 'resistance', pict: 'stretchStand',
    cue: 'Stand tall with one weight at your side; do not lean toward it.',
    cueEs: 'Mantente erguido con una pesa a un lado; no te inclines hacia ella.',
  }),
  s('sidePlank', 'Plancha lateral', 'Side plank', {
    pattern: 'core', dose: '20s', side: true, lvl: 3, floor: true, met: 'moderateCal', pict: 'sidePlank',
    cue: 'Elbow under the shoulder, hips high, body in one line.',
    cueEs: 'Codo bajo el hombro, caderas altas y cuerpo en línea recta.',
  }),
  s('ballRollout', 'Rollout con fitball', 'Ball rollout', {
    pattern: 'core', dose: '8r', needs: ['yogaBall'], lvl: 3, floor: true, met: 'moderateCal', pict: 'plank', spr: 4,
    cue: 'Kneel, forearms on the ball; roll out only as far as the back stays flat.',
    cueEs: 'De rodillas con los antebrazos sobre el balón; rueda solo hasta donde la espalda siga plana.',
  }),
  s('hollowHold', 'Posición hueca', 'Hollow hold', {
    pattern: 'core', dose: '20s', lvl: 4, floor: true, met: 'moderateCal', pict: 'stretchFloor',
    cue: 'Lower back glued down, arms and legs long; bend the knees to make it easier.',
    cueEs: 'Zona lumbar pegada al suelo y brazos y piernas largos; flexiona las rodillas para facilitarlo.',
  }),
  s('ballStirThePot', 'Remover la olla en fitball', 'Ball stir-the-pot', {
    pattern: 'core', dose: '5r', side: true, needs: ['yogaBall'], lvl: 5, floor: true, met: 'moderateCal', pict: 'plank', spr: 6,
    cue: 'Plank on the ball; draw small circles with the forearms.',
    cueEs: 'Plancha sobre el balón; dibuja círculos pequeños con los antebrazos.',
  }),
];
