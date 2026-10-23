import type { PictogramId } from './catalog/pictograms';

/**
 * The pictograms (docs/sportask/PICTOGRAMS.md, PLAN section 9.3): one figure per movement, two key poses (`a`, `b`) on a 64px grid.
 * One body for all of them (the same segment lengths, a capsule torso, a head with a nose when it is seen from the side, two arms and
 * two legs with hands and feet), built by forward kinematics from joint angles (or a two-bone solver where a hand or a foot is planted),
 * so every figure keeps the same proportions. Most are seen from the side, facing right; the front views are the ones where the movement
 * is sideways (jumping jack, band pull-apart, rope, side bends). The ground is y = 61 and a standing figure's ankles are on y = 59.
 *
 * A pose is a list of PARTS drawn back to front: the ground and furniture (`set`), the far limbs (`far`, dimmer), the torso and neck,
 * the near limbs, the head (filled) with its nose, the equipment (`prop`, in its own colour) and a dot on every near joint (`dot`, in
 * the halo colour, so knees, elbows, hips and shoulders show as joints). The component gives every part a halo, so a limb crossing
 * the body or another limb stays separate. Parts have the same roles, widths and path commands in `a` and `b`, which is what lets the
 * component animate between them (SMIL on `d`) through `tweenOf`, whose in-between frames come from `at(t)`: the pose is regenerated
 * from interpolated angles (not a blend of the points), so the limbs never shrink on the way and the planted hands and feet stay put.
 *
 * `main` and `soft` (what the first version exposed) are still filled in: the strokes of the body and the equipment, and the far limbs
 * plus the ground.
 */

export type PartRole = 'far' | 'torso' | 'limb' | 'head' | 'dot' | 'prop' | 'set';
export interface Part {
  r: PartRole;
  /** Path data (M, L, C and a only). */
  d: string;
  /** Stroke width in grid units (a skin's `--sport-stroke-width` scales it, 3 = 1x). */
  w: number;
  /** 1 = filled with the stroke colour, 2 = a light tint of it (a ball). */
  f?: 1 | 2;
}
export interface PoseDraw {
  main: string[];
  soft: string[];
  parts: Part[];
}
export interface Pictogram {
  /** Seconds one A -> B -> A cycle takes. */
  tempo: number;
  a: PoseDraw;
  b: PoseDraw;
  /** The pose a fraction `t` (0 = A, 1 = B) of the way, from interpolated angles. */
  at(t: number): PoseDraw;
  /** Lengths of the rigid segments in the pose at `t` (the self-check asserts they never change). */
  bones(t: number): number[];
}

type Pt = readonly [number, number];

// ---------------------------------------------------------------- the body

const HEAD_R = 4.4;
const HEAD_REACH = 8.4;
const TORSO = 15;
const TORSO_W = 6.4;
const NECK_W = 2.6;
const UPPER = 8.5;
const FORE = 7.6;
const HAND = 2.6;
const THIGH = 12;
const SHIN = 12;
const FOOT = 4.4;
const LEG_W = 3.6;
const ARM_W = 3;
const ANKLE_Y = 59;
const FLOOR_Y = 61;
const SHOULDER_DROP = 2.4;

