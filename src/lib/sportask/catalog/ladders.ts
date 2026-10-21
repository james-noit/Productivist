import type { LadderDef } from '../../../types/sportask';

/** CONTENT.md section 3.1. rungs[i] are alternatives of similar difficulty. */
export const LADDERS: LadderDef[] = [
  { id: 'push', pattern: 'push', rungs: [['wallPushUp'], ['deskPushUp', 'bandChestPress'], ['kneePushUp', 'dumbbellFloorPress'], ['pushUp', 'chairDip'], ['feetElevatedPushUp', 'ballPushUp'], ['archerPushUp']] },
  { id: 'pushVertical', pattern: 'pushVertical', rungs: [['bandOverheadPress'], ['dumbbellShoulderPress', 'kettlebellPress'], ['pikePushUp']] },
  { id: 'pull', pattern: 'pull', rungs: [['proneYTW', 'bandPullApart'], ['reverseSnowAngel', 'bandBentOverRow'], ['dumbbellRow'], ['kettlebellHighPull'], ['renegadeRow']] },
  { id: 'squat', pattern: 'squat', rungs: [['sitToStand', 'ballWallSquat'], ['airSquat', 'bandSquat', 'wallSit'], ['pauseSquat', 'gobletSquat'], ['jumpSquat', 'singleLegSitToStand']] },
  { id: 'lunge', pattern: 'lunge', rungs: [['staticSplitSquat', 'lateralLungeShift'], ['reverseLunge'], ['dumbbellReverseLunge'], ['bulgarianSplitSquat']] },
  { id: 'hinge', pattern: 'hinge', rungs: [['standingGoodMorning', 'gluteBridge'], ['bandGoodMorning', 'kettlebellDeadlift'], ['singleLegGluteBridge', 'dumbbellRdl', 'ballHamstringCurl'], ['singleLegRdl', 'kettlebellSwing']] },
  { id: 'core', pattern: 'core', rungs: [['deskPlank', 'deadBug', 'birdDog'], ['plank', 'suitcaseHold'], ['sidePlank', 'ballRollout'], ['hollowHold'], ['ballStirThePot']] },
];
