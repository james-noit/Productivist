# Sportask pictograms: review and redraw (0.26)

The request: the figures "are not very well defined (joints, positions, profiles are barely identifiable) and they are confusing
sometimes". This document is the review of the first set (PLAN section 9.3), the principles of the redraw, what was done and what
was left. The code is `src/lib/sportask/pictogram-paths.ts` (the drawings, lazy), `src/app/components/sportask-pictogram/` (the
renderer), `src/lib/sportask/catalog/pictograms.ts` (the ids) and the mapping `pict:` of every exercise in `catalog/*.ts`.

## 1. Review of the first set

Method: every figure was generated from the real paths, both poses, at 160 px (the hero of the break modal is 132 px, the steps
list uses 40 px) in the light and dark themes, and judged by what a person has to read at a glance during a break: which part moves,
where the joints bend, which side faces the viewer, where the floor and the equipment are and which way the movement goes. The
before screenshots are `before-light.png` / `before-dark.html` in the scratchpad `pictograms/` folder (see the report).

### What was wrong in all of them

| # | Fault | Evidence |
| - | ----- | -------- |
| 1 | **One stroke for everything.** Torso, limbs and neck were the same 3-unit line, the far limbs the same line at 50 % opacity. Overlapping limbs merged into a blob (squat B, hinge B, lunge B, row B) and a standing figure read as a pole with a ring on top. | squat A, lunge A, hinge A, press A |
| 2 | **No volume.** The torso was a line and the head a ring, so nothing said front from back, chest from hip, or how thick the body is. | all |
| 3 | **Joints were invisible.** A knee or an elbow was only a kink in a polyline; where the line was nearly straight (most of the poses) the joint did not exist. | squat A, lunge B, march |
| 4 | **Near and far limbs were drawn alike.** Only the far limb was dimmer, and when it was hidden behind the near one it was not drawn at all (`armF` undefined), so you could not tell which leg was forward. | lunge, march |
| 5 | **The head had no facing cue.** A ring does not look anywhere, so the side views were ambiguous (is the figure facing left or right? lying face up or down?). | bridge, plank, stretchFloor |
| 6 | **Floor and equipment were thin hints.** One hairline floor for everything (a mat for floor work was not a thing), a 7-unit bar for a dumbbell, a ring for a ball that read as a wheel, a seated chair of four lines in the same colour as the body, a rope as an ellipse that enclosed the whole figure in both frames. | row, press, ballSit, seated, rope |
| 7 | **A -> B was a hard cut** (`steps(1)`): the figure jumped between two poses with no sense of direction or speed, and a still figure (reduced motion, paused, or the 40 px steps list) showed only pose A, so the movement could not be read at all. | all |
| 8 | **Some poses were wrong or misleading.** Push-up: the hands did not reach the floor (the IK clamped at full arm length, the shoulder was too high), plank: the far leg lifting in B turned a hold into a leg-raise exercise, side plank: legs and arms crossed in a tangle, stretchFloor: tiny, the spine arched at the wrong place, bridge: shoulders floating, arms along the torso hidden. | pushup, plank, sidePlank, stretchFloor, bridge |
| 9 | **Too thin at the sizes in use.** 3 units are 1.9 px at 40 px; limbs of 8 to 12 units with 3-unit strokes leave almost no readable gap. Figures were also small in their box (a plank used 52 x 22 units of 64 x 64). | the steps list |
| 10 | **17 figures for 97 exercises.** One figure served exercises that look nothing alike: `stretchStand` 10 exercises (neck CARs, chin tucks, shoulder CARs, wall angels, doorway chest stretch, standing cat-cow, hip CARs, wrist circles, wrist stretch, suitcase hold), `squat` 13 (goblet, thruster, wall sit, sit-to-stand, deep hold, ball wall squat), `plank` 9 (inchworm, bird dog, mountain climber, ball rollout, burpee step-back, desk plank), `stretchFloor` 8 (dead bug, hollow hold, child pose, band hamstring), `press` 8 (chair dip, shadow boxing, floor press, band chest press), `pushup` 8 (wall, desk, knee, pike), `lunge` 9, `hinge` 7 (swing, deadlift). | the catalog |

