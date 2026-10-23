/** The v1 pictogram set (PLAN section 9.3): one per movement family. The drawings live in the lazy pictogram-paths.ts. */
export const PICTOGRAM_IDS = [
  'squat', 'lunge', 'hinge', 'bridge', 'pushup', 'plank', 'sidePlank', 'row', 'press', 'pullApart', 'jump', 'march', 'rope',
  'ballSit', 'seated', 'stretchStand', 'stretchFloor',
  // Added with the redraw (docs/sportask/PICTOGRAMS.md): append only, an id may be stored.
  'gobletSquat', 'thruster', 'deepSquat', 'swing', 'deadlift', 'jumpSquat', 'chestPress', 'punch',
  'chinTuck', 'neckTilt', 'armSweep', 'wristStretch', 'carry',
  'birdDog', 'childPose', 'hip9090', 'lyingHamstring', 'deadBug', 'hollow', 'proneY', 'floorPress',
  'mountainClimber', 'inchworm', 'pike', 'kneePushup', 'wallPushup', 'deskPushup', 'dip', 'ballRollout', 'burpee',
  'sitStand', 'wallSquat', 'ballWallSquat', 'wallAngel', 'doorStretch', 'standingCatCow',
] as const;
export type PictogramId = (typeof PICTOGRAM_IDS)[number];