const rad = (deg: number): number => (deg * Math.PI) / 180;
/** Angles are in degrees from straight down, turning towards the facing side: 0 down, 90 forward (right), 180 up, -90 back. */
const dir = (deg: number): Pt => [Math.sin(rad(deg)), Math.cos(rad(deg))];
const along = (p: Pt, deg: number, len: number): Pt => {
  const d = dir(deg);
  return [p[0] + d[0] * len, p[1] + d[1] * len];
};
const mix = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const angleOf = (from: Pt, to: Pt): number => (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;
const dist = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** A limb is angles (upper segment, lower segment, then the hand for an arm) or a planted end point solved with two bones. */
interface Limb {
  fk?: readonly number[];
  ik?: Pt;
  /** Which side the knee or elbow points to (IK only). */
  bend?: 1 | -1;
  /** The hand's angle (arms); by default it carries on from the forearm. */
  hand?: number;
  /** Drawn at full strength instead of dimmed (a far limb that carries the pose). */
  solid?: boolean;
}

function solve(root: Pt, limb: Limb, l1: number, l2: number): [Pt, Pt] {
  if (limb.fk) {
    const mid = along(root, limb.fk[0]!, l1);
    return [mid, along(mid, limb.fk[1] ?? limb.fk[0]!, l2)];
  }
  const target = limb.ik ?? root;
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const len = Math.hypot(dx, dy) || 1;
  const d = Math.min(Math.max(len, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
  const ux = dx / len;
  const uy = dy / len;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const sideSign = limb.bend ?? 1;
  const mid: Pt = [root[0] + ux * a - uy * h * sideSign, root[1] + uy * a + ux * h * sideSign];
  return [mid, [root[0] + ux * d, root[1] + uy * d]];
}

// ---------------------------------------------------------------- shapes

type Shape =
  | { k: 'line'; p: Pt[]; r: PartRole; w: number; fixed?: boolean }
  | { k: 'curve'; p: [Pt, Pt, Pt, Pt]; r: PartRole; w: number }
  | { k: 'circle'; c: Pt; rad: number; r: PartRole; w: number; f?: 1 | 2 };
interface Draft {
  shapes: Shape[];
  bones: number[];
}

const line = (r: PartRole, w: number, ...p: Pt[]): Shape => ({ k: 'line', p, r, w });
const curve = (r: PartRole, w: number, p0: Pt, p1: Pt, p2: Pt, p3: Pt): Shape => ({ k: 'curve', p: [p0, p1, p2, p3], r, w });
const circle = (r: PartRole, w: number, c: Pt, rad: number, f?: 1 | 2): Shape => ({ k: 'circle', c, rad, r, w, f });
/** A dot is a zero-length stroke with a round cap. */
const dot = (c: Pt, w = 1.7, r: PartRole = 'dot'): Shape => line(r, w, c, c);
const ground = (mat: boolean): Shape => ({ k: 'line', p: [[mat ? 6 : 8, FLOOR_Y], [mat ? 58 : 56, FLOOR_Y]], r: 'set', w: mat ? 2.8 : 1.6, fixed: true });

// ---- equipment (all of it 'prop' except the furniture, which is 'set')

/** A dumbbell or plate seen end-on, in a hand. */
const weight = (c: Pt, r = 2.8): Shape[] => [circle('prop', 0.8, c, r, 1)];
/** A kettlebell: the bell and a handle that rises towards `up` (180 = straight up). */
const kettlebell = (c: Pt, up = 180): Shape[] => [
  line('prop', 1.9, along(c, up - 38, 3), along(c, up - 20, 6.6), along(c, up + 20, 6.6), along(c, up + 38, 3)),
  circle('prop', 0.8, c, 3.3, 1),
];
/** A resistance band between two grips; `sag` bows it to one side (0 = taut). */
const band = (p: Pt, q: Pt, sag = 0): Shape[] => {
  const nx = -(q[1] - p[1]);
  const ny = q[0] - p[0];
  const k = sag / (Math.hypot(nx, ny) || 1);
  return [
    curve('prop', 1.2, p, [p[0] + (q[0] - p[0]) / 3 + nx * k, p[1] + (q[1] - p[1]) / 3 + ny * k], [p[0] + ((q[0] - p[0]) * 2) / 3 + nx * k, p[1] + ((q[1] - p[1]) * 2) / 3 + ny * k], q),
    dot(p, 2.8, 'prop'),
    dot(q, 2.8, 'prop'),
  ];
};
/** A stability ball: the sphere with two seams, behind the figure. */
const ball = (c: Pt, r = 9.5): Shape[] => [
  circle('prop', 1.4, c, r, 2),
  curve('prop', 0.9, [c[0], c[1] - r], [c[0] - r * 0.7, c[1] - r * 0.45], [c[0] - r * 0.7, c[1] + r * 0.45], [c[0], c[1] + r]),
  curve('prop', 0.9, [c[0], c[1] - r], [c[0] + r * 0.7, c[1] - r * 0.45], [c[0] + r * 0.7, c[1] + r * 0.45], [c[0], c[1] + r]),
];
const wall = (x: number): Shape => line('set', 2.4, [x, 3], [x, FLOOR_Y]);
/** A chair seen from the side: seat, back and two legs. `x0` is the back's side; the seat runs to `x1`. */
const chair = (x0: number, x1: number, seatY: number): Shape[] => [
  line('set', 2, [x0, seatY], [x1, seatY]),
  line('set', 2, [x0, seatY], [x0, seatY - 22]),
  line('set', 2, [x0 + 2, seatY], [x0 + 2, FLOOR_Y]),
  line('set', 2, [x1 - 1.5, seatY], [x1 - 1.5, FLOOR_Y]),
];

// ---------------------------------------------------------------- side view

interface Joints {
  hip: Pt;
  sho: Pt;
  top: Pt;
  head: Pt;
  knee: Pt;
  ankle: Pt;
  toe: Pt;
  kneeF: Pt;
  ankleF: Pt;
  elbow: Pt;
  wrist: Pt;
  tip: Pt;
  elbowF: Pt;
  wristF: Pt;
  tipF: Pt;
}
interface Gear {
  /** Drawn behind the figure (a ball, a wall, a chair). */
  back?: Shape[];
  /** Drawn in front of it (what the hands hold). */
  front?: Shape[];
}

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
  /** Angles of the near and far foot (default: pointing forward); `null` = no foot. */
  foot?: number | null;
  footF?: number | null;
  gear?: (j: Joints) => Gear;
  /** No ground line, or a thick mat instead of it. */
  noFloor?: boolean;
  mat?: boolean;
  /** The figure looks at the viewer, so the head has no nose (a side plank seen from the front). */
  facing?: boolean;
  /** Lying face down: the nose points the other way round. */
  prone?: boolean;
}

/** A Side with every number present, so two of them can be interpolated field by field. */
interface SideN extends Side {
  tilt: number;
  spine: number;
  armF: Limb;
  legF: Limb;
  foot: number;
  footLen: number;
  footF: number;
  footFLen: number;
}

const fillSide = (s: Side): SideN => ({
  ...s,
  tilt: s.tilt ?? 0,
  spine: s.spine ?? 0,
  armF: s.armF ?? s.arm,
  legF: s.legF ?? s.leg,
  foot: s.foot ?? 90,
  footLen: s.foot === null ? 0 : FOOT,
  footF: s.footF === undefined ? (s.foot ?? 90) : (s.footF ?? 90),
  footFLen: (s.footF === undefined ? s.foot : s.footF) === null ? 0 : FOOT,
});

function armPoints(root: Pt, limb: Limb): [Pt, Pt, Pt] {
  const [elbow, wrist] = solve(root, limb, UPPER, FORE);
  const handAngle = limb.hand ?? limb.fk?.[2] ?? angleOf(elbow, wrist);
  return [elbow, wrist, along(wrist, handAngle, HAND)];
}

function side(s: SideN): Draft {
  let hip = s.hip;
  if (!hip) {
    const a = s.ankle ?? [32, ANKLE_Y];
    const ankleAtOrigin = solve([0, 0], s.anchorFar ? s.legF : s.leg, THIGH, SHIN)[1];
    hip = [a[0] - ankleAtOrigin[0], a[1] - ankleAtOrigin[1]];
  }
  const top = along(hip, s.torso, TORSO);
  const sho = along(hip, s.torso, TORSO - SHOULDER_DROP);
  const headDir = s.torso + s.tilt;
  const head = along(top, headDir, HEAD_REACH);
  const [knee, ankle] = solve(hip, s.leg, THIGH, SHIN);
  const [kneeF, ankleF] = solve(hip, s.legF, THIGH, SHIN);
  const [elbow, wrist, tip] = armPoints(sho, s.arm);
  const [elbowF, wristF, tipF] = armPoints(sho, s.armF);
  const toe = along(ankle, s.foot, s.footLen);
  const toeF = along(ankleF, s.footF, s.footFLen);
  const j: Joints = { hip, sho, top, head, knee, ankle, toe, kneeF, ankleF, elbow, wrist, tip, elbowF, wristF, tipF };
  const gear = s.gear?.(j) ?? {};

  const out: Shape[] = [];
  out.push(...(gear.back ?? []));
  if (!s.noFloor) out.push(ground(!!s.mat));
  out.push(line(s.legF.solid ? 'limb' : 'far', LEG_W, hip, kneeF, ankleF, toeF));
  out.push(line(s.armF.solid ? 'limb' : 'far', ARM_W, sho, elbowF, wristF, tipF));
  // The torso is a capsule along a curve (a straight one unless the spine bulges), the neck a thin line.
  const chord = [top[0] - hip[0], top[1] - hip[1]];
  const nx = chord[1] / TORSO;
  const ny = -chord[0] / TORSO;
  const bulge = s.spine * 1.33;
  const c1 = mix(hip, top, 1 / 3);
  const c2 = mix(hip, top, 2 / 3);
  out.push(curve('torso', TORSO_W, hip, [c1[0] + nx * bulge, c1[1] + ny * bulge], [c2[0] + nx * bulge, c2[1] + ny * bulge], top));
  out.push(line('torso', NECK_W, top, head));
  out.push(line('limb', LEG_W, hip, knee, ankle, toe));
  out.push(circle('head', 0.8, head, HEAD_R, 1));
  out.push(s.facing ? dot(head, 0, 'dot') : dot(along(head, headDir + (s.prone ? 90 : -90), HEAD_R + 0.8), 2.6, 'head'));
  out.push(line('limb', ARM_W, sho, elbow, wrist, tip));
  out.push(...(gear.front ?? []));
  out.push(dot(hip), dot(sho), dot(knee), dot(elbow));
  const len = (a: Pt, b: Pt): number => dist(a, b);
  return { shapes: out, bones: [len(hip, knee), len(knee, ankle), len(hip, kneeF), len(kneeF, ankleF), len(sho, elbow), len(elbow, wrist), len(sho, elbowF), len(elbowF, wristF), len(hip, top)] };
}

// ---------------------------------------------------------------- front view

interface Front {
  /** Lean of the whole upper body (positive leans to the viewer's right), for a side bend. */
  lean?: number;
  /** Half the angle between the legs. */
  spread?: number;
  /** How high the feet are off the floor. */
  lift?: number;
  /** Tilt of the head over the neck (a neck circle). */
  tilt?: number;
  armR: readonly number[];
  armL: readonly number[];
  legR?: readonly number[];
  legL?: readonly number[];
  gear?: (j: FrontJoints) => Gear;
  noFloor?: boolean;
}
interface FrontN extends Front {
  lean: number;
  spread: number;
  lift: number;
  tilt: number;
  legR: readonly number[];
  legL: readonly number[];
}
interface FrontJoints {
  hip: Pt;
  shoR: Pt;
  shoL: Pt;
  handR: Pt;
  handL: Pt;
  head: Pt;
  ankleR: Pt;
  ankleL: Pt;
}

const SHOULDER_HALF = 4.4;
const HIP_HALF = 1.7;

const fillFront = (f: Front): FrontN => {
  const spread = f.spread ?? 0;
  return { ...f, lean: f.lean ?? 0, spread, lift: f.lift ?? 0, tilt: f.tilt ?? 0, legR: f.legR ?? [spread, spread], legL: f.legL ?? [-spread, -spread] };
};

function front(f: FrontN): Draft {
  const hipHeight = Math.cos(rad(Math.max(Math.abs(f.legR[0]!), Math.abs(f.legL[0]!)))) * (THIGH + SHIN);
  const hip: Pt = [32, ANKLE_Y - f.lift - hipHeight];
  const torso = 180 + f.lean;
  const top = along(hip, torso, TORSO);
  const sho = along(hip, torso, TORSO - SHOULDER_DROP);
  const perp = dir(torso + 90);
  const shoR: Pt = [sho[0] - perp[0] * SHOULDER_HALF, sho[1] - perp[1] * SHOULDER_HALF];
  const shoL: Pt = [sho[0] + perp[0] * SHOULDER_HALF, sho[1] + perp[1] * SHOULDER_HALF];
  const head = along(top, torso + f.tilt, HEAD_REACH);
  const hipR: Pt = [hip[0] + HIP_HALF, hip[1]];
  const hipL: Pt = [hip[0] - HIP_HALF, hip[1]];
  const [elbowR, wristR, tipR] = armPoints(shoR, { fk: f.armR });
  const [elbowL, wristL, tipL] = armPoints(shoL, { fk: f.armL });
  const [kneeR, ankleR] = solve(hipR, { fk: f.legR }, THIGH, SHIN);
  const [kneeL, ankleL] = solve(hipL, { fk: f.legL }, THIGH, SHIN);
  const gear = f.gear?.({ hip, shoR, shoL, handR: wristR, handL: wristL, head, ankleR, ankleL }) ?? {};
  const out: Shape[] = [];
  out.push(...(gear.back ?? []));
  if (!f.noFloor) out.push(ground(false));
  out.push(curve('torso', TORSO_W + 1, hip, mix(hip, top, 1 / 3), mix(hip, top, 2 / 3), top));
  out.push(line('torso', NECK_W, top, head));
  out.push(line('limb', LEG_W, hipR, kneeR, ankleR, [ankleR[0] + 2.4, ankleR[1]]));
  out.push(line('limb', LEG_W, hipL, kneeL, ankleL, [ankleL[0] - 2.4, ankleL[1]]));
  out.push(circle('head', 0.8, head, HEAD_R, 1));
  out.push(line('limb', ARM_W, shoR, elbowR, wristR, tipR));
  out.push(line('limb', ARM_W, shoL, elbowL, wristL, tipL));
  out.push(...(gear.front ?? []));
  out.push(dot(shoR), dot(shoL), dot(elbowR), dot(elbowL), dot(kneeR), dot(kneeL));
  return {
    shapes: out,
    bones: [dist(hipR, kneeR), dist(kneeR, ankleR), dist(hipL, kneeL), dist(kneeL, ankleL), dist(shoR, elbowR), dist(elbowR, wristR), dist(shoL, elbowL), dist(elbowL, wristL), dist(hip, top)],
  };
}

// ---------------------------------------------------------------- interpolation, output

/** Field by field: numbers blend, arrays and objects recurse, anything else (a function, a flag) comes from `a`. */
function lerpAny<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * t) as T;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => lerpAny(v, b[i], t)) as T;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const o: Record<string, unknown> = {};
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) o[k] = k in x && k in y ? lerpAny(x[k], y[k], t) : (x[k] ?? y[k]);
    return o as T;
  }
  return a ?? b;
}