### Per figure (first set)

| Figure | Finding |
| ------ | ------- |
| squat | Pose A is a pole with an arm stub; B is the right idea (hips back and down) but thigh, torso and arm overlap into a zig-zag and the knee cannot be found. |
| lunge | The near leg is the front one but the back leg is dim and has no foot; at A you cannot tell which leg will step. |
| hinge | B is correct (torso folded, shins vertical) but the head ring and the hanging arm sit on the same line as the torso. |
| bridge | The weakest lying figure: a ring, a line, a zig-zag. No mat, arms hidden, shoulders float above the floor in B. |
| pushup | Hands floated above the floor in A (IK reach), the elbow bent the wrong way in B; head ring on the body line. |
| plank | The B pose (leg raised) is a different exercise. |
| sidePlank | The body diagonal, the supporting arm and the leg are all one thickness and cross each other; it reads as a tent. |
| row | The weight is a 7-unit bar; the elbow direction in B is unclear; A and B differ by a few units. |
| press | The bar is tiny, the raised arm crosses the head ring. |
| pullApart | The shoulder line plus thin arms read as a T; the band is the same colour as the body. |
| jump | Acceptable (a star in B) but A is a pole. |
| march | Acceptable; the standing leg and the lifted leg are the same weight, the arms thin. |
| rope | The rope is a tall ellipse around the body in both frames; it never reads as passing under the feet. |
| ballSit | The ball is two concentric circles (a wheel), the extended leg in B is the same as the seat. |
| seated | The chair is four lines in the body colour; the reach in B hides behind the head. |
| stretchStand | The side bend hides the head behind the arm; at A it is a pole. |
| stretchFloor | Tiny (45 x 25 units), the arch is a bump on a line, the head ring has no direction. |

## 2. Principles adopted

1. **One body, drawn as a body.** Keep the forward-kinematics rig (the same segment lengths in every figure and every pose; the
   self-check asserts it) but draw it as a mannequin: a capsule torso, a neck, a filled head with a nose when seen from the side,
   thigh-and-shin and arm-and-hand polylines with a foot and a hand, round joints.
