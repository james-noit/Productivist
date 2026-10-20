import type { ExerciseDef } from '../../../types/sportask';
import { makeExercise } from './define';

const m = makeExercise('mobility', 'mobility');

/** CONTENT.md section 2. Every exercise: pattern mobility (unless noted), tag mobility, no impact, MET class stretch (unless noted). */
export const MOBILITY_EXERCISES: ExerciseDef[] = [
  m('neckCars', 'Rotaciones de cuello controladas', 'Neck CARs', {
    zones: ['neck'], dose: '3r', lvl: 1, met: 'stretch', pict: 'stretchStand', spr: 10,
    cue: 'Slow, full circles; keep the shoulders down and never force the end range.',
    cueEs: 'Haz círculos lentos y completos; mantén los hombros abajo y no fuerces el final del recorrido.',
  }),
  m('chinTucks', 'Retracción de barbilla', 'Chin tucks', {
    zones: ['neck'], dose: '10r', lvl: 1, met: 'stretch', pict: 'stretchStand', spr: 4,
    cue: 'Slide the head straight back, make a double chin, hold 2 s.',
    cueEs: 'Desliza la cabeza recta hacia atrás, haz doble papada y mantén 2 s.',
  }),
  m('shoulderCars', 'Rotaciones de hombro controladas', 'Shoulder CARs', {
    zones: ['shoulders'], dose: '3r', side: true, lvl: 1, met: 'stretch', pict: 'stretchStand', spr: 10,
    cue: 'Straight arm, draw the biggest slow circle you can without twisting the trunk.',
    cueEs: 'Con el brazo recto, dibuja el círculo más grande y lento que puedas sin girar el tronco.',
  }),
  m('wallAngels', 'Ángeles en la pared', 'Wall angels', {
    zones: ['shoulders', 'thoracic'], dose: '8r', lvl: 2, hints: 'wall', met: 'stretch', pict: 'stretchStand', spr: 4,
    cue: 'Back, head and arms on the wall; slide up only as far as contact holds.',
    cueEs: 'Espalda, cabeza y brazos contra la pared; sube solo hasta donde mantengas el contacto.',
  }),
  m('doorwayChestStretch', 'Estiramiento de pecho en el marco', 'Doorway chest stretch', {
    zones: ['shoulders'], dose: '30s', side: true, lvl: 1, hints: 'wall', met: 'stretch', pict: 'stretchStand',
    cue: 'Forearm on the frame at shoulder height, step through until a gentle stretch.',
    cueEs: 'Apoya el antebrazo en el marco a la altura del hombro y da un paso hasta notar un estiramiento suave.',
  }),
  m('seatedThoracicRotation', 'Rotación torácica sentado', 'Seated thoracic rotation', {
    zones: ['thoracic'], dose: '6r', side: true, lvl: 1, hints: 'chair', met: 'stretch', pict: 'seated', spr: 4,
    cue: 'Arms crossed, hips still, turn from the mid-back and breathe out at the end.',
    cueEs: 'Con los brazos cruzados y las caderas quietas, gira desde la espalda media y suelta el aire al final.',
  }),
  m('openBook', 'Libro abierto', 'Open book', {
    zones: ['thoracic'], dose: '6r', side: true, lvl: 1, floor: true, met: 'stretch', pict: 'stretchFloor', spr: 5,
    cue: 'Lie on your side, knees bent; open the top arm and follow it with your eyes.',
    cueEs: 'Túmbate de lado con las rodillas dobladas; abre el brazo de arriba y síguelo con la mirada.',
  }),
  m('catCow', 'Gato-vaca', 'Cat-cow', {
    zones: ['spine'], dose: '8r', lvl: 1, floor: true, met: 'stretch', pict: 'stretchFloor', spr: 4,
    cue: 'Move one segment at a time: round as you breathe out, arch as you breathe in.',
    cueEs: 'Mueve un segmento cada vez: redondea al soltar el aire y arquea al tomarlo.',
  }),
  m('standingCatCow', 'Gato-vaca de pie', 'Standing cat-cow', {
    zones: ['spine', 'thoracic'], dose: '8r', lvl: 1, met: 'stretch', pict: 'stretchStand', spr: 4,
    cue: 'Hands on thighs, knees soft; round and arch the whole back slowly.',
    cueEs: 'Manos en los muslos y rodillas flexibles; redondea y arquea toda la espalda despacio.',
  }),
  m('worldsGreatestStretch', 'El mejor estiramiento del mundo', "World's greatest stretch", {
    zones: ['hips', 'thoracic', 'hamstrings'], dose: '3r', side: true, lvl: 2, floor: true, met: 'stretch', pict: 'lunge', spr: 8,
    cue: 'Long lunge, elbow toward the front instep, then rotate that arm to the ceiling.',
    cueEs: 'Zancada larga, lleva el codo hacia el empeine delantero y gira ese brazo hacia el techo.',
  }),
  m('hip9090', 'Cambios 90/90', '90/90 hip switches', {
    zones: ['hips'], dose: '6r', side: true, lvl: 2, floor: true, met: 'stretch', pict: 'stretchFloor', spr: 4,
    cue: 'Sit tall, swing both knees side to side; hands behind you if needed.',
    cueEs: 'Siéntate erguido y balancea las dos rodillas de un lado a otro; apoya las manos detrás si lo necesitas.',
  }),
  m('halfKneelingHipFlexor', 'Estiramiento de flexor de cadera en rodilla', 'Half-kneeling hip flexor stretch', {
    zones: ['hips'], dose: '30s', side: true, lvl: 1, floor: true, met: 'stretch', pict: 'lunge',
    cue: 'Squeeze the back glute and tuck the pelvis; feel it at the front of the hip.',
    cueEs: 'Aprieta el glúteo de atrás y mete la pelvis; notarás el estiramiento en la parte delantera de la cadera.',
  }),
  m('standingHipCars', 'Rotaciones de cadera de pie', 'Standing hip CARs', {
    zones: ['hips'], dose: '3r', side: true, lvl: 2, hints: 'wall', met: 'stretch', pict: 'stretchStand', spr: 10,
    cue: 'Hold a wall, lift the knee and draw a slow, wide circle with it.',
    cueEs: 'Apóyate en una pared, sube la rodilla y dibuja con ella un círculo lento y amplio.',
  }),
  m('deepSquatHold', 'Sentadilla profunda mantenida', 'Deep squat hold', {
    zones: ['hips', 'ankles'], dose: '30s', lvl: 2, hints: 'chair', met: 'stretch', pict: 'squat',
    cue: 'Heels down, chest up, elbows nudging the knees out; hold a desk if needed.',
    cueEs: 'Talones en el suelo, pecho alto y codos empujando las rodillas hacia fuera; agárrate a una mesa si lo necesitas.',
  }),
  m('heelUpHamstringStretch', 'Estiramiento de isquios con talón elevado', 'Heel-up hamstring stretch', {
    zones: ['hamstrings'], dose: '30s', side: true, lvl: 1, hints: 'chair', met: 'stretch', pict: 'hinge',
    cue: 'Heel on a low step or chair rung; hinge at the hips with a long back.',
    cueEs: 'Talón sobre un escalón bajo o el travesaño de una silla; inclínate desde la cadera con la espalda larga.',
  }),
  m('inchworm', 'Gusano', 'Inchworm', {
    zones: ['hamstrings', 'shoulders'], tags: ['calories'], dose: '5r', lvl: 2, floor: true, met: 'lightCal', pict: 'plank', spr: 6,
    cue: 'Walk the hands out to a plank and back with legs as straight as is comfortable.',
    cueEs: 'Camina con las manos hasta una plancha y vuelve, con las piernas tan rectas como te resulte cómodo.',
  }),
  m('kneeToWall', 'Rodilla a la pared', 'Knee-to-wall ankle rocks', {
    zones: ['ankles'], dose: '10r', side: true, lvl: 1, hints: 'wall', met: 'stretch', pict: 'lunge',
    cue: 'Heel stays down; drive the knee toward the wall over the middle toes.',
    cueEs: 'El talón se queda en el suelo; lleva la rodilla hacia la pared por encima de los dedos del medio.',
  }),
  m('wristCircles', 'Círculos de muñeca', 'Wrist circles', {
    zones: ['wrists'], dose: '10r', lvl: 1, met: 'stretch', pict: 'stretchStand', spr: 2,
    cue: 'Fingers interlaced, roll the wrists slowly both ways.',
    cueEs: 'Con los dedos entrelazados, gira las muñecas despacio en ambos sentidos.',
  }),
  m('wristFlexorStretch', 'Estiramiento de flexores de muñeca', 'Wrist flexor stretch', {
    zones: ['wrists'], dose: '20s', side: true, lvl: 1, met: 'stretch', pict: 'stretchStand',
    cue: 'Arm straight, palm up; gently draw the fingers back with the other hand.',
    cueEs: 'Brazo recto con la palma hacia arriba; tira suavemente de los dedos hacia atrás con la otra mano.',
  }),
  m('childPose', 'Postura del niño', "Child's pose", {
    zones: ['spine', 'shoulders'], dose: '30s', lvl: 1, floor: true, met: 'stretch', pict: 'stretchFloor',
    cue: 'Knees wide, reach the arms forward and breathe into your back.',
    cueEs: 'Rodillas separadas, estira los brazos hacia delante y respira hacia la espalda.',
  }),
  m('lateralLungeShift', 'Desplazamiento lateral en zancada', 'Lateral lunge shifts', {
    pattern: 'lunge', zones: ['hips'], tags: ['strength'], dose: '5r', side: true, lvl: 2, met: 'moderateCal', pict: 'lunge', spr: 5,
    cue: 'Wide stance, shift onto one bent knee, other leg straight, heels down.',
    cueEs: 'Piernas bien abiertas, desplázate sobre una rodilla flexionada con la otra pierna recta y los talones abajo.',
  }),
  m('bandPassThrough', 'Pases de hombro con goma', 'Band pass-throughs', {
    zones: ['shoulders'], dose: '8r', needs: ['band'], lvl: 2, met: 'stretch', pict: 'pullApart', spr: 4,
    cue: 'Wide grip, straight arms over the head and behind; widen the grip if it pinches.',
    cueEs: 'Agarre ancho y brazos rectos por encima de la cabeza hacia atrás; abre más el agarre si molesta.',
  }),
  m('bandPullApart', 'Aperturas con goma', 'Band pull-aparts', {
    pattern: 'pull', zones: ['shoulders'], tags: ['strength'], dose: '15r', needs: ['band'], lvl: 1, met: 'resistance', pict: 'pullApart', spr: 2,
    cue: 'Arms at shoulder height, pull the band to the chest, squeeze the shoulder blades.',
    cueEs: 'Brazos a la altura de los hombros, abre la goma hasta el pecho y junta los omóplatos.',
  }),
  m('bandLyingHamstringStretch', 'Estiramiento de isquios con goma', 'Band lying hamstring stretch', {
    zones: ['hamstrings'], dose: '30s', side: true, needs: ['band'], lvl: 1, floor: true, met: 'stretch', pict: 'stretchFloor',
    cue: 'Band around the foot, lift the straight leg until a stretch; the other leg stays long.',
    cueEs: 'Pasa la goma por el pie y sube la pierna recta hasta notar el estiramiento; la otra pierna queda estirada.',
  }),
  m('kettlebellHalo', 'Halo con kettlebell', 'Kettlebell halo', {
    zones: ['shoulders', 'thoracic'], dose: '5r', side: true, needs: ['kettlebell'], lvl: 2, hints: 'load', met: 'stretch', pict: 'press', spr: 5,
    cue: 'Hold the bell by the horns and circle it close around the head, ribs down.',
    cueEs: 'Sujeta la pesa por las asas y rodéate la cabeza con ella pegada al cuerpo, con las costillas abajo.',
  }),
  m('gobletSquatPry', 'Sentadilla goblet con apertura', 'Goblet squat pry', {
    zones: ['hips', 'ankles'], dose: '30s', needs: ['kettlebell', 'dumbbells'], lvl: 2, hints: 'load', met: 'stretch', pict: 'squat',
    cue: 'Sit deep holding the weight at the chest; gently push the knees out with the elbows.',
    cueEs: 'Baja profundo con el peso en el pecho y empuja suavemente las rodillas hacia fuera con los codos.',
  }),
  m('ballThoracicExtension', 'Extensión torácica sobre fitball', 'Ball thoracic extension', {
    zones: ['thoracic'], dose: '30s', needs: ['yogaBall'], lvl: 1, met: 'stretch', pict: 'ballSit',
    cue: 'Lie back over the ball, hands behind the head, let the upper back open.',
    cueEs: 'Túmbate hacia atrás sobre el balón con las manos tras la cabeza y deja que se abra la espalda alta.',
  }),
  m('ballHipCircles', 'Círculos de cadera sobre fitball', 'Ball hip circles', {
    zones: ['hips', 'spine'], dose: '8r', side: true, needs: ['yogaBall'], lvl: 1, met: 'stretch', pict: 'ballSit', spr: 4,
    cue: 'Sit on the ball, feet planted; draw circles with the hips.',
    cueEs: 'Siéntate en el balón con los pies firmes y dibuja círculos con la cadera.',
  }),
  m('ballPrayerStretch', 'Estiramiento en oración con fitball', 'Ball prayer stretch', {
    zones: ['shoulders', 'spine'], dose: '30s', needs: ['yogaBall'], lvl: 1, floor: true, met: 'stretch', pict: 'stretchFloor',
    cue: 'Kneel, hands on the ball, roll it forward and sink the chest toward the floor.',
    cueEs: 'De rodillas con las manos sobre el balón, hazlo rodar hacia delante y hunde el pecho hacia el suelo.',
  }),
];
