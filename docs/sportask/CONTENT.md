# Sportask content: equipment, exercises, programs, templates

The data the implementing agent transcribes into `src/lib/sportask/` (see [`PLAN.md`](PLAN.md) for the types and the
engine).

Conventions:
- Ids are permanent (PLAN §3.1).
- Every exercise needs `en` and `es` names (both given here) and 1-3 cues. One English cue is given per exercise. Write
  the Spanish cue from it (plain, imperative, tú form), and you may add a second cue of your own if it is a standard
  form cue.
- **Every block shows "Si algo duele, para" / "If anything hurts, stop"**, so cues never repeat it.

Columns: **Dose** = the default at level 1 (`r` reps, `s` seconds). **Side** = the work is split left/right (for
circles: per direction). **Needs** = `needsOneOf` (empty = bodyweight). **Lvl** = level 1-5. **Imp** = impact (`–`
none, `L` low, `H` high). **Fl** = needs the floor. **Ex** = extra hints (`wall`, `chair` = a stable chair or desk,
`space`, `load` = loadable). **MET** = the class from §6. **Pict** = pictogram id (PLAN §9.3).

---

## 1. Equipment (`equipment.ts`)

| id | ES | EN | icon | details |
| --- | --- | --- | --- | --- |
| `band` | Gomas elásticas | Resistance bands | `band` (new ui-icon) | `bandStrengths` (light / medium / heavy) |
| `kettlebell` | Kettlebell | Kettlebell | `kettlebell` (new) | `weights` (kg) |
| `dumbbells` | Mancuernas | Dumbbells | `dumbbell` | `weights` (kg, per dumbbell) |
| `jumpRope` | Comba | Jump rope | `rope` (new) | — |
| `yogaBall` | Balón de yoga (fitball) | Yoga ball (Swiss ball) | `ball` (new) | — |

Band exercises in v1 need **no anchor**: they stand on the band, or wrap it behind the back. Door-anchor exercises can
come later, as a band `details` option.

---

## 2. Mobility exercises (`catalog/mobility.ts`)

All have pattern `mobility`, tag `mobility` (plus the extra tags listed), and impact none, with MET class `stretch`
unless noted.