2. **Depth by layering, not by colour.** Back to front: ground and furniture, far limbs (dimmer, a little thinner), torso, near
   leg, head, near arm (it crosses the head when raised), equipment, joint dots. Every part except the ground, the far limbs and
   the dots gets a *halo* (a ring in the surface colour, or cyberpunk's dark ink) so a limb in front of the body or another limb is
   cut out and cannot merge with it.
3. **Joints show.** A dot in the halo colour on the near shoulder, elbow, hip and knee (a "hole" in the limb, a mannequin pin): the
   joint exists even when the limb is straight.
4. **Facing.** The nose is a dot on the head, on the facing side; a face-down figure (prone) and a figure seen from the front have
   their own rules (`prone`, `facing`, and the front-view builder).
5. **The ground is part of the drawing.** A ground line, a thick mat for floor work, and furniture (chair, desk, wall) as pale
   `set` parts in one group (no darker overlaps); equipment (`prop`) in its own colour so it is never mistaken for the body.
6. **Motion is motion.** Interpolate from interpolated *angles*, not from points (the limbs keep their length, planted hands and
   feet stay planted), eased with a hold at each end, played with SMIL on `d`. When a figure is still (reduced motion, paused, or
   the steps list) the other pose appears as a faint dashed ghost behind pose A (only from 80 px up) so the direction is readable.
7. **Fill the box.** Both poses are centred and scaled together (at most 1.4x, the widths with them) until the drawing fills the
   grid, so a figure on all fours is as legible as a standing one. The body proportions never change, only the scale.
8. **Colours from tokens only.** Body `--sport-stroke` (fallback `--color-primary`), equipment `--sport-prop` (fallback the theme's
   `--color-quadrant-schedule`, the blue), halo `--sport-halo` (fallback `--sport-card-bg`, then `--color-surface`), widths scale
   with `--sport-stroke-width`, far limbs and ground with `--sport-soft-opacity`, `--sport-glow-filter` glows the whole figure once.
   The app's own skin sets none of them, so the fallbacks are what the default look is.
9. **One figure per movement.** Where a figure served exercises that do not look alike, add figures (never rename or remove an id).

## 3. What was changed

Ranked by what it fixes for the reader.

1. **A mannequin instead of sticks** (principles 1 to 5): new rig and renderer. *Implemented.*
2. **More figures, mapped per exercise** (principle 9): 17 to 53 pictograms; 49 exercises changed figure (list in section 5), and
   `CATALOG_VERSION` is 2. The 17 old ids are untouched and in place. *Implemented.*
3. **Smooth, eased, direction-aware motion** (principle 6) and the ghost of the other pose for still figures. *Implemented.*
4. **Equipment as equipment** (principle 5): kettlebell (bell and handle), weight plate or dumbbell seen end-on, band with grips
   (taut or slack), stability ball (tinted, with seams), chair, desk, wall, rope. *Implemented.*
5. **Poses corrected**: push-up family computed from the shoulder height so the hands touch the floor, plank a held line that only
   breathes, bridge with the shoulders on the floor and the knees bent by IK, side plank as a diagonal with a straight supporting
   arm, cat-cow with the spine bulging the right way, squat to parallel, hinge, rope over the head then under the feet, jumping jack
   with a lift. *Implemented.*
6. **Fill the box** (principle 7): figures are scaled up to 1.4x. *Implemented.*
7. **The self-check** (section 13 of `scripts/sportask-check.ts`): every id resolves, A, B and the in-between frames have the
   same parts, roles, widths and path commands, every number is finite and inside the grid, every segment keeps its length through
   the whole movement and equals the one body's, the animation's keyTimes rise from 0 to 1, the old ids are still first and in
   place. *Implemented.*

### Not done (deferred)

- **Motion arrows** (curved arrows for rotation: neck circles, shoulder CARs, hip CARs, world's greatest stretch). The ghost covers
  the direction of a straight movement; a circle needs an arrow. *Next.*
- **Per-exercise variants** (a figure per exercise, or equipment per exercise on a shared figure: a band over the feet in the
  band overhead press, a ball in the ball push-up). Today an exercise picks one figure; `renegadeRow` uses `plank`, `ballPushUp` uses
  `pushup`, `archerPushUp` and `feetElevatedPushUp` use `pushup`, `ballSquatReach` and `bandSquat` use `squat`.
- **Exercises still on a figure that is only close**: `openBook` and `hip9090`'s sibling floor rotations (`stretchFloor`),
  `worldsGreatestStretch` and the other lunge variants (`lunge`), `heelUpHamstringStretch`, `singleLegRdl` and the good mornings
  (`hinge`), `kettlebellHalo` and `kettlebellPress` (`press`), `skaterHop` and `skaterStep`.
- **Child's pose B** is the weakest of the new ones (a low blob); a side view of a folded figure needs a different torso shape.
- **Front-view faces** (two eyes or a mouth to tell front from back) and **hands/feet in the front views** beyond a foot stub.
- **The Fitness director preview** can show a figure's A and B side by side with the ghost; it only needs the component's inputs.

## 4. How the code is organised

- `pictogram-paths.ts`: `PICTOGRAMS: Record<PictogramId, Pictogram>`. A `Pictogram` has `tempo`, `a` and `b` (a `PoseDraw`:
  `parts`, plus the first version's `main` and `soft` path lists), `at(t)` (the pose a fraction of the way) and `bones(t)` (the
  segment lengths, for the self-check). `tweenOf(p)` returns the in-between frames for SMIL (`keyTimes` and, per part, the list of
  `d`). A part is `{ r, d, w, f? }`: `r` is `far | torso | limb | head | dot | prop | set`, `w` the width in grid units and `f` 1 =
  filled, 2 = tinted.
- Two builders: `side()` (a Side spec: where the hip or the ankle is, the torso angle, the head tilt, the spine bulge, four limbs
  as angles `fk: [upper, lower, hand?]` or a planted end point `ik` solved with two bones, the foot angles, `gear`) and `front()`
  (the figure seen from the front: lean, spread, lift, tilt, arms and legs as angles). Both are driven the same way: a pair of
  specs (A and B) interpolated field by field (`lerpAny`) and drawn by the builder, so a figure is two small objects.
- Angles: degrees from straight down, turning towards the side the figure faces: 0 down, 90 forward, 180 up, -90 back.
- Gear is a function of the joints returning `{ back, front }` shapes (a ball, a wall and a chair are drawn behind, what the hands
  hold in front), so a prop follows the body through every in-between frame.
- Rules a new figure must keep (the self-check fails otherwise): both poses use the same kind of limb (`fk` or `ik`) for the same
  limb, the same `gear` structure, and the same `foot`/`mat`/`noFloor` choices; a far limb that is `solid` in either pose is solid
  in both (the builder does that for you).
- The component (`app-sportask-pictogram`, inputs `id` and `animate` as before): parts in order, the ground and furniture in one
  group, a halo path before each part that gets one, SMIL `<animate>` on every path while `animate` is on and the user does not
  prefer reduced motion (also read live), the ghost of B as one dashed path while it is not moving.
- To add a figure: add the id at the END of `PICTOGRAM_IDS`, write its two specs in `PICTOGRAMS`, map the exercises (`pict:`) and
  bump `CATALOG_VERSION`; run `npm run check:sportask`.

## 5. Exercises that changed figure

| Exercises | Figure |
| --------- | ------ |
| gobletSquat, gobletSquatPry | `gobletSquat` |
| dumbbellThruster, bandThruster | `thruster` |
| deepSquatHold | `deepSquat` |
| jumpSquat | `jumpSquat` |
| wallSit | `wallSquat` |
| ballWallSquat | `ballWallSquat` |
| sitToStand, singleLegSitToStand | `sitStand` |
| kettlebellSwing | `swing` |
| kettlebellDeadlift, dumbbellRdl | `deadlift` |
| neckCars | `neckTilt` |
| chinTucks | `chinTuck` |
| shoulderCars | `armSweep` |
| wallAngels | `wallAngel` |
| doorwayChestStretch | `doorStretch` |
| standingCatCow | `standingCatCow` |
| wristCircles, wristFlexorStretch | `wristStretch` |
| suitcaseHold | `carry` |
| standingHipCars | `march` |
| birdDog | `birdDog` |
| deadBug | `deadBug` |
| hollowHold | `hollow` |
| childPose, ballPrayerStretch | `childPose` |
| hip9090 | `hip9090` |
| bandLyingHamstringStretch | `lyingHamstring` |
| mountainClimber, slowMountainClimber | `mountainClimber` |
| inchworm | `inchworm` |
| stepBackBurpee, burpee | `burpee` |
| deskPlank, deskPushUp | `deskPushup` |
| ballRollout, ballStirThePot | `ballRollout` |
| kneePushUp | `kneePushup` |
| wallPushUp | `wallPushup` |
| pikePushUp | `pike` |
| chairDip | `dip` |
| dumbbellFloorPress | `floorPress` |
| bandChestPress | `chestPress` |
| shadowBoxing | `punch` |
| proneYTW, reverseSnowAngel | `proneY` |
| renegadeRow | `plank` |

Everything else keeps its figure (the first 17 redrawn). `stretchStand` is no longer used by an exercise, only by the breathing break; it stays (ids are stored).
