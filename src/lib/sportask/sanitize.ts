import { isIsoDate } from '../dates';
import { SPORTASK_DEFAULTS } from '../sportask-defaults';
import type {
  BlockStep,
  Dose,
  Enrolment,
  EquipmentInventory,
  EquipmentItem,
  Feedback,
  SportBlock,
  SportTemplate,
  SportaskSettings,
  StepResult,
  TemplateSlot,
} from '../../types/sportask';
import { clampCadence } from './cadences';

/** Untrusted input (import files, sync pulls, localStorage): everything here returns a valid value or null. Pure. */

const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const MAX_EQUIPMENT = 32;
const MAX_ARRAY = 120;
const MAX_SLOTS = 40;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const int = (v: unknown, lo: number, hi: number): number | undefined => (isNum(v) ? clamp(Math.round(v), lo, hi) : undefined);
const real = (v: unknown, lo: number, hi: number): number | undefined => (isNum(v) ? clamp(v, lo, hi) : undefined);

function sanitizeEnrolment(raw: unknown): Enrolment | null {
  if (!isRec(raw) || !isId(raw['goalId']) || !isId(raw['programId']) || !isIsoDate(raw['startedOn'])) return null;
  const level = raw['level'] === 2 || raw['level'] === 3 ? raw['level'] : 1;
  return { goalId: raw['goalId'], programId: raw['programId'], level, startedOn: raw['startedOn'], acceptedDisclaimerAt: real(raw['acceptedDisclaimerAt'], 0, 8.64e15) ?? 0 };
}

const BAND_STRENGTHS = ['light', 'medium', 'heavy'] as const;

function sanitizeEquipment(raw: unknown): EquipmentInventory {
  const out: EquipmentInventory = {};
  if (!isRec(raw)) return out;
  for (const key of Object.keys(raw).slice(0, MAX_EQUIPMENT)) {
    const item = raw[key];
    if (!ID_RE.test(key) || !isRec(item)) continue;
    const clean: EquipmentItem = { owned: item['owned'] === true };
    if (Array.isArray(item['weightsKg'])) {
      const weights = [...new Set(item['weightsKg'].filter(isNum).filter((w) => w > 0 && w <= 500))].sort((a, b) => a - b).slice(0, 12);
      if (weights.length > 0) clean.weightsKg = weights;
    }
    if (Array.isArray(item['bandStrengths'])) {
      const bands = [...new Set(item['bandStrengths'].filter((b): b is (typeof BAND_STRENGTHS)[number] => BAND_STRENGTHS.includes(b)))];
      if (bands.length > 0) clean.bandStrengths = bands;
    }
    out[key] = clean;
  }
  return out;
}

export function defaultSettings(): SportaskSettings {
  return { ...SPORTASK_DEFAULTS, equipment: {}, constraints: { ...SPORTASK_DEFAULTS.constraints } };
}

/** Fills defaults for missing or unknown fields; never throws. */
export function sanitizeSettings(raw: unknown): SportaskSettings {
  const d = defaultSettings();
  if (!isRec(raw)) return d;
  const out: SportaskSettings = {
    enrolment: sanitizeEnrolment(raw['enrolment']),
    cadenceId: isId(raw['cadenceId']) ? raw['cadenceId'] : d.cadenceId,
    equipment: sanitizeEquipment(raw['equipment']),
    constraints: {
      lowImpact: isRec(raw['constraints']) && raw['constraints']['lowImpact'] === true,
      noFloor: isRec(raw['constraints']) && raw['constraints']['noFloor'] === true,
    },
    skin: isId(raw['skin']) ? raw['skin'] : d.skin,
    skinWholeApp: typeof raw['skinWholeApp'] === 'boolean' ? raw['skinWholeApp'] : d.skinWholeApp,
    cues: typeof raw['cues'] === 'boolean' ? raw['cues'] : d.cues,
    autoStartBreak: typeof raw['autoStartBreak'] === 'boolean' ? raw['autoStartBreak'] : d.autoStartBreak,
  };
  const c = raw['customCadence'];
  if (isRec(c) && isNum(c['focusSeconds']) && isNum(c['breakSeconds'])) {
    const lb = c['longBreak'];
    out.customCadence = clampCadence({
      focusSeconds: c['focusSeconds'],
      breakSeconds: c['breakSeconds'],
      exerciseEvery: isNum(c['exerciseEvery']) ? c['exerciseEvery'] : 1,
      ...(isRec(lb) && isNum(lb['every']) && isNum(lb['seconds']) ? { longBreak: { every: lb['every'], seconds: lb['seconds'] } } : {}),
    });
  }
  return out;
}