| id | ES | EN | Zones | Dose | Side | Needs | Lvl | Fl | Ex | Pict | Cue (EN) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `neckCars` | Rotaciones de cuello controladas | Neck CARs | neck | 3 r | | | 1 | | | stretchStand | Slow, full circles; keep the shoulders down and never force the end range. |
| `chinTucks` | Retracción de barbilla | Chin tucks | neck | 10 r | | | 1 | | | stretchStand | Slide the head straight back, make a double chin, hold 2 s. |
| `shoulderCars` | Rotaciones de hombro controladas | Shoulder CARs | shoulders | 3 r | ✓ | | 1 | | | stretchStand | Straight arm, draw the biggest slow circle you can without twisting the trunk. |
| `wallAngels` | Ángeles en la pared | Wall angels | shoulders, thoracic | 8 r | | | 2 | | wall | stretchStand | Back, head and arms on the wall; slide up only as far as contact holds. |
| `doorwayChestStretch` | Estiramiento de pecho en el marco | Doorway chest stretch | shoulders | 30 s | ✓ | | 1 | | wall | stretchStand | Forearm on the frame at shoulder height, step through until a gentle stretch. |
| `seatedThoracicRotation` | Rotación torácica sentado | Seated thoracic rotation | thoracic | 6 r | ✓ | | 1 | | chair | seated | Arms crossed, hips still, turn from the mid-back and breathe out at the end. |
| `openBook` | Libro abierto | Open book | thoracic | 6 r | ✓ | | 1 | ✓ | | stretchFloor | Lie on your side, knees bent; open the top arm and follow it with your eyes. |
| `catCow` | Gato-vaca | Cat-cow | spine | 8 r | | | 1 | ✓ | | stretchFloor | Move one segment at a time: round as you breathe out, arch as you breathe in. |
| `standingCatCow` | Gato-vaca de pie | Standing cat-cow | spine, thoracic | 8 r | | | 1 | | | stretchStand | Hands on thighs, knees soft; round and arch the whole back slowly. |
| `worldsGreatestStretch` | El mejor estiramiento del mundo | World's greatest stretch | hips, thoracic, hamstrings | 3 r | ✓ | | 2 | ✓ | | lunge | Long lunge, elbow toward the front instep, then rotate that arm to the ceiling. |
| `hip9090` | Cambios 90/90 | 90/90 hip switches | hips | 6 r | ✓ | | 2 | ✓ | | stretchFloor | Sit tall, swing both knees side to side; hands behind you if needed. |
| `halfKneelingHipFlexor` | Estiramiento de flexor de cadera en rodilla | Half-kneeling hip flexor stretch | hips | 30 s | ✓ | | 1 | ✓ | | lunge | Squeeze the back glute and tuck the pelvis; feel it at the front of the hip. |
| `standingHipCars` | Rotaciones de cadera de pie | Standing hip CARs | hips | 3 r | ✓ | | 2 | | wall | stretchStand | Hold a wall, lift the knee and draw a slow, wide circle with it. |
| `deepSquatHold` | Sentadilla profunda mantenida | Deep squat hold | hips, ankles | 30 s | | | 2 | | chair | squat | Heels down, chest up, elbows nudging the knees out; hold a desk if needed. |
| `heelUpHamstringStretch` | Estiramiento de isquios con talón elevado | Heel-up hamstring stretch | hamstrings | 30 s | ✓ | | 1 | | chair | hinge | Heel on a low step or chair rung; hinge at the hips with a long back. |
| `inchworm` (+`calories`, MET `lightCal`) | Gusano | Inchworm | hamstrings, shoulders | 5 r | | | 2 | ✓ | | plank | Walk the hands out to a plank and back with legs as straight as is comfortable. |
| `kneeToWall` | Rodilla a la pared | Knee-to-wall ankle rocks | ankles | 10 r | ✓ | | 1 | | wall | lunge | Heel stays down; drive the knee toward the wall over the middle toes. |
| `wristCircles` | Círculos de muñeca | Wrist circles | wrists | 10 r | | | 1 | | | stretchStand | Fingers interlaced, roll the wrists slowly both ways. |
| `wristFlexorStretch` | Estiramiento de flexores de muñeca | Wrist flexor stretch | wrists | 20 s | ✓ | | 1 | | | stretchStand | Arm straight, palm up; gently draw the fingers back with the other hand. |
| `childPose` | Postura del niño | Child's pose | spine, shoulders | 30 s | | | 1 | ✓ | | stretchFloor | Knees wide, reach the arms forward and breathe into your back. |
| `lateralLungeShift` (+`strength`, pattern `lunge`, MET `moderateCal`) | Desplazamiento lateral en zancada | Lateral lunge shifts | hips | 5 r | ✓ | | 2 | | | lunge | Wide stance, shift onto one bent knee, other leg straight, heels down. |
| `bandPassThrough` | Pases de hombro con goma | Band pass-throughs | shoulders | 8 r | | band | 2 | | | pullApart | Wide grip, straight arms over the head and behind; widen the grip if it pinches. |
| `bandPullApart` (+`strength`, pattern `pull`, MET `resistance`) | Aperturas con goma | Band pull-aparts | shoulders | 15 r | | band | 1 | | | pullApart | Arms at shoulder height, pull the band to the chest, squeeze the shoulder blades. |
| `bandLyingHamstringStretch` | Estiramiento de isquios con goma | Band lying hamstring stretch | hamstrings | 30 s | ✓ | band | 1 | ✓ | | stretchFloor | Band around the foot, lift the straight leg until a stretch; the other leg stays long. |
| `kettlebellHalo` | Halo con kettlebell | Kettlebell halo | shoulders, thoracic | 5 r | ✓ | kettlebell | 2 | | load | press | Hold the bell by the horns and circle it close around the head, ribs down. |
| `gobletSquatPry` | Sentadilla goblet con apertura | Goblet squat pry | hips, ankles | 30 s | | kettlebell, dumbbells | 2 | | load | squat | Sit deep holding the weight at the chest; gently push the knees out with the elbows. |
| `ballThoracicExtension` | Extensión torácica sobre fitball | Ball thoracic extension | thoracic | 30 s | | yogaBall | 1 | | | ballSit | Lie back over the ball, hands behind the head, let the upper back open. |
| `ballHipCircles` | Círculos de cadera sobre fitball | Ball hip circles | hips, spine | 8 r | ✓ | yogaBall | 1 | | | ballSit | Sit on the ball, feet planted; draw circles with the hips. |
| `ballPrayerStretch` | Estiramiento en oración con fitball | Ball prayer stretch | shoulders, spine | 30 s | | yogaBall | 1 | ✓ | | stretchFloor | Kneel, hands on the ball, roll it forward and sink the chest toward the floor. |

---

## 3. Strength exercises (`catalog/strength.ts`)

Tag `strength` (plus the extras listed), with MET class `moderateCal` for bodyweight, `lightCal` for level 1, and
`resistance`/`resistanceVig` for loaded moves.

