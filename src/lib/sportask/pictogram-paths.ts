import type { PictogramId } from './catalog/pictograms';

/**
 * The pictograms (PLAN section 9.3): a stick figure per movement family on a 64px grid, two key poses each (`a`, `b`), drawn as
 * strokes (never fills) so a skin can colour, outline and glow them. One body for all of them: the same segment lengths, a round
 * head, a spine and four limbs, built by forward kinematics from joint angles (or a two-bone solver where a hand or a foot is
 * planted), so every figure keeps the same proportions. Most are seen from the side, facing right; `pullApart`, `jump`, `rope` and
 * `stretchStand` are seen from the front, where the movement is. The floor is y = 61 and a standing figure's ankles are on y = 58.5.
 *
 * Each pose is `main` (the body and the equipment, drawn at full strength) and `soft` (the far arm and leg of a side view and the
 * floor, drawn dimmer so the near limbs read first). `tempo` is the seconds one A -> B -> A cycle takes. The component alternates
 * the poses with CSS and shows only A under reduced motion. Strokes and joins use no fills, so the skin owns the look completely.
 */

export interface PoseDraw {
  main: string[];
  soft: string[];
}
export interface Pictogram {
  tempo: number;
  a: PoseDraw;
  b: PoseDraw;
}

type Pt = readonly [number, number];

// ---------------------------------------------------------------- the body

const HEAD_R = 4;
const NECK = 3;
const TORSO = 16;
const UPPER = 8.5;
const FORE = 8;
const THIGH = 12;
const SHIN = 12;
const FOOT = 4;
const ANKLE_Y = 58.5;
const FLOOR_Y = 61;

const rad = (deg: number): number => (deg * Math.PI) / 180;
/** Angles are in degrees from straight down, turning towards the facing side: 0 down, 90 forward (right), 180 up, -90 back. */
const dir = (deg: number): Pt => [Math.sin(rad(deg)), Math.cos(rad(deg))];
const along = (p: Pt, deg: number, len: number): Pt => {
  const d = dir(deg);
  return [p[0] + d[0] * len, p[1] + d[1] * len];
};
const mix = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** A limb is two angles (upper segment, lower segment) or a planted end point solved with two bones; `bend` picks the knee/elbow side. */
interface Limb {
  fk?: readonly [number, number];
  ik?: Pt;
  bend?: 1 | -1;
  /** Drawn at full strength instead of dimmed (a far limb that carries the pose). */
  solid?: boolean;
}

function solve(root: Pt, limb: Limb, l1: number, l2: number): [Pt, Pt] {
  if (limb.fk) {
    const mid = along(root, limb.fk[0], l1);
    return [mid, along(mid, limb.fk[1], l2)];
  }
  const target = limb.ik ?? root;
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const ux = dx / (Math.hypot(dx, dy) || 1);
  const uy = dy / (Math.hypot(dx, dy) || 1);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const side = limb.bend ?? 1;
  const mid: Pt = [root[0] + ux * a - uy * h * side, root[1] + uy * a + ux * h * side];
  return [mid, [root[0] + ux * d, root[1] + uy * d]];
}

/** Drawing primitives, kept as points until the whole pictogram is centred, then written out as path data. */
type Shape = { line: Pt[] } | { curve: [Pt, Pt, Pt, Pt] } | { circle: Pt; r: number };
interface Draft {
  main: Shape[];
  soft: Shape[];
}

const line = (...pts: Pt[]): Shape => ({ line: pts });
const circle = (c: Pt, r: number): Shape => ({ circle: c, r });
/** A short bar centred on `p` (a dumbbell, a band grip) at an angle (90 = horizontal). */
const bar = (p: Pt, deg: number, len: number): Shape => line(along(p, deg, -len / 2), along(p, deg, len / 2));
const floor = (x0 = 4, x1 = 60): Shape => line([x0, FLOOR_Y], [x1, FLOOR_Y]);