function sanitizeDose(raw: unknown): Dose | undefined {
  if (!isRec(raw)) return undefined;
  const reps = int(raw['reps'], 1, 1000);
  const seconds = int(raw['seconds'], 1, 3600);
  if ((reps === undefined) === (seconds === undefined)) return undefined;
  return reps !== undefined ? { reps } : { seconds: seconds! };
}

function sanitizeStep(raw: unknown): BlockStep | null {
  if (!isRec(raw) || !isId(raw['exerciseId'])) return null;
  const workSeconds = int(raw['workSeconds'], 0, 3600);
  const restSeconds = int(raw['restSeconds'], 0, 3600);
  if (workSeconds === undefined || restSeconds === undefined) return null;
  const step: BlockStep = { exerciseId: raw['exerciseId'], workSeconds, restSeconds };
  const target = sanitizeDose(raw['target']);
  if (target) step.target = target;
  if (raw['side'] === 'left' || raw['side'] === 'right') step.side = raw['side'];
  const loadKg = real(raw['loadKg'], 0, 500);
  if (loadKg !== undefined) step.loadKg = loadKg;
  const round = int(raw['round'], 1, 100);
  if (round !== undefined) step.round = round;
  return step;
}

function sanitizeResult(raw: unknown, stepCount: number): StepResult | null {
  if (!isRec(raw) || typeof raw['done'] !== 'boolean') return null;
  const stepIndex = int(raw['stepIndex'], 0, MAX_ARRAY - 1);
  if (stepIndex === undefined || stepIndex >= stepCount) return null;
  const r: StepResult = { stepIndex, done: raw['done'] };
  const value = real(raw['value'], -1000, 100000);
  if (value !== undefined) r.value = value;
  const loadKg = real(raw['loadKg'], 0, 500);
  if (loadKg !== undefined) r.loadKg = loadKg;
  return r;
}

const KINDS = ['train', 'warmup', 'test'] as const;
const STATUSES = ['done', 'partial', 'skipped'] as const;
const FEEDBACKS: Feedback[] = ['tooEasy', 'ok', 'tooHard'];

export function sanitizeBlock(raw: unknown): SportBlock | null {
  if (!isRec(raw) || !isId(raw['id']) || !isIsoDate(raw['date'])) return null;
  const startedAt = real(raw['startedAt'], 0, 8.64e15);
  if (startedAt === undefined) return null;
  if (raw['origin'] !== 'goal' && raw['origin'] !== 'free') return null;
  const kind = KINDS.find((k) => k === raw['kind']);
  const status = STATUSES.find((s) => s === raw['status']);
  if (!kind || !status) return null;
  const blockSeconds = int(raw['blockSeconds'], 1, 7200);
  const prepSeconds = int(raw['prepSeconds'], 0, 120);
  if (blockSeconds === undefined || prepSeconds === undefined) return null;
  const rawSteps = raw['steps'];
  const rawResults = raw['results'];
  if (!Array.isArray(rawSteps) || rawSteps.length === 0 || rawSteps.length > MAX_ARRAY) return null;
  if (!Array.isArray(rawResults) || rawResults.length > MAX_ARRAY) return null;
  const steps: BlockStep[] = [];
  for (const s of rawSteps) {
    const step = sanitizeStep(s);
    if (!step) return null;
    steps.push(step);
  }
  const results = rawResults.map((r) => sanitizeResult(r, steps.length)).filter((r): r is StepResult => r !== null);

  const block: SportBlock = { id: raw['id'], startedAt, date: raw['date'], origin: raw['origin'], kind, blockSeconds, prepSeconds, steps, results, status, catalogVersion: 0, createdAt: startedAt, updatedAt: startedAt };
  if (isId(raw['goalId'])) block.goalId = raw['goalId'];
  if (isId(raw['programId'])) block.programId = raw['programId'];
  const week = int(raw['programWeek'], 1, 520);
  if (week !== undefined) block.programWeek = week;
  if (typeof raw['templateId'] === 'string' && raw['templateId'].length >= 1 && raw['templateId'].length <= 64) block.templateId = raw['templateId'];
  if (isId(raw['assessmentId'])) block.assessmentId = raw['assessmentId'];
  const rpe = int(raw['rpe'], 1, 10);
  if (rpe !== undefined) block.rpe = rpe;
  const feedback = FEEDBACKS.find((f) => f === raw['feedback']);
  if (feedback) block.feedback = feedback;
  block.catalogVersion = int(raw['catalogVersion'], 0, 1_000_000) ?? 0;
  block.createdAt = real(raw['createdAt'], 0, 8.64e15) ?? startedAt;
  block.updatedAt = real(raw['updatedAt'], 0, 8.64e15) ?? block.createdAt;
  return orderedBlock(block);
}

