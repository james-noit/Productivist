import type { BellSoundId } from '../services/settings.service';

/**
 * The end-of-session sounds, synthesised with Web Audio. Loaded on demand by `ClockService` (never part of the
 * initial bundle). The AudioContext is created and resumed by the caller, inside a click handler, because a
 * context started anywhere else stays suspended and the bell would be silent; everything here only schedules
 * sound on it.
 *
 * Every sound is routed through one master `GainNode`, so a single `stop()` silences all of it. The
 * `alarmClock` can use a recorded sample (`sounds/alarm-clock.ogg`, optional, see `public/sounds/README.md`)
 * and falls back to its synthesised version when the file is missing or cannot be decoded.
 */

/** A ringing alarm never outlasts this, whatever the loop setting. */
const MAX_RING_MS = 60_000;
const STOP_FADE_S = 0.08;
const SAMPLE_URL = 'sounds/alarm-clock.ogg';

export interface RingOptions {
  /** Start the next cycle when one ends, until `stop()` or 60 s. */
  loop: boolean;
  /** Called once when the sound has ended on its own or been stopped. */
  onEnd?: () => void;
}

export interface RingHandle {
  stop(): void;
}

// ---- building blocks -------------------------------------------------------------------------------------------

interface Voice {
  freq: number;
  start: number;
  dur: number;
  type?: OscillatorType;
  gain: number;
  attack?: number;
  /** Seconds the exponential decay takes; defaults to `dur`. */
  decay?: number;
}

function voice(ctx: AudioContext, out: AudioNode, v: Voice): OscillatorNode {
  const t = ctx.currentTime + v.start;
  const attack = v.attack ?? 0.004;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = v.type ?? 'sine';
  osc.frequency.setValueAtTime(v.freq, t);
  if (attack > 0) {
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(v.gain, t + attack);
  } else {
    amp.gain.setValueAtTime(v.gain, t);
  }
  amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + (v.decay ?? v.dur));
  osc.connect(amp);
  amp.connect(out);
  osc.start(t);
  osc.stop(t + v.dur + attack);
  return osc;
}

const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

/** A short burst of filtered noise: the hammer of a bell, the mallet of a marimba. */
function click(ctx: AudioContext, out: AudioNode, start: number, gain: number, freq: number, dur = 0.01): void {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.05), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  const t = ctx.currentTime + start;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  source.connect(filter);
  filter.connect(amp);
  amp.connect(out);
  source.start(t);
  source.stop(t + dur + 0.01);
}

// ---- the sounds: each schedules one cycle and returns its length in seconds --------------------------------------

type Pattern = (ctx: AudioContext, out: AudioNode) => number;

/** Two small bells struck alternately, fast, then a pause: the classic wind-up alarm clock. */
const alarmClock: Pattern = (ctx, out) => {
  const bells = [2200, 2600];
  const partials: [number, number][] = [
    [1, 0.14],
    [2.4, 0.07],
    [4.1, 0.035],
  ];
  const strikes = Math.round(1.2 * 18);
  for (let i = 0; i < strikes; i++) {
    const start = i / 18;
    for (const [ratio, gain] of partials) voice(ctx, out, { freq: bells[i % 2] * ratio, start, dur: 0.07, gain, attack: 0.002, decay: 0.06 });
    click(ctx, out, start, 0.05, 4500);
  }
  return 1.6;
};

/** A singing bowl: three partials, each doubled with a slightly detuned twin so they beat slowly. */
const bowl: Pattern = (ctx, out) => {
  const partials: [number, number][] = [
    [220, 0.07],
    [528, 0.04],
    [1010, 0.022],
  ];
  for (const [freq, gain] of partials) {
    for (const detune of [-1.5, 1.5]) voice(ctx, out, { freq: freq + detune, start: 0, dur: 5, gain, attack: 0.05 });
  }
  return 5;
};

/** Three rising mallet notes (C5, E5, G5). */
const marimba: Pattern = (ctx, out) => {
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const start = i * 0.3;
    voice(ctx, out, { freq, start, dur: 0.9, gain: 0.24, attack: 0.003 });
    voice(ctx, out, { freq: freq * 4, start, dur: 0.15, gain: 0.06, attack: 0.003 });
    click(ctx, out, start, 0.06, freq * 2);
  });
  return 1.5;
};

/** Five notes of a pentatonic scale in random order, each with bell partials and a long ring. */
const chime: Pattern = (ctx, out) => {
  const scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760];
  for (let i = scale.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [scale[i], scale[j]] = [scale[j], scale[i]];
  }
  scale.forEach((freq, i) => {
    const start = i * 0.25;
    const dur = 1.5 + Math.random();
    const partials: [number, number][] = [
      [1, 0.08],
      [2.76, 0.03],
      [5.4, 0.014],
    ];
    for (const [ratio, gain] of partials) voice(ctx, out, { freq: freq * ratio, start, dur: dur / (ratio > 1 ? 2 : 1), gain, attack: 0.003 });
  });
  return 2.5;
};