const n = (v: number): string => String(Math.round(v * 10) / 10);

function pointsOf(shape: Shape): Pt[] {
  if (shape.k === 'circle') {
    return [
      [shape.c[0] - shape.rad, shape.c[1] - shape.rad],
      [shape.c[0] + shape.rad, shape.c[1] + shape.rad],
    ];
  }
  return shape.p;
}

/** Where the drawing is put on the grid: shifted sideways (to centre it) and scaled about the foot of the ground line (to fill the grid). */
interface Place {
  dx: number;
  s: number;
}

function write(shape: Shape, pl: Place): string {
  const fixed = shape.k === 'line' && shape.fixed;
  const X = (x: number): number => (fixed ? x : 32 + (x + pl.dx - 32) * pl.s);
  const Y = (y: number): number => (fixed ? y : FLOOR_Y + (y - FLOOR_Y) * pl.s);
  if (shape.k === 'line') return 'M' + shape.p.map(([x, y]) => `${n(X(x))} ${n(Y(y))}`).join('L');
  if (shape.k === 'curve') {
    const [p0, p1, p2, p3] = shape.p;
    return `M${n(X(p0[0]))} ${n(Y(p0[1]))}C${n(X(p1[0]))} ${n(Y(p1[1]))} ${n(X(p2[0]))} ${n(Y(p2[1]))} ${n(X(p3[0]))} ${n(Y(p3[1]))}`;
  }
  const r = Math.round(shape.rad * pl.s * 100) / 100;
  return `M${n(X(shape.c[0]) - r)} ${n(Y(shape.c[1]))}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0`;
}

const SOFT_ROLES: readonly PartRole[] = ['far', 'set'];

function poseOf(d: Draft, pl: Place): PoseDraw {
  const parts: Part[] = d.shapes.map((s) => {
    const fixed = s.k === 'line' && s.fixed;
    const p: Part = { r: s.r, d: write(s, pl), w: fixed ? s.w : Math.round(s.w * pl.s * 100) / 100 };
    if (s.k === 'circle' && s.f) p.f = s.f;
    return p;
  });
  return {
    parts,
    main: parts.filter((p) => !SOFT_ROLES.includes(p.r) && p.r !== 'dot').map((p) => p.d),
    soft: parts.filter((p) => SOFT_ROLES.includes(p.r)).map((p) => p.d),
  };
}

/**
 * Builds a pictogram from a pose generator over t. A and B are centred together (the same shift for both, so nothing jumps sideways)
 * and scaled up together (never more than MAX_FIT) until the drawing fills the grid, so a figure on all fours is as legible as a
 * standing one; the widths scale with it, so the proportions of the body do not change.
 */
const MAX_FIT = 1.6;
function make(tempo: number, draw: (t: number) => Draft): Pictogram {
  const a = draw(0);
  const b = draw(1);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  for (const d of [a, b]) {
    for (const s of d.shapes) {
      if (s.k === 'line' && s.fixed) continue;
      for (const [x, y] of pointsOf(s)) {
        minX = Math.min(minX, x - s.w / 2);
        maxX = Math.max(maxX, x + s.w / 2);
        minY = Math.min(minY, y - s.w / 2);
      }
    }
  }
  const s = Math.max(1, Math.min(MAX_FIT, 58 / (maxX - minX), 56 / (FLOOR_Y - minY)));
  const pl: Place = { dx: 32 - (minX + maxX) / 2, s };
  return { tempo, a: poseOf(a, pl), b: poseOf(b, pl), at: (t) => poseOf(draw(t), pl), bones: (t) => draw(t).bones };
}