| id | Pattern | ES | EN | Dose | Side | Needs | Lvl | Imp | Fl | Ex | MET | Pict | Cue (EN) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `wallPushUp` | push | Flexiones en la pared | Wall push-ups | 10 r | | | 1 | – | | wall | lightCal | pushup | Body in one straight line; bring the chest to the wall and push away. |
| `deskPushUp` | push | Flexiones inclinadas en la mesa | Desk incline push-ups | 10 r | | | 2 | – | | chair | moderateCal | pushup | Hands on a stable desk edge, lower the chest to it, elbows at 45°. |
| `kneePushUp` | push | Flexiones de rodillas | Knee push-ups | 8 r | | | 2 | – | ✓ | | moderateCal | pushup | Knees down, hips in line with the shoulders; chest to fist height. |
| `pushUp` (+`calories`) | push | Flexiones | Push-ups | 8 r | | | 3 | – | ✓ | | moderateCal | pushup | Hands under the shoulders, body rigid, chest to fist height. |
| `feetElevatedPushUp` | push | Flexiones con pies elevados | Feet-elevated push-ups | 6 r | | | 4 | – | ✓ | chair | moderateCal | pushup | Feet on a chair, brace the belly so the hips do not sag. |
| `archerPushUp` | push | Flexiones arquero | Archer push-ups | 4 r | ✓ | | 5 | – | ✓ | | moderateCal | pushup | Wide hands; lower toward one hand while the other arm stays straight. |
| `ballPushUp` | push | Flexiones con manos en fitball | Ball push-ups | 6 r | | yogaBall | 4 | – | ✓ | | moderateCal | pushup | Hands on the ball, squeeze it to keep it still; slow on the way down. |
| `dumbbellFloorPress` | push | Press de suelo con mancuernas | Dumbbell floor press | 10 r | | dumbbells | 2 | – | ✓ | load | resistance | press | Lie down, elbows touch the floor softly, press straight up. |
| `bandChestPress` | push | Press de pecho con goma | Band chest press | 12 r | | band | 2 | – | | | resistance | press | Band behind the back, press forward to straight arms, slow return. |
| `chairDip` | push | Fondos en silla | Chair dips | 8 r | | | 3 | – | | chair | moderateCal | press | Stable chair against a wall; lower until the elbows reach 90°, shoulders down. |
| `bandOverheadPress` | pushVertical | Press sobre la cabeza con goma | Band overhead press | 12 r | | band | 2 | – | | | resistance | press | Stand on the band, press overhead without arching the lower back. |
| `dumbbellShoulderPress` | pushVertical | Press de hombro con mancuernas | Dumbbell shoulder press | 10 r | | dumbbells | 3 | – | | load | resistance | press | Ribs down, press up and slightly back so the weights finish over the ears. |
| `kettlebellPress` | pushVertical | Press con kettlebell | Kettlebell press | 8 r | ✓ | kettlebell | 3 | – | | load | resistance | press | Bell in the rack, squeeze the glutes, press until the arm is straight. |
| `pikePushUp` | pushVertical | Flexiones en pica | Pike push-ups | 6 r | | | 4 | – | ✓ | | moderateCal | pushup | Hips high, lower the head between the hands, push back up. |
| `proneYTW` | pull | Y-T-W boca abajo | Prone Y-T-W | 6 r | | | 1 | – | ✓ | | lightCal | row | Face down, thumbs up; lift the arms into Y, T, then W, squeezing the shoulder blades. |
| `reverseSnowAngel` | pull | Ángel de nieve invertido | Reverse snow angels | 8 r | | | 2 | – | ✓ | | lightCal | row | Face down, arms just off the floor; sweep them from the hips to overhead and back. |
| `bandBentOverRow` | pull | Remo inclinado con goma | Band bent-over row | 12 r | | band | 2 | – | | | resistance | row | Stand on the band, hinge forward, pull the elbows to the ribs. |
| `dumbbellRow` | pull | Remo a una mano | One-arm row | 10 r | ✓ | dumbbells, kettlebell | 2 | – | | chair, load | resistance | row | Free hand on a desk, flat back; pull the weight toward the hip. |
| `kettlebellHighPull` | pull | Tirón alto con kettlebell | Kettlebell high pull | 10 r | | kettlebell | 3 | – | | load | resistanceVig | row | Drive with the hips, pull the elbows high and wide, control it down. |
| `renegadeRow` | pull | Remo renegado | Renegade row | 6 r | ✓ | dumbbells | 4 | – | ✓ | load | resistanceVig | row | High plank on the dumbbells, feet wide; row one side without twisting the hips. |
| `sitToStand` | squat | Levantarse de la silla | Sit-to-stand | 10 r | | | 1 | – | | chair | lightCal | squat | Arms crossed, stand up without the hands, sit down slowly. |
| `ballWallSquat` | squat | Sentadilla con fitball en la pared | Ball wall squat | 12 r | | yogaBall | 1 | – | | wall | lightCal | squat | Ball between your back and the wall, roll down to a comfortable depth. |
| `airSquat` (+`calories`) | squat | Sentadillas | Air squats | 15 r | | | 2 | – | | | moderateCal | squat | Feet shoulder-width, sit back and down, knees follow the toes. |
| `bandSquat` | squat | Sentadilla con goma | Band squat | 12 r | | band | 2 | – | | | resistance | squat | Stand on the band, hands at the shoulders, squat and drive up through the heels. |
| `wallSit` (metric `seconds`) | squat | Sentadilla isométrica en la pared | Wall sit | 30 s | | | 2 | – | | wall | moderateCal | squat | Back flat on the wall, thighs as close to level as is comfortable. |
| `pauseSquat` | squat | Sentadilla con pausa | Pause squats | 8 r | | | 3 | – | | | moderateCal | squat | Hold 3 s at the bottom, stay tight, then stand up. |
| `gobletSquat` | squat | Sentadilla goblet | Goblet squat | 10 r | | kettlebell, dumbbells | 3 | – | | load | resistanceVig | squat | Weight at the chest, elbows inside the knees, chest proud. |
| `jumpSquat` (+`calories`) | squat | Sentadilla con salto | Jump squats | 10 r | | | 4 | H | | | vigorousCal | jump | Land softly on the whole foot and sink straight into the next squat. |
| `singleLegSitToStand` | squat | Levantarse de la silla a una pierna | Single-leg sit-to-stand | 5 r | ✓ | | 5 | – | | chair | moderateCal | squat | One foot forward off the floor; stand up and sit down with control. |
| `staticSplitSquat` | lunge | Sentadilla dividida | Split squat | 8 r | ✓ | | 2 | – | | | moderateCal | lunge | Long stance, the back knee drops straight down, the front heel stays down. |
| `reverseLunge` (+`calories`) | lunge | Zancada atrás | Reverse lunge | 8 r | ✓ | | 2 | – | | | moderateCal | lunge | Step back, both knees to 90°, push through the front heel to return. |
| `dumbbellReverseLunge` | lunge | Zancada atrás con peso | Weighted reverse lunge | 8 r | ✓ | dumbbells, kettlebell | 3 | – | | load | resistanceVig | lunge | Weights at your sides, tall chest, controlled step back. |
| `bulgarianSplitSquat` | lunge | Sentadilla búlgara | Bulgarian split squat | 8 r | ✓ | | 4 | – | | chair | moderateCal | lunge | Back foot on a chair, lower straight down, front knee over the foot. |
| `standingGoodMorning` | hinge | Buenos días sin peso | Bodyweight good morning | 12 r | | | 1 | – | | | lightCal | hinge | Hands behind the head, soft knees; push the hips back with a flat back. |
| `gluteBridge` | hinge | Puente de glúteo | Glute bridge | 12 r | | | 1 | – | ✓ | | lightCal | bridge | Feet flat, push through the heels, squeeze the glutes at the top. |
| `bandGoodMorning` | hinge | Buenos días con goma | Band good morning | 12 r | | band | 2 | – | | | resistance | hinge | Band under the feet and behind the neck; hinge and stand by squeezing the glutes. |
| `kettlebellDeadlift` | hinge | Peso muerto con kettlebell | Kettlebell deadlift | 10 r | | kettlebell, dumbbells | 2 | – | | load | resistance | hinge | Weight between the feet, hips back, flat back, stand tall. |
| `singleLegGluteBridge` | hinge | Puente de glúteo a una pierna | Single-leg glute bridge | 8 r | ✓ | | 3 | – | ✓ | | moderateCal | bridge | One leg up, hips level, drive through the planted heel. |
| `dumbbellRdl` | hinge | Peso muerto rumano con peso | Romanian deadlift | 10 r | | dumbbells, kettlebell | 3 | – | | load | resistanceVig | hinge | Weights slide down the thighs, hips back, stop when the back would round. |
| `ballHamstringCurl` | hinge | Curl femoral con fitball | Ball hamstring curl | 10 r | | yogaBall | 3 | – | ✓ | | moderateCal | bridge | Heels on the ball, hips up, curl the ball in and roll it out slowly. |
| `singleLegRdl` | hinge | Peso muerto a una pierna | Single-leg RDL | 8 r | ✓ | | 3 | – | | | moderateCal | hinge | Hinge on one leg, the other leg reaches back, hips square; touch a wall for balance. |
| `kettlebellSwing` (+`calories`) | hinge | Swing con kettlebell | Kettlebell swing | 15 r | | kettlebell | 3 | – | | space, load | vigorousCal | hinge | Hike the bell back, snap the hips forward; the arms are just ropes. |
| `deskPlank` (metric `seconds`) | core | Plancha inclinada en la mesa | Desk incline plank | 30 s | | | 1 | – | | chair | lightCal | plank | Forearms on the desk, body in one line, belly braced. |
| `deadBug` | core | Bicho muerto | Dead bug | 8 r | ✓ | | 1 | – | ✓ | | lightCal | stretchFloor | Lower back pressed down; extend the opposite arm and leg slowly. |
| `birdDog` | core | Perro de caza | Bird dog | 8 r | ✓ | | 1 | – | ✓ | | lightCal | plank | On all fours, reach the opposite arm and leg long without the hips rotating. |
| `plank` (metric `seconds`) | core | Plancha | Plank | 30 s | | | 2 | – | ✓ | | moderateCal | plank | Elbows under the shoulders, glutes squeezed, do not let the hips sag. |
| `suitcaseHold` (metric `seconds`) | core | Sujeción tipo maleta | Suitcase hold | 30 s | ✓ | kettlebell, dumbbells | 2 | – | | load | resistance | stretchStand | Stand tall with one weight at your side; do not lean toward it. |
| `sidePlank` (metric `seconds`) | core | Plancha lateral | Side plank | 20 s | ✓ | | 3 | – | ✓ | | moderateCal | sidePlank | Elbow under the shoulder, hips high, body in one line. |
| `ballRollout` | core | Rollout con fitball | Ball rollout | 8 r | | yogaBall | 3 | – | ✓ | | moderateCal | plank | Kneel, forearms on the ball; roll out only as far as the back stays flat. |
| `hollowHold` (metric `seconds`) | core | Posición hueca | Hollow hold | 20 s | | | 4 | – | ✓ | | moderateCal | stretchFloor | Lower back glued down, arms and legs long; bend the knees to make it easier. |
| `ballStirThePot` | core | Remover la olla en fitball | Ball stir-the-pot | 5 r | ✓ | yogaBall | 5 | – | ✓ | | moderateCal | plank | Plank on the ball; draw small circles with the forearms. |