interface Side {
  /** Where the hip is, or (instead) where an ankle is: the leg angles then place the hip. */
  hip?: Pt;
  ankle?: Pt;
  /** The ankle given is the far leg's (the one that carries the weight when the near leg is lifted). */
  anchorFar?: boolean;
  torso: number;
  /** Extra angle of the head and neck over the torso. */
  tilt?: number;
  /** A bulge of the spine (positive bends it away from the facing side, up for a figure on all fours). */
  spine?: number;
  arm: Limb;
  armF?: Limb;
  leg: Limb;
  legF?: Limb;
  /** Angles of the near and far foot, or null for none (default: pointing forward). */
  foot?: number | null;
  footF?: number | null;
  gear?: (j: Joints) => Shape[];
  noFloor?: boolean;
}
interface Joints {
  hip: Pt;
  sho: Pt;
  head: Pt;
  knee: Pt;
  ankle: Pt;
  kneeF: Pt;
  ankleF: Pt;
  elbow: Pt;
  hand: Pt;
  elbowF: Pt;
  handF: Pt;
}

function side(s: Side): Draft {
  const leg = s.leg;
  let hip = s.hip;
  if (!hip) {
    const a = s.ankle ?? [32, ANKLE_Y];
    const ankleAtOrigin = solve([0, 0], s.anchorFar ? (s.legF ?? leg) : leg, THIGH, SHIN)[1];
    hip = [a[0] - ankleAtOrigin[0], a[1] - ankleAtOrigin[1]];
  }
  const sho = along(hip, s.torso, TORSO);
  const head = along(sho, s.torso + (s.tilt ?? 0), NECK + HEAD_R);
  const neck = along(sho, s.torso + (s.tilt ?? 0), NECK);
  const [knee, ankle] = solve(hip, leg, THIGH, SHIN);
  const legF = s.legF ?? leg;
  const [kneeF, ankleF] = solve(hip, legF, THIGH, SHIN);
  const [elbow, hand] = solve(sho, s.arm, UPPER, FORE);
  const armF = s.armF ?? s.arm;
  const [elbowF, handF] = solve(sho, armF, UPPER, FORE);
  const j: Joints = { hip, sho, head, knee, ankle, kneeF, ankleF, elbow, hand, elbowF, handF };

  const main: Shape[] = [];
  const soft: Shape[] = [];
  main.push(circle(head, HEAD_R));
  if (s.spine) {
    const chord = [sho[0] - hip[0], sho[1] - hip[1]];
    const nx = chord[1] / TORSO;
    const ny = -chord[0] / TORSO;
    const bulge = s.spine * 1.33;
    main.push({
      curve: [hip, [mix(hip, sho, 1 / 3)[0] + nx * bulge, mix(hip, sho, 1 / 3)[1] + ny * bulge], [mix(hip, sho, 2 / 3)[0] + nx * bulge, mix(hip, sho, 2 / 3)[1] + ny * bulge], sho],
    });
    main.push(line(sho, neck));
  } else {
    main.push(line(hip, sho, neck));
  }
  const foot = s.foot === undefined ? 90 : s.foot;
  const footF = s.footF === undefined ? foot : s.footF;
  main.push(line(hip, knee, ankle, ...(foot === null ? [] : [along(ankle, foot, FOOT)])));
  main.push(line(sho, elbow, hand));
  if (s.legF) (s.legF.solid ? main : soft).push(line(hip, kneeF, ankleF, ...(footF === null ? [] : [along(ankleF, footF, FOOT)])));
  if (s.armF) (s.armF.solid ? main : soft).push(line(sho, elbowF, handF));
  if (s.gear) main.push(...s.gear(j));
  if (!s.noFloor) soft.push(floor());
  return { main, soft };
}

interface Front {
  /** Lean of the whole upper body (positive leans to the viewer's right), for a side bend. */
  lean?: number;
  /** Half the angle between the legs. */
  spread?: number;
  /** How high the feet are off the floor. */
  lift?: number;
  armR: readonly [number, number];
  armL: readonly [number, number];
  legR?: readonly [number, number];
  legL?: readonly [number, number];
  gear?: (j: FrontJoints) => Shape[];
  noFloor?: boolean;
}
interface FrontJoints {
  hip: Pt;
  shoR: Pt;
  shoL: Pt;
  handR: Pt;
  handL: Pt;
  head: Pt;
}

const SHOULDER_HALF = 3;