const sideFig = (tempo: number, a: Side, b: Side): Pictogram => {
  const fa = fillSide(a);
  const fb = fillSide(b);
  // A far limb is drawn dim or solid for the whole movement (the part's role cannot change while it is animated): solid if either pose says so.
  for (const k of ['armF', 'legF'] as const) {
    if (fa[k].solid || fb[k].solid) {
      fa[k] = { ...fa[k], solid: true };
      fb[k] = { ...fb[k], solid: true };
    }
  }
  return make(tempo, (t) => side(t === 0 ? fa : t === 1 ? fb : lerpAny(fa, fb, t)));
};
const frontFig = (tempo: number, a: Front, b: Front): Pictogram => {
  const fa = fillFront(a);
  const fb = fillFront(b);
  return make(tempo, (t) => front(t === 0 ? fa : t === 1 ? fb : lerpAny(fa, fb, t)));
};

/** In-between frames for an animation: `values[i]` is the list of `d` of part `i` over `keyTimes` (A held, eased to B, held, eased back to A). */
export interface Tween {
  keyTimes: string;
  values: string[][];
}
const tweens = new WeakMap<Pictogram, Tween>();
export function tweenOf(p: Pictogram, steps = 6): Tween {
  const hit = tweens.get(p);
  if (hit) return hit;
  const hold = 0.06;
  const eased = Array.from({ length: steps + 1 }, (_, k) => (1 - Math.cos((Math.PI * k) / steps)) / 2);
  const frames = eased.map((t, k) => (k === 0 ? p.a : k === steps ? p.b : p.at(t)));
  // times: A at 0 and held until `hold`, moving to B at 0.5 - hold, held to 0.5, then the same backwards.
  const times: number[] = [0];
  const order: PoseDraw[] = [frames[0]!];
  const half = (from: number, forward: boolean): void => {
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      times.push(from + hold + (0.5 - 2 * hold) * u);
      order.push(frames[forward ? k : steps - k]!);
    }
    times.push(from + 0.5);
    order.push(frames[forward ? steps : 0]!);
  };
  half(0, true);
  half(0.5, false);
  const count = p.a.parts.length;
  const values = Array.from({ length: count }, (_, i) => order.map((f) => f.parts[i]!.d));
  const tween: Tween = { keyTimes: times.map((x) => String(Math.round(x * 1000) / 1000)).join(';'), values };
  tweens.set(p, tween);
  return tween;
}

// ---------------------------------------------------------------- the figures

/** A relaxed stance: the legs a little apart, the arms a little off the body, so a standing figure never reads as a pole. */
const standing = (extra: Partial<Side> = {}): Side => ({
  ankle: [32, ANKLE_Y],
  torso: 180,
  arm: { fk: [14, 8] },
  armF: { fk: [-10, -4] },
  leg: { fk: [0, 0] },
  legF: { fk: [-12, -12] },
  ...extra,
});

const GRIP = 1.2;
/** The point a hand holds something at: just past the wrist, along the hand. */
const grip = (j: Joints): Pt => along(j.wrist, angleOf(j.elbow, j.wrist), GRIP);

/** A kettlebell hanging below the hand, or held beyond it along the arm (`along` > 0 puts it that far past the grip). */
const bellOnArm = (j: Joints, along_ = 4.6): Shape[] => {
  const d = angleOf(j.elbow, j.wrist);
  return kettlebell(along(grip(j), d, along_), d + 180);
};
/** A kettlebell held at the chest by the horns: the bell hangs just below the hands. */
const bellAtChest = (j: Joints): Shape[] => {
  const g = grip(j);
  return kettlebell([g[0] + 0.5, g[1] + 3.6], 180);
};

const TOE_Y = FLOOR_Y - 1.8;
const PLANK_ANKLE_Y = TOE_Y - FOOT;
const PLANK_REACH = THIGH + SHIN + TORSO - SHOULDER_DROP;
/** The slope of the body line (degrees over the floor) that puts the shoulder at height `shoY`. */
const plankAlpha = (shoY: number): number => (Math.asin((PLANK_ANKLE_Y - shoY) / PLANK_REACH) * 180) / Math.PI;
const PLANK_X = 8;
const plankShoulderX = (alpha: number): number => PLANK_X + PLANK_REACH * Math.cos(rad(alpha));
const HAND_Y = FLOOR_Y - 1.6;

/** Body line of a figure on its toes at a slope: legs and torso are one straight line, the neck carrying on it. */
const plankBody = (alpha: number, extra: Partial<Side>): Side => ({
  ankle: [PLANK_X, PLANK_ANKLE_Y],
  torso: 90 + alpha,
  tilt: 0,
  leg: { fk: [alpha - 90, alpha - 90] },
  foot: 0,
  arm: { ik: [0, 0] },
  mat: true,
  ...extra,
});
/** A push-up body with the hands planted under the shoulders: the arm is solved from the shoulder to the floor. */
const pushupBody = (shoY: number, extra: Partial<Side> = {}): Side => {
  const alpha = plankAlpha(shoY);
  return plankBody(alpha, { arm: { ik: [plankShoulderX(alpha) + 0.5, HAND_Y], bend: 1, hand: 90 }, ...extra });
};


/** Where the hip is on a plank body whose slope is `alpha` (toes at PLANK_X). */
const plankHip = (alpha: number): Pt => [PLANK_X + (THIGH + SHIN) * Math.cos(rad(alpha)), PLANK_ANKLE_Y - (THIGH + SHIN) * Math.sin(rad(alpha))];
const kneelHip = (knee: Pt, alpha: number): Pt => [knee[0] + THIGH * Math.cos(rad(alpha)), knee[1] - THIGH * Math.sin(rad(alpha))];
const shoulderAt = (hip: Pt, torso: number): Pt => along(hip, torso, TORSO - SHOULDER_DROP);

/** A push-up on the knees: the shin lies back along the floor, the thigh and the torso are one line at `alpha`. */
const KNEE: Pt = [24, FLOOR_Y - 1.8];
const kneePushupBody = (alpha: number): Side => {
  const hip = kneelHip(KNEE, alpha);
  const sho = shoulderAt(hip, 90 + alpha);
  return { hip, torso: 90 + alpha, leg: { ik: [KNEE[0] - THIGH, KNEE[1]], bend: -1 }, foot: null, arm: { ik: [sho[0] + 0.5, HAND_Y], bend: 1, hand: 90 }, mat: true };
};

/** Leaning on a wall with the arms: the whole body is one line tilted `psi` degrees from the vertical. */
const WALL_X = 40;
const leanBody = (psi: number, ankleX: number): Side => {
  const hip: Pt = [ankleX + 24 * Math.sin(rad(psi)), ANKLE_Y - 24 * Math.cos(rad(psi))];
  const sho = shoulderAt(hip, 180 - psi);
  return { ankle: [ankleX, ANKLE_Y], leg: { fk: [-psi, -psi] }, torso: 180 - psi, arm: { ik: [WALL_X - 1.8, sho[1] + 0.5], bend: 1, hand: 180 }, gear: () => ({ back: [wall(WALL_X + 1.2)] }) };
};