### 3.1 Ladders (`catalog/ladders.ts`)

`rungs[i]` are alternatives of similar difficulty. The progression's "next rung" is **the next rung that has an
available alternative** (unavailable rungs are skipped). With none above, the dose keeps growing up to 1.5 × the range
max.

| id | pattern | rungs |
| --- | --- | --- |
| `push` | push | `[wallPushUp]`, `[deskPushUp, bandChestPress]`, `[kneePushUp, dumbbellFloorPress]`, `[pushUp, chairDip]`, `[feetElevatedPushUp, ballPushUp]`, `[archerPushUp]` |
| `pushVertical` | pushVertical | `[bandOverheadPress]`, `[dumbbellShoulderPress, kettlebellPress]`, `[pikePushUp]` |
| `pull` | pull | `[proneYTW, bandPullApart]`, `[reverseSnowAngel, bandBentOverRow]`, `[dumbbellRow]`, `[kettlebellHighPull]`, `[renegadeRow]` |
| `squat` | squat | `[sitToStand, ballWallSquat]`, `[airSquat, bandSquat, wallSit]`, `[pauseSquat, gobletSquat]`, `[jumpSquat, singleLegSitToStand]` |
| `lunge` | lunge | `[staticSplitSquat, lateralLungeShift]`, `[reverseLunge]`, `[dumbbellReverseLunge]`, `[bulgarianSplitSquat]` |
| `hinge` | hinge | `[standingGoodMorning, gluteBridge]`, `[bandGoodMorning, kettlebellDeadlift]`, `[singleLegGluteBridge, dumbbellRdl, ballHamstringCurl]`, `[singleLegRdl, kettlebellSwing]` |
| `core` | core | `[deskPlank, deadBug, birdDog]`, `[plank, suitcaseHold]`, `[sidePlank, ballRollout]`, `[hollowHold]`, `[ballStirThePot]` |