/** Pairs of quick rising chirps, with a touch of vibrato. */
const birds: Pattern = (ctx, out) => {
  // Two pairs of chirps, the last one sometimes a single.
  const chirps = [0, 0.14, 0.9];
  if (Math.random() < 0.5) chirps.push(1.04);
  for (const start of chirps) {
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const vibrato = ctx.createOscillator();
    const depth = ctx.createGain();
    osc.frequency.setValueAtTime(2500, t);
    osc.frequency.exponentialRampToValueAtTime(4000, t + 0.08);
    vibrato.frequency.value = 55;
    depth.gain.value = 120;
    vibrato.connect(depth);
    depth.connect(osc.frequency);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.2, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(amp);
    amp.connect(out);
    osc.start(t);
    vibrato.start(t);
    osc.stop(t + 0.1);
    vibrato.stop(t + 0.1);
  }
  return 2;
};

/** A deep gong: an inharmonic stack that swells, then dies away while a low-pass sweeps down. */
const gong: Pattern = (ctx, out) => {
  const t = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3000, t);
  filter.frequency.exponentialRampToValueAtTime(400, t + 6);
  filter.connect(out);
  const partials: [number, number][] = [
    [1, 0.16],
    [1.6, 0.08],
    [2.3, 0.055],
    [3.1, 0.03],
  ];
  partials.forEach(([ratio, gain], i) => voice(ctx, filter, { freq: 80 * ratio, start: 0, dur: 6, gain, attack: 0.15, decay: 6 / (1 + i * 0.5) }));
  return 6;
};

/** One note of the original square/sawtooth beeps. */
function beeps(ctx: AudioContext, out: AudioNode, count: number, step: number, dur: number, type: OscillatorType, gain: number, freq: (i: number) => number): number {
  for (let i = 0; i < count; i++) voice(ctx, out, { freq: freq(i), start: i * step, dur, type, gain, attack: 0 });
  return count * step;
}

const digital: Pattern = (ctx, out) => beeps(ctx, out, 10, 0.2, 0.1, 'square', 0.35, () => 1200);
const classic: Pattern = (ctx, out) => beeps(ctx, out, 10, 0.2, 0.2, 'square', 0.32, (i) => (i % 2 === 0 ? 880 : 1108.7));
const siren: Pattern = (ctx, out) => beeps(ctx, out, 10, 0.2, 0.2, 'sawtooth', 0.3, (i) => (i % 2 === 0 ? 600 : 1400));
const buzzer: Pattern = (ctx, out) => beeps(ctx, out, 5, 0.4, 0.35, 'sawtooth', 0.35, () => 220);

const PATTERNS: Record<BellSoundId, Pattern> = { alarmClock, bowl, marimba, chime, birds, gong, digital, classic, siren, buzzer };

// ---- optional recorded sample for the alarm clock ----------------------------------------------------------------

let sample: Promise<AudioBuffer | null> | undefined;

function loadSample(ctx: AudioContext): Promise<AudioBuffer | null> {
  sample ??= fetch(SAMPLE_URL)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error('no sample'))))
    .then((data) => ctx.decodeAudioData(data))
    .catch(() => null);
  return sample;
}

/** Starts fetching what the chosen sound needs (only the alarm clock has anything), so the first ring is not late. */
export function prepare(ctx: AudioContext, id: BellSoundId): void {
  if (id === 'alarmClock') void loadSample(ctx);
}

// ---- ring ------------------------------------------------------------------------------------------------------

/**
 * Plays a sound once, or repeats it until `stop()` or 60 s. If the context cannot be running (the browser blocked
 * audio without a user gesture) it gives up quietly and still calls `onEnd`.
 */
export function ring(ctx: AudioContext, id: BellSoundId, { loop, onEnd }: RingOptions): RingHandle {
  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  let ended = false;
  let cycleTimer: ReturnType<typeof setTimeout> | undefined;
  const capTimer = setTimeout(() => handle.stop(), MAX_RING_MS);
  const startedAt = Date.now();

  const finish = (fade: boolean): void => {
    if (ended) return;
    ended = true;
    clearTimeout(cycleTimer);
    clearTimeout(capTimer);
    if (fade) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + STOP_FADE_S);
      setTimeout(() => master.disconnect(), STOP_FADE_S * 1000 + 40);
    } else {
      master.disconnect();
    }
    onEnd?.();
  };

  const handle: RingHandle = { stop: () => finish(true) };

  const cycle = (buffer: AudioBuffer | null): void => {
    if (ended) return;
    let seconds: number;
    if (buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(master);
      source.start();
      seconds = buffer.duration;
    } else {
      seconds = PATTERNS[id](ctx, master);
    }
    cycleTimer = setTimeout(() => {
      if (loop && Date.now() - startedAt < MAX_RING_MS) cycle(buffer);
      else finish(false);
    }, seconds * 1000);
  };

  const run = async (): Promise<void> => {
    const running = (): boolean => ctx.state === 'running';
    if (!running()) {
      // Give a resume() that is already in flight a moment; if audio is still blocked there is nothing to play.
      await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 400))]);
      if (!running()) return finish(false);
    }
    const buffer = id === 'alarmClock' ? await Promise.race([loadSample(ctx), new Promise<null>((resolve) => setTimeout(resolve, 400, null))]) : null;
    cycle(buffer);
  };
  run().catch(() => finish(false));

  return handle;
}