function front(f: Front): Draft {
  const spread = f.spread ?? 0;
  const legR = f.legR ?? [spread, spread];
  const legL = f.legL ?? [-spread, -spread];
  const hipHeight = Math.cos(rad(Math.max(Math.abs(legR[0]), Math.abs(legL[0])))) * (THIGH + SHIN);
  const hip: Pt = [32, ANKLE_Y - (f.lift ?? 0) - hipHeight];
  const torso = 180 + (f.lean ?? 0);
  const sho = along(hip, torso, TORSO);
  const perp = dir(torso + 90);
  const shoR: Pt = [sho[0] + perp[0] * SHOULDER_HALF * -1, sho[1] + perp[1] * SHOULDER_HALF * -1];
  const shoL: Pt = [sho[0] + perp[0] * SHOULDER_HALF, sho[1] + perp[1] * SHOULDER_HALF];
  // dir(torso + 90) points towards the viewer's left when the torso is up, so R (to the right) is the negative side.
  const neck = along(sho, torso, NECK);
  const head = along(sho, torso, NECK + HEAD_R);
  const [elbowR, handR] = solve(shoR, { fk: f.armR }, UPPER, FORE);
  const [elbowL, handL] = solve(shoL, { fk: f.armL }, UPPER, FORE);
  const [kneeR, ankleR] = solve(hip, { fk: legR }, THIGH, SHIN);
  const [kneeL, ankleL] = solve(hip, { fk: legL }, THIGH, SHIN);
  const main: Shape[] = [
    circle(head, HEAD_R),
    line(hip, sho, neck),
    line(shoL, shoR),
    line(shoR, elbowR, handR),
    line(shoL, elbowL, handL),
    line(hip, kneeR, ankleR),
    line(hip, kneeL, ankleL),
  ];
  if (f.gear) main.push(...f.gear({ hip, shoR, shoL, handR, handL, head }));
  return { main, soft: f.noFloor ? [] : [floor()] };
}

// ---------------------------------------------------------------- output

const n = (v: number): string => String(Math.round(v * 10) / 10);

function pointsOf(shape: Shape): Pt[] {
  if ('line' in shape) return shape.line;
  if ('curve' in shape) return shape.curve;
  return [
    [shape.circle[0] - shape.r, shape.circle[1] - shape.r],
    [shape.circle[0] + shape.r, shape.circle[1] + shape.r],
  ];
}