Bodyweight pulling tops out at `reverseSnowAngel`. When the user owns nothing for pulling and has reached that rung,
the Strength progress tab shows a hint: "Para progresar en tirones, añade gomas o una mancuerna en Configuración".

---

## 4. Calorie exercises (`catalog/calories.ts`)

Pattern `cardio` and tag `calories`. Also tagged `calories` from other sections: `inchworm`, `pushUp`, `airSquat`,
`jumpSquat`, `reverseLunge`, `kettlebellSwing`.

| id | ES | EN | Dose | Needs | Lvl | Imp | Fl | Ex | MET | Pict | Cue (EN) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `marchInPlace` | Marcha en el sitio | Marching in place | 40 s | | 1 | L | | | walkInPlace | march | Brisk pace, swing the arms, stay tall. |
| `stepJack` | Jumping jack sin salto | Step jacks | 30 s | | 1 | L | | | lightCardio | march | Step one foot out as the arms go up; alternate sides quickly. |
| `highKneeMarch` | Marcha con rodillas altas | High-knee march | 30 s | | 1 | L | | | lightCardio | march | Knees to hip height, opposite arm drives, no bouncing. |
| `shadowBoxing` | Boxeo de sombra | Shadow boxing | 30 s | | 1 | L | | | boxing | press | Light on the feet, fast straight punches, guard back up each time. |
| `ballSquatReach` | Sentadilla con fitball arriba | Ball squat and reach | 12 r | yogaBall | 1 | – | | | moderateCal | squat | Hold the ball at the chest, squat, then press it overhead as you stand. |
| `skaterStep` | Paso de patinador | Skater steps | 30 s | | 2 | L | | | lightCardio | lunge | Step wide and back behind, swing the arms like a skater. |
| `stepBackBurpee` | Burpee sin salto | Step-back burpee | 6 r | | 2 | L | ✓ | | vigorousCal | plank | Hands down, step back to a plank, step in and stand tall. |
| `slowMountainClimber` | Escalador lento | Slow mountain climbers | 30 s | | 2 | L | ✓ | | moderateCal | plank | High plank, bring one knee in at a time, hips level. |
| `bandThruster` | Thruster con goma | Band thruster | 12 r | band | 2 | – | | | resistanceVig | squat | Stand on the band, squat, then press overhead as you rise. |
| `jumpingJack` | Jumping jacks | Jumping jacks | 30 s | | 2 | H | | | vigorousCal | jump | Land softly on the balls of the feet, arms all the way up. |
| `jumpRopeBasic` | Comba, salto básico | Jump rope, basic bounce | 30 s | jumpRope | 2 | H | | space | ropeSlow | rope | Small jumps, wrists turn the rope, elbows close to the body. |
| `highKnees` | Rodillas altas corriendo | High knees | 30 s | | 3 | H | | | vigorousCal | march | Run in place, knees to hip height, quick light feet. |
| `skaterHop` | Salto de patinador | Skater hops | 30 s | | 3 | H | | | vigorousCal | jump | Leap sideways onto one foot, land soft, pause, bound back. |
| `mountainClimber` | Escaladores | Mountain climbers | 30 s | | 3 | L | ✓ | | vigorousCal | plank | Hands under the shoulders, drive the knees in fast, hips down. |
| `jumpRopeAlternate` | Comba, paso alterno | Jump rope, alternate step | 30 s | jumpRope | 3 | H | | space | ropeModerate | rope | Jog over the rope one foot at a time, stay on the balls of the feet. |
| `dumbbellThruster` | Thruster con peso | Weighted thruster | 10 r | dumbbells, kettlebell | 3 | – | | load | resistanceVig | squat | Weight at the shoulders, squat, then drive it overhead in one motion. |
| `burpee` | Burpees | Burpees | 6 r | | 4 | H | ✓ | | vigorousCal | jump | Chest to the floor is optional; jump with arms up and land softly. |