/** Fixed key order (the interface's), so a sanitised block compares and hashes the same wherever it came from. */
function orderedBlock(b: SportBlock): SportBlock {
  const out: SportBlock = { id: b.id, startedAt: b.startedAt, date: b.date, origin: b.origin } as SportBlock;
  if (b.goalId !== undefined) out.goalId = b.goalId;
  if (b.programId !== undefined) out.programId = b.programId;
  if (b.programWeek !== undefined) out.programWeek = b.programWeek;
  if (b.templateId !== undefined) out.templateId = b.templateId;
  out.kind = b.kind;
  if (b.assessmentId !== undefined) out.assessmentId = b.assessmentId;
  out.blockSeconds = b.blockSeconds;
  out.prepSeconds = b.prepSeconds;
  out.steps = b.steps;
  out.results = b.results;
  out.status = b.status;
  if (b.rpe !== undefined) out.rpe = b.rpe;
  if (b.feedback !== undefined) out.feedback = b.feedback;
  out.catalogVersion = b.catalogVersion;
  out.createdAt = b.createdAt;
  out.updatedAt = b.updatedAt;
  return out;
}

function sanitizeSlot(raw: unknown): TemplateSlot | null {
  if (!isRec(raw)) return null;
  if (isId(raw['exerciseId'])) {
    const dose = sanitizeDose(raw['dose']);
    return dose ? { exerciseId: raw['exerciseId'], dose } : { exerciseId: raw['exerciseId'] };
  }
  if (isId(raw['pattern'])) {
    const slot: Extract<TemplateSlot, { pattern: string }> = { pattern: raw['pattern'] as never };
    if (isId(raw['tag'])) slot.tag = raw['tag'] as never;
    if (isId(raw['zone'])) slot.zone = raw['zone'] as never;
    const maxLevel = int(raw['maxLevel'], 1, 5);
    if (maxLevel !== undefined) slot.maxLevel = maxLevel as never;
    return slot;
  }
  return null;
}

const FORMATS = ['sequence', 'intervals', 'emom'] as const;

/** A user template (built-ins live in code, so `builtin` and `nameText` are dropped). */
export function sanitizeTemplate(raw: unknown): SportTemplate | null {
  if (!isRec(raw) || !isId(raw['id']) || typeof raw['name'] !== 'string') return null;
  const name = raw['name'].trim().slice(0, 200);
  const format = FORMATS.find((f) => f === raw['format']);
  if (!name || !format || !Array.isArray(raw['slots']) || raw['slots'].length === 0 || raw['slots'].length > MAX_SLOTS) return null;
  const slots: TemplateSlot[] = [];
  for (const s of raw['slots']) {
    const slot = sanitizeSlot(s);
    if (!slot) return null;
    slots.push(slot);
  }
  const createdAt = real(raw['createdAt'], 0, 8.64e15) ?? 0;
  const t: SportTemplate = { id: raw['id'], name, slots, format, order: real(raw['order'], -1e9, 1e9) ?? 0, createdAt, updatedAt: real(raw['updatedAt'], 0, 8.64e15) ?? createdAt };
  const work = int(raw['workSeconds'], 5, 600);
  if (work !== undefined) t.workSeconds = work;
  const rest = int(raw['restSeconds'], 0, 600);
  if (rest !== undefined) t.restSeconds = rest;
  const min = int(raw['minSeconds'], 0, 7200);
  if (min !== undefined) t.minSeconds = min;
  return orderedTemplate(t);
}

function orderedTemplate(t: SportTemplate): SportTemplate {
  const out: SportTemplate = { id: t.id, name: t.name, slots: t.slots, format: t.format } as SportTemplate;
  if (t.workSeconds !== undefined) out.workSeconds = t.workSeconds;
  if (t.restSeconds !== undefined) out.restSeconds = t.restSeconds;
  if (t.minSeconds !== undefined) out.minSeconds = t.minSeconds;
  out.order = t.order;
  out.createdAt = t.createdAt;
  out.updatedAt = t.updatedAt;
  return out;
}