function write(shape: Shape, dx: number): string {
  if ('line' in shape) return 'M' + shape.line.map(([x, y]) => `${n(x + dx)} ${n(y)}`).join('L');
  if ('curve' in shape) {
    const [p0, p1, p2, p3] = shape.curve;
    return `M${n(p0[0] + dx)} ${n(p0[1])}C${n(p1[0] + dx)} ${n(p1[1])} ${n(p2[0] + dx)} ${n(p2[1])} ${n(p3[0] + dx)} ${n(p3[1])}`;
  }
  const [x, y] = shape.circle;
  const r = shape.r;
  return `M${n(x - r + dx)} ${n(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

/** Centres the two poses together (the same shift for both, so nothing jumps sideways) and writes the path data. */
function pictogram(tempo: number, a: Draft, b: Draft): Pictogram {
  let min = Infinity;
  let max = -Infinity;
  for (const d of [a, b]) {
    for (const s of d.main) {
      for (const [x] of pointsOf(s)) {
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
  }
  const dx = 32 - (min + max) / 2;
  const out = (d: Draft): PoseDraw => ({ main: d.main.map((s) => write(s, dx)), soft: d.soft.map((s) => write(s, dx)) });
  return { tempo, a: out(a), b: out(b) };
}

// ---------------------------------------------------------------- the 17

/** A relaxed stance: the legs a little apart, the arms a little off the body, so a standing figure never reads as a pole. */
const standing = (extra: Partial<Side> = {}): Side => ({
  ankle: [32, ANKLE_Y],
  torso: 180,
  arm: { fk: [18, 8] },
  armF: { fk: [-10, -4] },
  leg: { fk: [0, 0] },
  legF: { fk: [-13, -13] },
  ...extra,
});

/** Body line of a figure on its toes at angle `alpha` over the floor (push-up family): legs and torso are one straight line. */
const plankBody = (alpha: number, extra: Partial<Side>): Side => ({
  ankle: [9, ANKLE_Y - 4],
  torso: 90 + alpha,
  tilt: -(alpha - 8),
  leg: { fk: [alpha - 90, alpha - 90] },
  foot: 0,
  arm: { ik: [0, 0] },
  ...extra,
});

const plankShoulder = (alpha: number): Pt => [9 + (THIGH + SHIN + TORSO) * Math.cos(rad(alpha)), ANKLE_Y - 4 - (THIGH + SHIN + TORSO) * Math.sin(rad(alpha))];

/** The stability ball under the figure: a circle with two seams (a meridian each way) so it reads as a ball and not a wheel. */
const ball = (): Shape[] => [circle([24, 51], 9.5), { curve: [[24, 41.5], [17, 46], [17, 56], [24, 60.5]] }, { curve: [[24, 41.5], [31, 46], [31, 56], [24, 60.5]] }];

export const PICTOGRAMS: Record<PictogramId, Pictogram> = {
  // Air squat: arms forward as a counterweight; the hips travel back and down.
  squat: pictogram(
    2.4,
    side(standing({ arm: { fk: [90, 90] }, armF: undefined })),
    side({ ankle: [32, ANKLE_Y], torso: 138, tilt: 38, arm: { fk: [88, 88] }, leg: { fk: [74, -16] } }),
  ),

  // Split squat / lunge: the back knee drops towards the floor, the front shin stays upright.
  lunge: pictogram(
    2.4,
    side(standing({ ankle: [30, ANKLE_Y] })),
    side({
      ankle: [42, ANKLE_Y],
      torso: 176,
      arm: { fk: [16, 8] },
      armF: { fk: [-10, -4] },
      leg: { fk: [90, 2] },
      legF: { fk: [-38, -92], solid: true },
      footF: null,
    }),
  ),

  // Hip hinge: the torso folds over the hips, the shins stay almost vertical, the arms hang.
  hinge: pictogram(
    2.4,
    side(standing({ arm: { fk: [12, 4] }, armF: { fk: [-6, -2] } })),
    side({ ankle: [32, ANKLE_Y], torso: 112, tilt: 36, arm: { fk: [4, 2] }, leg: { fk: [22, -6] } }),
  ),

  // Glute bridge, lying on the back: the hips lift into one line from shoulders to knees.
  bridge: pictogram(
    2.8,
    side({
      hip: [38, 55],
      torso: -90,
      tilt: 0,
      leg: { fk: [140, 40] },
      arm: { fk: [96, 90] },
      noFloor: false,
    }),
    side({
      hip: [38, 43],
      torso: -64,
      tilt: -26,
      leg: { fk: [116, 28] },
      arm: { fk: [96, 90] },
    }),
  ),

  // Push-up: toes and hands on the floor, the body one straight line that goes down and up.
  pushup: pictogram(
    2,
    side(plankBody(22, { arm: { ik: [plankShoulder(22)[0] + 1, 57.5], bend: 1 } })),
    side(plankBody(7, { arm: { ik: [plankShoulder(7)[0] + 1, 57.5], bend: 1 } })),
  ),

  // Forearm plank: a held line; the far leg lifts to show it is alive.
  plank: pictogram(
    3,
    side(plankBody(11, { arm: { fk: [0, 90] }, tilt: -2 })),
    side(plankBody(11, { arm: { fk: [0, 90] }, tilt: -2, legF: { fk: [-95, -95], solid: true } })),
  ),

  // Side plank seen from the front of the body: the body is the diagonal, one arm holds it up, the other reaches to the ceiling.
  sidePlank: pictogram(
    3,
    side(plankBody(26, { arm: { fk: [2, 0] }, armF: { fk: [180, 180], solid: true }, tilt: -14 })),
    side(plankBody(26, { arm: { fk: [2, 0] }, armF: { fk: [180, 180], solid: true }, legF: { fk: [-106, -106], solid: true }, tilt: -14 })),
  ),

  // Bent-over row: the torso stays folded, the elbows travel back past the ribs.
  row: pictogram(
    1.8,
    side({ ankle: [28, ANKLE_Y], torso: 118, tilt: 34, leg: { fk: [20, -6] }, arm: { fk: [3, 0] }, gear: (j) => [bar(j.hand, 90, 7)] }),
    side({ ankle: [28, ANKLE_Y], torso: 118, tilt: 34, leg: { fk: [20, -6] }, arm: { fk: [-112, -14] }, gear: (j) => [bar(j.hand, 90, 7)] }),
  ),

  // Overhead press: from the shoulders to straight overhead.
  press: pictogram(
    2,
    side(standing({ arm: { fk: [26, 166] }, armF: undefined, gear: (j) => [bar(j.hand, 90, 8)] })),
    side(standing({ arm: { fk: [166, 172] }, armF: undefined, gear: (j) => [bar(j.hand, 90, 8)] })),
  ),

  // Band pull-apart, front view: hands together at the chest, then pulled out to the sides with the band taut.
  pullApart: pictogram(
    2,
    front({
      armR: [72, -112],
      armL: [-72, 112],
      spread: 5,
      gear: (j) => [line([j.handL[0], j.handL[1] + 1], [32, j.handL[1] + 4], [j.handR[0], j.handR[1] + 1])],
    }),
    front({
      armR: [90, 90],
      armL: [-90, -90],
      spread: 5,
      gear: (j) => [bar(j.handR, 180, 6), bar(j.handL, 180, 6)],
    }),
  ),

  // Jumping jack, front view: feet together and arms down, then a star in the air.
  jump: pictogram(
    1,
    front({ armR: [24, 12], armL: [-24, -12], spread: 6 }),
    front({ armR: [152, 162], armL: [-152, -162], spread: 22, lift: 3 }),
  ),

  // March / high knees: the knee comes up to hip height, the opposite arm drives forward.
  march: pictogram(
    1.2,
    side(
      standing({
        anchorFar: true,
        leg: { fk: [92, -4] },
        legF: { fk: [0, 0], solid: true },
        arm: { fk: [-34, -12] },
        armF: { fk: [40, 150], solid: true },
      }),
    ),
    side(
      standing({
        leg: { fk: [0, 0] },
        legF: { fk: [92, -4], solid: true },
        arm: { fk: [40, 150] },
        armF: { fk: [-34, -12], solid: true },
      }),
    ),
  ),

  // Jump rope, front view: the rope passes over the head, then under the feet while the body is in the air.
  rope: pictogram(
    0.7,
    front({
      armR: [14, 62],
      armL: [-14, -62],
      spread: 2,
      gear: (j) => [{ curve: [j.handL, [j.handL[0] - 3, -6], [j.handR[0] + 3, -6], j.handR] }],
    }),
    front({
      armR: [14, 62],
      armL: [-14, -62],
      spread: 2,
      lift: 5,
      gear: (j) => [{ curve: [j.handL, [j.handL[0] - 3, 72], [j.handR[0] + 3, 72], j.handR] }],
    }),
  ),

  // Sitting on a stability ball: upright with the arms forward, then one leg straight out for balance.
  ballSit: pictogram(
    2.4,
    side({
      hip: [29, 40.5],
      torso: 180,
      arm: { fk: [86, 90] },
      leg: { ik: [43.5, ANKLE_Y], bend: -1 },
      gear: () => ball(),
    }),
    side({
      hip: [29, 40.5],
      torso: 178,
      arm: { fk: [86, 90] },
      leg: { fk: [90, 90], solid: true },
      legF: { ik: [43.5, ANKLE_Y], bend: -1, solid: true },
      gear: () => ball(),
    }),
  ),

  // Seated on a chair: hands on the knees, then a long reach overhead.
  seated: pictogram(
    3,
    side({
      hip: [26, 45],
      torso: 180,
      arm: { ik: [38, 43], bend: 1 },
      leg: { fk: [90, 3] },
      gear: () => [line([19, 47.5], [38, 47.5]), line([19, 47.5], [19, 24]), line([22, 47.5], [22, ANKLE_Y]), line([36, 47.5], [36, ANKLE_Y])],
    }),
    side({
      hip: [26, 45],
      torso: 178,
      tilt: -6,
      arm: { fk: [166, 174] },
      leg: { fk: [90, 3] },
      gear: () => [line([19, 47.5], [38, 47.5]), line([19, 47.5], [19, 24]), line([22, 47.5], [22, ANKLE_Y]), line([36, 47.5], [36, ANKLE_Y])],
    }),
  ),

  // Standing mobility, front view: arms hanging, then a side bend with the other arm arcing over the head.
  stretchStand: pictogram(
    3.2,
    front({ armR: [20, 10], armL: [-20, -10], spread: 5 }),
    front({ lean: 14, armR: [186, 238], armL: [-16, -12], spread: 5 }),
  ),

  // Floor mobility on all fours (cat-cow): the spine hollows with the head up, then arches with the head down.
  stretchFloor: pictogram(
    3.2,
    side({
      hip: [22, 46.5],
      torso: 98,
      tilt: -48,
      spine: -6,
      arm: { fk: [0, 0] },
      leg: { fk: [0, -90], solid: true },
      foot: null,
    }),
    side({
      hip: [22, 46.5],
      torso: 98,
      tilt: 52,
      spine: 6.5,
      arm: { fk: [0, 0] },
      leg: { fk: [0, -90], solid: true },
      foot: null,
    }),
  ),
};
