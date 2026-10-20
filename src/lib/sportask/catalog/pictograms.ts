/** The v1 pictogram set (PLAN section 9.3): one per movement family. The drawings live in the lazy pictogram-paths.ts. */
export const PICTOGRAM_IDS = [
  'squat', 'lunge', 'hinge', 'bridge', 'pushup', 'plank', 'sidePlank', 'row', 'press', 'pullApart', 'jump', 'march', 'rope',
  'ballSit', 'seated', 'stretchStand', 'stretchFloor',
] as const;
export type PictogramId = (typeof PICTOGRAM_IDS)[number];