/** An incline push-up with the hands on a desk (a box with a top at `top`). */
const DESK_X = 40;
const deskBody = (shoY: number, top: number): Side => {
  const alpha = plankAlpha(shoY);
  return plankBody(alpha, {
    arm: { ik: [DESK_X, top - 1.6], bend: 1, hand: 90 },
    gear: () => ({ back: [line('set', 2.2, [DESK_X - 9, top], [DESK_X + 12, top]), line('set', 2, [DESK_X - 6, top], [DESK_X - 6, FLOOR_Y]), line('set', 2, [DESK_X + 10, top], [DESK_X + 10, FLOOR_Y])] }),
  });
};

/** On the knees with the forearms on a ball: from upright to the body stretched out as far as it goes. */
const rolloutBody = (alpha: number): Side => {
  const hip = kneelHip([14, FLOOR_Y - 1.8], alpha);
  const sho = shoulderAt(hip, 90 + alpha);
  const bx = sho[0] + 11;
  return {
    hip,
    torso: 90 + alpha,
    tilt: -8,
    leg: { ik: [14 - THIGH, FLOOR_Y - 1.8], bend: -1 },
    foot: null,
    arm: { ik: [bx - 2, 41.2], bend: 1, hand: 90 },
    mat: true,
    gear: () => ({ back: ball([bx + 1, 50.8]) }),
  };
};

const CHAIR_X = 15;