---

## 5. Assessments (`catalog/assessments.ts`)

`AssessmentDef` takes **`exerciseIds: string[]` (the first available one is used)** or `ladderId` + optional
`maxRung` (the user's current rung of that ladder, capped). Results are charted per assessment, and the chart notes
when the exercise used changed (e.g. a plank test done as `deskPlank` with `noFloor`).

| id | Goal | ES | EN | Uses | Metric | Side | Step s | Better | Instructions (EN) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mobDeepSquat` | mobility | Sentadilla profunda: tiempo | Deep squat hold | `deepSquatHold` | seconds | | 120 | higher | Heels down, hold as long as you are comfortable (max 2 min). |
| `mobKneeToWall` | mobility | Rodilla a la pared: distancia | Knee-to-wall distance | `kneeToWall` | cm | ✓ | 60 | higher | Move the foot back until the knee only just touches the wall with the heel down; measure toe-to-wall. |
| `mobToeTouch` | mobility | Tocar los pies: distancia | Toe touch distance | `heelUpHamstringStretch` (pictogram) | cm | | 30 | lower | Legs straight, reach down; measure fingertip to floor (0 = touching). |
| `mobBackScratch` | mobility | Manos a la espalda: distancia | Back scratch gap | `shoulderCars` (pictogram) | cm | ✓ | 60 | lower | One hand over the shoulder, the other up the back; measure the gap (negative if the fingers overlap). The side is the hand on top. |
| `strMaxPushUps` | strength | Flexiones máximas | Max push-ups | ladder `push` | reps | | 60 | higher | As many good reps as you can in 60 s; stop when the form breaks. |
| `strPlank` | strength | Plancha máxima | Max plank | `plank`, `deskPlank` | seconds | | 180 | higher | Hold good form as long as you can (max 3 min). |
| `strSquats60` | strength | Sentadillas en 60 s | Squats in 60 s | ladder `squat`, `maxRung: 1` | reps | | 60 | higher | Full, controlled reps; count them. |
| `calCardio60` | calories | Test de 60 s | 60-second cardio test | `jumpingJack`, `stepJack` | reps | | 60 | higher | Count full reps in 60 s, then rate the effort (RPE). |

---

## 6. MET classes (`catalog/index.ts` `MET`)

**Must be verified before shipping.** Check each value against the *2024 Adult Compendium of Physical Activities*
(Herrmann et al., J Sport Health Sci 2024; pacompendium.com) and write the activity code next to each value in the code.
If a value cannot be confirmed, use the *lower* plausible one: an overestimate is worse than an underestimate.

| class | value (approx.) | used for |
| --- | --- | --- |
| `stretch` | 2.3 | mobility, stretching |
| `walkInPlace` | 3.5 | marching in place |
| `lightCal` | 2.8 | light calisthenics, level-1 moves |
| `lightCardio` | 4.0 | step jacks, skater steps, high-knee march |
| `moderateCal` | 3.8 | bodyweight strength (push-ups, squats, planks) |
| `resistance` | 3.5 | band and light-load resistance work |
| `resistanceVig` | 5.0 | loaded squats/hinges/rows, thrusters |
| `boxing` | 5.5 | shadow boxing |
| `vigorousCal` | 8.0 | jumping jacks, burpees, jump squats, mountain climbers, swings |
| `ropeSlow` | 8.8 | jump rope, slow |
| `ropeModerate` | 11.8 | jump rope, moderate |

Net kcal = (MET − 1) × kg × work hours. Rest time is not counted. The UI always says "≈" and "estimación".

---

## 7. Programs

Parameter types (each goal's `P`):

```ts
interface MobilityParams { warmup?: boolean; holdSeconds: number; repsScale: number; allowLoaded: boolean; maxLevel: Level }
interface StrengthParams {
  warmup?: boolean;
  repRange: { min: number; max: number };
  holdRange: { min: number; max: number };      // for seconds-metric exercises (planks, wall sit)
  restSeconds: number;                           // between sets inside a block
  setsPerPatternPerDay: number;                  // target
  capPerPatternPerDay: number;                   // hard cap
  tempoFactor: number;                           // multiplies secondsPerRep (slow eccentrics)
  patterns: MovementPattern[];                   // rotation order
  rir: number;                                   // shown as "Para a falta de N repeticiones"
}
interface CaloriesParams {
  warmup?: boolean;
  work: number; rest: number;                    // interval seconds
  allowHighImpact: boolean;
  maxLevel: Level;
  longFormat: 'circuit' | 'tabata' | 'emom';     // for blocks ≥ 240 s
  weeklyActiveMinutes: number;                   // the target line of `activeMinutes`
}
```

### 7.1 Mobility: `deskReset` ("Reinicio de escritorio" / "Desk reset")

- `weeks: 4`, `daysPerWeek: 7`, `assessmentWeeks: [1]`, assessments `mobDeepSquat`, `mobKneeToWall`, `mobToeTouch`,
  `mobBackScratch`. Week 1 of every cycle retests, so cycle 2's week 1 is cycle 1's final test.
- Day focus by day index in the ISO week (Mon = 0): `upper` (neck, shoulders, thoracic, wrists) on days 0 and 3;
  `lower` (hips, hamstrings, ankles) on days 1 and 4; `spine` (spine, thoracic, hips) on days 2, 5 and 6.
- Slots: a hold exercise gets `holdSeconds` (per side when `perSide`); a reps exercise gets `round(dose.reps × repsScale)`.
  Slot length by PLAN §8.2. In blocks ≥ 180 s, one slot per zone of the focus, in order of "least covered this week".
- Metrics: `heatmap`, `zonesCovered`, `assessment:mobDeepSquat`, `assessment:mobKneeToWall`, `assessment:mobToeTouch`,
  `assessment:mobBackScratch`.

| Weeks | holdSeconds | repsScale | allowLoaded | maxLevel | Notes for the preview |
| --- | --- | --- | --- | --- | --- |
| 1-2 | 25 | 1.0 | no | 2 | "Explora el rango sin forzar." |
| 3-4 | 40 | 1.3 | yes | 3 | "Mantén más tiempo y respira lento al final del rango." |

### 7.2 Strength: `microStrength` ("Fuerza en micro-bloques" / "Micro-strength")

- `weeks: 6`, `daysPerWeek: 5`, `restDayGoalId: 'mobility'`, `assessmentWeeks: [1, 4]`, assessments `strMaxPushUps`,
  `strPlank`, `strSquats60`.
- Pattern rotation `push, squat, pull, hinge, core, lunge`, plus `pushVertical` after `push` from week 3 when an owned
  item allows it.
- Per-slot structure: one set = one slot. Blocks ≥ 90 s use 2 slots of **different** patterns (a superset, so the rest
  is useful). Blocks ≥ 180 s use the next 3-4 patterns. Blocks ≥ 420 s use 2 rounds of that circuit.
- Every strength block shows "Para a falta de {rir} repeticiones" (except tests).
- Metrics: `setsPerPattern`, `ladderLevel`, `assessment:strMaxPushUps`, `assessment:strPlank`, `assessment:strSquats60`,
  `adherence`.

| Weeks | repRange | holdRange | restSeconds | sets/pattern/day | cap | tempoFactor | rir | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1-2 | 8-12 | 20-40 | 30 | 2 | 4 | 1.0 | 3 | "Técnica primero." |
| 3-4 | 6-10 | 30-50 | 40 | 3 | 5 | 1.0 | 2 | "Sube de variante cuando completes el rango." |
| 5-6 | 6-10 | 40-60 | 40 | 3 | 5 | 1.6 | 1-2 (show 2) | "Baja en 3 segundos, sube con control." |

Warm-up params: rung capped at the current one − 1 (not below 0), dose × 0.7, no tests.

### 7.3 Calories: `burnAndMove` ("Quema y muévete" / "Burn & move")

- `weeks: 6`, `daysPerWeek: 6`, `restDayGoalId: 'mobility'`, `assessmentWeeks: [1, 4]`, assessment `calCardio60`.
- Exercise pick alternates lower body (squat, lunge, skater) / full body (burpee, jacks, climbers, swing, thruster) /
  upper body (shadow boxing, push-ups, band thruster), via the patterns and the pictograms. Never the same exercise twice
  in a row.
- Blocks < 240 s: as many `work + rest` intervals as fit (e.g. 60 s at 20:40 = 1 interval; 120 s at 30:30 = 2).
- Blocks ≥ 240 s use `longFormat`:
  - `circuit`: 3-5 exercises at `work:rest`, then repeat.
  - `tabata`: 8 × 20:10 alternating 2 exercises (4 min) + the rest as walking (`marchInPlace`).
  - `emom`: each minute, a rep target (the exercise's reps dose, or `work` seconds for timed ones), resting for the rest
    of the minute.
- Metrics: `activeMinutes` (target `weeklyActiveMinutes`), `netKcal`, `density`, `assessment:calCardio60`, `adherence`.
- Preview text for the target: "Objetivo semanal: {n} min activos. La OMS recomienda 75-150 min de actividad vigorosa
  (o 150-300 moderada) por semana." (WHO 2020 guidelines on physical activity and sedentary behaviour.)

| Weeks | work:rest | allowHighImpact | maxLevel | longFormat | weeklyActiveMinutes | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1-2 | 20:40 | no | 2 | circuit | 45 | "Ritmo que te permita hablar a frases cortas." |
| 3-4 | 30:30 | yes (if not `lowImpact`) | 3 | circuit | 60 | "Sube la intensidad en el trabajo; camina en el descanso." |
| 5-6 | 40:20 | yes (if not `lowImpact`) | 4 | tabata (≥ 240 s), emom (≥ 600 s) | 75 | "Intenso pero controlado." |

---

## 8. Built-in templates (`templates.ts`)

Ids are prefixed `tpl.`, and every template has `builtin: true`.

| id | ES | EN | format | work/rest | minSeconds | slots |
| --- | --- | --- | --- | --- | --- | --- |
| `tpl.deskReset` | Reinicio de escritorio | Desk reset | sequence | — | 60 | `chinTucks`, `seatedThoracicRotation`, `wristFlexorStretch`, `standingHipCars` |
| `tpl.oneMinutePush` | Un minuto de empuje | One-minute push | sequence | — | 30 | `{ pattern: push, tag: strength }` |
| `tpl.mobilityRandom` | Movilidad al azar | Random mobility | sequence | — | 60 | `{ pattern: mobility, zone: hips }`, `{ pattern: mobility, zone: shoulders }`, `{ pattern: mobility, zone: thoracic }` |
| `tpl.coreFloor` | Core en el suelo | Floor core | sequence | — | 120 | `deadBug`, `plank`, `sidePlank`, `birdDog` |
| `tpl.tabataLegs` | Tabata de piernas | Leg tabata | intervals | 20/10 | 240 | `airSquat`, `reverseLunge`, `{ pattern: cardio, tag: calories }`, `skaterStep` |
| `tpl.lowImpactCardio` | Cardio sin saltos | Low-impact cardio | intervals | 30/30 | 60 | `highKneeMarch`, `stepJack`, `shadowBoxing`, `skaterStep`, `stepBackBurpee` |
| `tpl.fullBodyEmom` | EMOM cuerpo completo | Full-body EMOM | emom | — | 240 | `{ pushUp, 8 r }`, `{ airSquat, 12 r }`, `{ gluteBridge, 12 r }`, `{ slowMountainClimber, 30 s }` |
| `tpl.bands` | Circuito con gomas | Band circuit | sequence | — | 150 | `bandPullApart`, `bandBentOverRow`, `bandChestPress`, `bandSquat`, `bandGoodMorning` |
| `tpl.kettlebell` | Kettlebell exprés | Kettlebell express | intervals | 30/30 | 120 | `kettlebellSwing`, `gobletSquat`, `dumbbellRow`, `kettlebellHalo` |
| `tpl.dumbbells` | Mancuernas exprés | Dumbbell express | sequence | — | 150 | `dumbbellRow`, `gobletSquat`, `dumbbellShoulderPress`, `dumbbellRdl` |
| `tpl.rope` | Comba | Jump rope | intervals | 30/30 | 120 | `jumpRopeBasic`, `shadowBoxing`, `jumpRopeAlternate`, `marchInPlace` |
| `tpl.fitballCore` | Core con fitball | Yoga ball core | sequence | — | 120 | `ballRollout`, `ballHamstringCurl`, `ballHipCircles`, `ballThoracicExtension` |

A template slot whose fixed exercise is not available is replaced by an available exercise of the same pattern (PLAN
§8.5). A template is offered as unavailable only when fewer than half its slots resolve.

---

## 9. Disclaimer (accepted once, `Enrolment.acceptedDisclaimerAt`)

**ES:** Sportask propone ejercicios generales; no es consejo médico ni sustituye a un profesional. Si tienes una lesión,
una enfermedad cardiovascular, estás embarazada o hace tiempo que no haces ejercicio, consulta antes con tu médico.
Calienta, respeta tu ritmo y para si notas dolor, mareo o falta de aire anormal. Las calorías son una estimación
aproximada.

**EN:** Sportask suggests general exercises; it is not medical advice and does not replace a professional. If you have
an injury or a heart condition, are pregnant, or have not exercised in a while, check with your doctor first. Warm up,
go at your own pace, and stop if you feel pain, dizziness or unusual shortness of breath. Calories are a rough
estimate.

Free training shows the same disclaimer the first time if it was never accepted.