export const PICTOGRAMS: Record<PictogramId, Pictogram> = {
  // Air squat: arms forward as a counterweight; the hips travel back and down until the thighs are level.
  squat: sideFig(
    2.4,
    standing({ arm: { fk: [88, 90] }, armF: undefined }),
    { ankle: [32, ANKLE_Y], torso: 140, tilt: 30, arm: { fk: [88, 90] }, leg: { fk: [92, -20] } },
  ),

  // Split squat / lunge: the back knee drops towards the floor, the front shin stays upright.
  lunge: sideFig(
    2.4,
    standing({ ankle: [31, ANKLE_Y], arm: { fk: [10, 6] } }),
    {
      ankle: [43, ANKLE_Y],
      torso: 178,
      arm: { fk: [10, 6] },
      leg: { fk: [90, 0] },
      legF: { fk: [-29, -100], solid: true },
      footF: 0,
    },
  ),

  // Hip hinge: the torso folds over the hips, the shins stay almost vertical, the arms hang.
  hinge: sideFig(
    2.4,
    standing({ arm: { fk: [8, 2] }, armF: { fk: [-4, -2] } }),
    { ankle: [32, ANKLE_Y], torso: 104, tilt: 28, arm: { fk: [8, 4] }, leg: { fk: [16, -8] } },
  ),

  // Glute bridge, lying on the back with the head to the left: the hips lift into one line from shoulders to knees.
  bridge: sideFig(
    2.8,
    {
      hip: [38, 57.6],
      torso: -90,
      tilt: 0,
      leg: { ik: [50, ANKLE_Y], bend: -1 },
      arm: { fk: [96, 100, 100] },
      mat: true,
      foot: 90,
    },
    {
      hip: [38, 46],
      torso: -39.4,
      tilt: -50.6,
      leg: { ik: [50, ANKLE_Y], bend: -1 },
      arm: { fk: [92, 90, 90] },
      mat: true,
      foot: 90,
    },
  ),

  // Push-up: toes and hands on the floor, the body one straight line that goes down and up.
  pushup: sideFig(2, pushupBody(43.8), pushupBody(52)),

  // Forearm plank: a held line; the hips and the head breathe a little so the pose does not look frozen.
  plank: sideFig(
    3,
    plankBody(plankAlpha(50.6), { arm: { fk: [0, 90, 90] }, tilt: 0 }),
    plankBody(plankAlpha(50.6) + 1.8, { arm: { fk: [0, 90, 90] }, tilt: 0 }),
  ),

  // Side plank seen from the front of the body: the body is the diagonal, one arm holds it up, the other reaches to the ceiling.
  sidePlank: sideFig(
    3,
    { ankle: [8, PLANK_ANKLE_Y + 2], torso: 114, tilt: -18, leg: { fk: [-66, -66] }, foot: 0, arm: { fk: [0, 0, 90] }, armF: { fk: [180, 180], solid: true }, facing: true, mat: true },
    { ankle: [8, PLANK_ANKLE_Y + 2], torso: 106, tilt: -18, leg: { fk: [-74, -74] }, foot: 0, arm: { fk: [0, 0, 90] }, armF: { fk: [168, 176], solid: true }, facing: true, mat: true },
  ),

  // Bent-over row: the torso stays folded, the elbow travels back past the ribs.
  row: sideFig(
    1.8,
    { ankle: [28, ANKLE_Y], torso: 126, tilt: 22, leg: { fk: [26, -14] }, arm: { fk: [6, 2] }, gear: (j) => ({ front: weight(grip(j)) }) },
    { ankle: [28, ANKLE_Y], torso: 126, tilt: 22, leg: { fk: [26, -14] }, arm: { fk: [-96, -8] }, gear: (j) => ({ front: weight(grip(j)) }) },
  ),

  // Overhead press: from the shoulders to straight overhead.
  press: sideFig(
    2,
    standing({ arm: { fk: [16, 176] }, armF: undefined, gear: (j) => ({ front: weight(grip(j)) }) }),
    standing({ arm: { fk: [172, 178] }, armF: undefined, gear: (j) => ({ front: weight(grip(j)) }) }),
  ),

  // Band pull-apart, front view: hands together at the chest, then pulled out to the sides with the band taut.
  pullApart: frontFig(
    2,
    {
      armR: [76, -100, -90],
      armL: [-76, 100, 90],
      spread: 5,
      gear: (j) => ({ front: band(j.handL, j.handR, 1) }),
    },
    {
      armR: [96, 96, 94],
      armL: [-96, -96, -94],
      spread: 5,
      gear: (j) => ({ front: band(j.handL, j.handR, 0) }),
    },
  ),

  // Jumping jack, front view: feet together and arms down, then a star in the air.
  jump: frontFig(
    1,
    { armR: [22, 12], armL: [-22, -12], spread: 5 },
    { armR: [150, 160], armL: [-150, -160], spread: 22, lift: 3 },
  ),

  // March / high knees: the knee comes up to hip height, the opposite arm drives forward.
  march: sideFig(
    1.2,
    standing({
      anchorFar: true,
      leg: { fk: [92, -4] },
      legF: { fk: [0, 0], solid: true },
      arm: { fk: [-32, -12] },
      armF: { fk: [40, 150], solid: true },
    }),
    standing({
      leg: { fk: [0, 0] },
      legF: { fk: [92, -4], solid: true },
      arm: { fk: [40, 150] },
      armF: { fk: [-32, -12], solid: true },
    }),
  ),

  // Jump rope, front view: the rope passes over the head, then under the feet while the body is in the air.
  rope: frontFig(
    0.7,
    {
      armR: [18, 66, 90],
      armL: [-18, -66, -90],
      spread: 2,
      gear: (j) => ({ front: [curve('prop', 1.2, j.handL, [j.handL[0] - 4, -8], [j.handR[0] + 4, -8], j.handR)] }),
    },
    {
      armR: [18, 66, 90],
      armL: [-18, -66, -90],
      spread: 2,
      lift: 5,
      gear: (j) => ({ front: [curve('prop', 1.2, j.handL, [j.handL[0] - 4, 74], [j.handR[0] + 4, 74], j.handR)] }),
    },
  ),

  // Sitting on a stability ball: upright with the arms forward, then one leg straight out for balance.
  ballSit: sideFig(
    2.4,
    {
      hip: [28, 40],
      torso: 180,
      arm: { fk: [86, 90] },
      leg: { ik: [42, ANKLE_Y], bend: -1 },
      legF: { ik: [42, ANKLE_Y], bend: -1 },
      gear: () => ({ back: ball([27, 50]) }),
    },
    {
      hip: [28, 40],
      torso: 178,
      arm: { fk: [86, 90] },
      leg: { ik: [42, ANKLE_Y], bend: -1 },
      legF: { ik: [54, 47], bend: -1, solid: true },
      gear: () => ({ back: ball([27, 50]) }),
    },
  ),

  // Seated on a chair: hands on the knees, then a long reach overhead.
  seated: sideFig(
    3,
    {
      hip: [28, 44],
      torso: 180,
      arm: { ik: [40, 42], bend: 1 },
      leg: { fk: [90, 0] },
      gear: () => ({ back: chair(20, 38, 47) }),
      noFloor: false,
    },
    {
      hip: [28, 44],
      torso: 177,
      tilt: -6,
      arm: { fk: [170, 176] },
      leg: { fk: [90, 0] },
      gear: () => ({ back: chair(20, 38, 47) }),
    },
  ),

  // Standing mobility, front view: arms hanging, then a side bend with the other arm arcing over the head.
  stretchStand: frontFig(
    3.2,
    { armR: [18, 10], armL: [-18, -10], spread: 5 },
    { lean: 14, armR: [8, 8], armL: [-158, -122, -110], spread: 5 },
  ),

  // Floor mobility on all fours (cat-cow): the spine hollows with the head up, then arches with the head down.
  stretchFloor: sideFig(
    3.2,
    {
      hip: [20, 47.4],
      torso: 107,
      tilt: 42,
      spine: -4,
      arm: { fk: [0, 0, 90] },
      leg: { fk: [0, -90], solid: true },
      foot: null,
      mat: true,
    },
    {
      hip: [20, 47.4],
      torso: 107,
      tilt: -46,
      spine: 5,
      arm: { fk: [0, 0, 90] },
      leg: { fk: [0, -90], solid: true },
      foot: null,
      mat: true,
    },
  ),

  // ---- upright strength with equipment

  // Goblet squat: the kettlebell held at the chest, the torso more upright than in an air squat.
  gobletSquat: sideFig(
    2.6,
    standing({ arm: { fk: [28, 152] }, armF: undefined, gear: (j) => ({ front: bellAtChest(j) }) }),
    { ankle: [32, ANKLE_Y], torso: 158, tilt: 12, arm: { fk: [28, 152] }, leg: { fk: [100, -18] }, gear: (j) => ({ front: bellAtChest(j) }) },
  ),

  // Thruster: from the squat with the weight racked at the shoulders to standing with it overhead, in one movement.
  thruster: sideFig(
    2.4,
    { ankle: [32, ANKLE_Y], torso: 152, tilt: 16, arm: { fk: [22, 172] }, leg: { fk: [98, -18] }, gear: (j) => ({ front: weight(grip(j)) }) },
    standing({ arm: { fk: [172, 178] }, armF: undefined, gear: (j) => ({ front: weight(grip(j)) }) }),
  ),

  // Deep squat hold: down below the thighs-level squat, the hands together in front of the chest, elbows between the knees.
  deepSquat: sideFig(
    3.2,
    { ankle: [32, ANKLE_Y], torso: 142, tilt: 28, arm: { fk: [88, 90] }, leg: { fk: [92, -20] } },
    { ankle: [32, ANKLE_Y], torso: 152, tilt: 18, arm: { fk: [34, 158] }, leg: { fk: [118, -30] } },
  ),

  // Kettlebell swing: the bell swings back between the legs, then to chest height by the hips snapping forward.
  swing: sideFig(
    1.6,
    { ankle: [30, ANKLE_Y], torso: 108, tilt: 28, leg: { fk: [20, -8] }, arm: { fk: [-28, -18] }, gear: (j) => ({ front: bellOnArm(j) }) },
    { ankle: [32, ANKLE_Y], torso: 180, tilt: 0, leg: { fk: [0, 0] }, arm: { fk: [88, 90] }, gear: (j) => ({ front: bellOnArm(j) }) },
  ),

  // Deadlift / Romanian deadlift: the weight travels down the front of the legs as the hips go back.
  deadlift: sideFig(
    2.6,
    standing({ arm: { fk: [8, 4] }, armF: undefined, gear: (j) => ({ front: bellOnArm(j) }) }),
    { ankle: [30, ANKLE_Y], torso: 110, tilt: 26, leg: { fk: [18, -10] }, arm: { fk: [8, 3] }, gear: (j) => ({ front: bellOnArm(j) }) },
  ),

  // Jump squat: the bottom of a squat with the arms back, then in the air with the legs straight and the arms up.
  jumpSquat: sideFig(
    1.2,
    { ankle: [32, ANKLE_Y], torso: 142, tilt: 28, arm: { fk: [-42, -28] }, leg: { fk: [92, -20] } },
    { ankle: [32, ANKLE_Y - 6], torso: 180, tilt: 0, arm: { fk: [172, 176] }, armF: { fk: [168, 174] }, leg: { fk: [0, 0] }, legF: { fk: [-6, -6] }, foot: 40, footF: 40 },
  ),

  // Band chest press: the band behind the back, the hands from the chest to straight out in front.
  chestPress: sideFig(
    2,
    standing({ arm: { fk: [26, 152] }, armF: undefined, gear: (j) => ({ front: band(grip(j), [j.sho[0] - 11, j.sho[1] + 3], 0) }) }),
    standing({ arm: { fk: [88, 90] }, armF: undefined, gear: (j) => ({ front: band(grip(j), [j.sho[0] - 11, j.sho[1] + 3], 0) }) }),
  ),

  // Shadow boxing: a guard with both hands up, then the front hand punches.
  punch: sideFig(
    1,
    {
      ankle: [34, ANKLE_Y],
      torso: 176,
      arm: { fk: [26, 164] },
      armF: { fk: [18, 160], solid: true },
      leg: { fk: [10, 0] },
      legF: { fk: [-24, -24], solid: true },
    },
    {
      ankle: [34, ANKLE_Y],
      torso: 172,
      arm: { fk: [88, 92] },
      armF: { fk: [18, 160], solid: true },
      leg: { fk: [10, 0] },
      legF: { fk: [-24, -24], solid: true },
    },
  ),

  // ---- mobility, standing

  // Chin tuck: the head glides back over the shoulders (a double chin), then forward again.
  chinTuck: sideFig(
    2.4,
    standing({ arm: { fk: [8, 2] }, armF: { fk: [-6, -2] }, tilt: -26 }),
    standing({ arm: { fk: [8, 2] }, armF: { fk: [-6, -2] }, tilt: 10 }),
  ),

  // Neck circles, front view: the ear towards one shoulder, then the other.
  neckTilt: frontFig(
    3.2,
    { armR: [12, 6], armL: [-12, -6], spread: 5, tilt: -26 },
    { armR: [12, 6], armL: [-12, -6], spread: 5, tilt: 26 },
  ),

  // Shoulder circles: the straight arm from low in front to overhead.
  armSweep: sideFig(
    3.2,
    standing({ arm: { fk: [34, 34] }, armF: undefined }),
    standing({ arm: { fk: [178, 178] }, armF: undefined }),
  ),

  // Wrist stretch / circles: the arm straight out, the hand flat, then folded back by the fingers.
  wristStretch: sideFig(
    2.4,
    standing({ arm: { fk: [86, 90], hand: 92 }, armF: undefined }),
    standing({ arm: { fk: [86, 90], hand: 164 }, armF: undefined }),
  ),

  // Suitcase hold, front view: a weight in one hand, the trunk upright against it.
  carry: frontFig(
    3,
    { armR: [6, 4], armL: [-14, -8], spread: 4, lean: 3, gear: (j) => ({ front: kettlebell([j.handR[0] + 0.4, j.handR[1] + 5.4], 180) }) },
    { armR: [6, 4], armL: [-14, -8], spread: 4, lean: -2, gear: (j) => ({ front: kettlebell([j.handR[0] + 0.4, j.handR[1] + 5.4], 180) }) },
  ),

  // ---- on the floor

  // Bird dog: on all fours, then the opposite arm and leg reach out until they are level with the body.
  birdDog: sideFig(
    3,
    {
      hip: [24, 47.4],
      torso: 107,
      tilt: 16,
      arm: { fk: [0, 0, 90] },
      armF: { fk: [0, 0, 90], solid: true },
      leg: { fk: [0, -90] },
      legF: { fk: [0, -90], solid: true },
      foot: null,
      footF: null,
      mat: true,
    },
    {
      hip: [24, 47.4],
      torso: 107,
      tilt: 8,
      arm: { fk: [0, 0, 90] },
      armF: { fk: [96, 94, 92], solid: true },
      leg: { fk: [-88, -90] },
      legF: { fk: [0, -90], solid: true },
      foot: null,
      footF: null,
      mat: true,
    },
  ),

  // Child's pose: from all fours the hips go back onto the heels and the arms reach forward along the floor.
  childPose: sideFig(
    3.6,
    {
      hip: [22, 47.4],
      torso: 107,
      tilt: 18,
      arm: { fk: [0, 0, 90] },
      leg: { ik: [10, 59.2], bend: -1 },
      foot: null,
      mat: true,
    },
    {
      hip: [12.5, 54],
      torso: 94,
      tilt: -34,
      arm: { fk: [74, 76, 84] },
      leg: { ik: [10, 59.2], bend: -1 },
      foot: null,
      mat: true,
    },
  ),

  // 90/90 hip stretch, sitting on the floor: upright, then folding forward over the front shin.
  hip9090: sideFig(
    3.6,
    {
      hip: [28, 57.6],
      torso: 180,
      arm: { fk: [30, 24] },
      leg: { fk: [96, -92] },
      legF: { fk: [82, 100] },
      foot: null,
      mat: true,
    },
    {
      hip: [28, 57.6],
      torso: 146,
      tilt: 14,
      arm: { fk: [48, 40] },
      leg: { fk: [96, -92] },
      legF: { fk: [82, 100] },
      foot: null,
      mat: true,
    },
  ),

  // Lying hamstring stretch with a band: on the back, one leg straight up held towards the head by the band.
  lyingHamstring: sideFig(
    3.6,
    {
      hip: [38, 57.6],
      torso: -90,
      leg: { fk: [146, 146] },
      legF: { fk: [90, 90] },
      arm: { ik: [38 + 24 * Math.sin(rad(146)), 57.6 + 24 * Math.cos(rad(146))] },
      foot: 100,
      footF: 90,
      mat: true,
      gear: (j) => ({ front: band(grip(j), j.ankle, 0) }),
    },
    {
      hip: [38, 57.6],
      torso: -90,
      leg: { fk: [168, 168] },
      legF: { fk: [90, 90] },
      arm: { ik: [38 + 24 * Math.sin(rad(168)), 57.6 + 24 * Math.cos(rad(168))] },
      foot: 100,
      footF: 90,
      mat: true,
      gear: (j) => ({ front: band(grip(j), j.ankle, 0) }),
    },
  ),

  // Dead bug: on the back with the arms up and the knees over the hips; the opposite arm and leg lower towards the floor.
  deadBug: sideFig(
    3.2,
    {
      hip: [38, 57.6],
      torso: -90,
      arm: { fk: [180, 180] },
      armF: { fk: [180, 180], solid: true },
      leg: { fk: [180, 90] },
      legF: { fk: [180, 90], solid: true },
      foot: null,
      footF: null,
      mat: true,
    },
    {
      hip: [38, 57.6],
      torso: -90,
      arm: { fk: [180, 180] },
      armF: { fk: [268, 268], solid: true },
      leg: { fk: [97, 94] },
      legF: { fk: [180, 90], solid: true },
      foot: null,
      footF: null,
      mat: true,
    },
  ),

  // Hollow hold: on the back, shoulders and legs lifted off the floor into a shallow banana, the arms overhead.
  hollow: sideFig(
    3,
    {
      hip: [38, 57.6],
      torso: -90,
      arm: { fk: [-92, -92] },
      leg: { fk: [90, 90] },
      foot: 110,
      mat: true,
    },
    {
      hip: [38, 57.6],
      torso: -104,
      tilt: -4,
      arm: { fk: [-126, -126] },
      leg: { fk: [118, 118] },
      foot: 135,
      mat: true,
    },
  ),

  // Prone Y-T-W / reverse snow angel: face down, the chest and the straight arms lift off the floor.
  proneY: sideFig(
    3,
    {
      hip: [40, 57.6],
      torso: -90,
      arm: { fk: [-90, -90] },
      leg: { fk: [90, 90] },
      foot: 90,
      prone: true,
      mat: true,
    },
    {
      hip: [40, 57.6],
      torso: -106,
      tilt: -6,
      arm: { fk: [-128, -128] },
      leg: { fk: [100, 100] },
      foot: 90,
      prone: true,
      mat: true,
    },
  ),

  // Dumbbell floor press: on the back, the weights from the chest to straight above it.
  floorPress: sideFig(
    2.2,
    {
      hip: [38, 57.6],
      torso: -90,
      leg: { ik: [50, ANKLE_Y], bend: -1 },
      arm: { fk: [104, 180] },
      mat: true,
      gear: (j) => ({ front: weight(grip(j)) }),
    },
    {
      hip: [38, 57.6],
      torso: -90,
      leg: { ik: [50, ANKLE_Y], bend: -1 },
      arm: { fk: [180, 180] },
      mat: true,
      gear: (j) => ({ front: weight(grip(j)) }),
    },
  ),

  // ---- planks, push-ups and what is built on them

  // Mountain climber: the high plank with a knee driven under the chest, then the other.
  mountainClimber: ((): Pictogram => {
    const alpha = plankAlpha(43.8);
    const hip = plankHip(alpha);
    const hand: Limb = { ik: [plankShoulderX(alpha) + 0.5, HAND_Y], bend: 1, hand: 90 };
    const driven: Limb = { ik: [hip[0] + 4, 53.5], bend: 1, solid: true };
    const straight: Limb = { fk: [alpha - 90, alpha - 90], solid: true };
    const base: Omit<Side, 'leg'> = { hip, torso: 90 + alpha, arm: hand, foot: 0, footF: 0, mat: true };
    return sideFig(1, { ...base, leg: driven, legF: straight }, { ...base, leg: straight, legF: driven });
  })(),

  // Inchworm: from the folded forward bend the hands walk out to a plank.
  inchworm: sideFig(
    3.2,
    {
      ankle: [PLANK_X + 2, PLANK_ANKLE_Y],
      leg: { fk: [-28, -28] },
      foot: 0,
      torso: 30,
      arm: { ik: [26.5, HAND_Y], bend: 1, hand: 90 },
      mat: true,
    },
    plankBody(plankAlpha(43.8), { ankle: [PLANK_X + 2, PLANK_ANKLE_Y], arm: { ik: [plankShoulderX(plankAlpha(43.8)) + 2.5, HAND_Y], bend: 1, hand: 90 } }),
  ),

  // Pike push-up: hips high in an upside-down V, the head goes down between the hands and back up.
  pike: sideFig(
    2.4,
    {
      ankle: [PLANK_X + 2, PLANK_ANKLE_Y],
      leg: { fk: [-28, -28] },
      foot: 0,
      torso: 30,
      arm: { ik: [26.5, HAND_Y], bend: 1, hand: 90 },
      mat: true,
    },
    {
      ankle: [PLANK_X + 2, PLANK_ANKLE_Y],
      leg: { fk: [-34, -34] },
      foot: 0,
      torso: 8,
      tilt: 24,
      arm: { ik: [26.5, HAND_Y], bend: 1, hand: 90 },
      mat: true,
    },
  ),

  // Push-up on the knees.
  kneePushup: sideFig(2, kneePushupBody(38.8), kneePushupBody(17)),

  // Wall push-up: standing, the hands on the wall, the chest goes in and out.
  wallPushup: sideFig(2.2, leanBody(13, WALL_X - 25), leanBody(25, WALL_X - 25)),

  // Incline push-up on a desk or a table.
  deskPushup: sideFig(2.2, deskBody(34, 49.5), deskBody(42, 49.5)),

  // Chair dip: the hands on the seat behind, the legs out in front, the body goes down and up.
  dip: ((): Pictogram => {
    const hand: Pt = [17, 47.4];
    const mk = (hipY: number): Side => ({
      hip: [18, hipY],
      torso: 180,
      tilt: 0,
      leg: { ik: [38, ANKLE_Y], bend: -1 },
      arm: { ik: hand, bend: -1, hand: 90 },
      gear: () => ({ back: chair(7, 25, 49.2).slice(0, 1).concat([line('set', 2, [9, 49.2], [9, FLOOR_Y]), line('set', 2, [23, 49.2], [23, FLOOR_Y])]) }),
    });
    return sideFig(2.2, mk(45.6), mk(53.4));
  })(),

  // Stability ball rollout: on the knees, the forearms on the ball, rolling out and back.
  ballRollout: sideFig(3, rolloutBody(66), rolloutBody(26)),

  // Burpee: down with the hands on the floor, then up into a jump with the arms overhead.
  burpee: sideFig(
    1.6,
    {
      hip: [24, 47.8],
      torso: 107.5,
      tilt: 6,
      leg: { ik: [19, ANKLE_Y], bend: -1 },
      arm: { ik: [36.5, HAND_Y], bend: 1, hand: 90 },
      foot: 90,
    },
    {
      hip: [30, 29],
      torso: 180,
      leg: { ik: [30, 53], bend: -1 },
      arm: { ik: [31, 1], bend: 1 },
      foot: 40,
    },
  ),

  // ---- with a chair or a wall

  // Sit to stand: from sitting on the chair, the weight forward, to standing tall.
  sitStand: sideFig(
    3,
    {
      hip: [24, 44.6],
      torso: 160,
      tilt: 14,
      leg: { ik: [37, ANKLE_Y], bend: -1 },
      arm: { fk: [88, 90] },
      gear: () => ({ back: chair(CHAIR_X, 32, 49.2) }),
    },
    {
      hip: [35, 35.4],
      torso: 180,
      tilt: 0,
      leg: { ik: [37, ANKLE_Y], bend: -1 },
      arm: { fk: [88, 90] },
      gear: () => ({ back: chair(CHAIR_X, 32, 49.2) }),
    },
  ),

  // Wall sit: the back on the wall, from standing to the thighs level with the floor.
  wallSquat: sideFig(
    3,
    {
      hip: [21.8, 35.6],
      torso: 180,
      leg: { ik: [27.5, ANKLE_Y], bend: -1 },
      arm: { fk: [88, 90] },
      gear: () => ({ back: [wall(15.5)] }),
    },
    {
      hip: [21.8, 47],
      torso: 180,
      leg: { ik: [33.5, ANKLE_Y], bend: -1 },
      arm: { fk: [88, 90] },
      gear: () => ({ back: [wall(15.5)] }),
    },
  ),

  // Wall squat with the ball between the back and the wall.
  ballWallSquat: sideFig(
    2.6,
    {
      hip: [31.6, 35.6],
      torso: 180,
      leg: { ik: [37.5, ANKLE_Y], bend: -1 },
      arm: { fk: [88, 90] },
      gear: () => ({ back: [wall(15.5), ...ball([24, 31.6], 8)] }),
    },
    {
      hip: [31.6, 47],
      torso: 180,
      leg: { ik: [43.5, ANKLE_Y], bend: -1 },
      arm: { fk: [88, 90] },
      gear: () => ({ back: [wall(15.5), ...ball([24, 43], 8)] }),
    },
  ),

  // Wall angel: back, head and arms on the wall, the arms slide up.
  wallAngel: sideFig(
    3,
    standing({ ankle: [26, ANKLE_Y], arm: { fk: [6, 6] }, armF: undefined, gear: () => ({ back: [wall(15)] }) }),
    standing({ ankle: [26, ANKLE_Y], arm: { fk: [176, 176] }, armF: undefined, gear: () => ({ back: [wall(15)] }) }),
  ),

  // Doorway chest stretch: the forearm on the frame, the body steps through.
  doorStretch: sideFig(
    3.2,
    {
      ankle: [30, ANKLE_Y],
      torso: 180,
      leg: { fk: [8, 0] },
      legF: { fk: [-14, -14] },
      arm: { ik: [46, 21], bend: 1, hand: 180 },
      gear: () => ({ back: [line('set', 2.4, [47.6, 4], [47.6, FLOOR_Y])] }),
    },
    {
      ankle: [38, ANKLE_Y],
      torso: 172,
      leg: { fk: [66, 0] },
      legF: { fk: [-34, -34], solid: true },
      arm: { ik: [46, 21], bend: 1, hand: 180 },
      gear: () => ({ back: [line('set', 2.4, [47.6, 4], [47.6, FLOOR_Y])] }),
    },
  ),

  // Standing cat-cow: the hands on the thighs, the back rounds with the head down, then hollows with the head up.
  standingCatCow: sideFig(
    3.2,
    { ankle: [30, ANKLE_Y], leg: { fk: [14, -10] }, torso: 132, tilt: -40, spine: 3, arm: { ik: [30.7, 41], bend: 1, hand: 100 } },
    { ankle: [30, ANKLE_Y], leg: { fk: [14, -10] }, torso: 132, tilt: 34, spine: -2.5, arm: { ik: [30.7, 41], bend: 1, hand: 100 } },
  ),
};
