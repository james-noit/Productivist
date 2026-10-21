import { computed, signal, type Signal } from '@angular/core';
import type { ClockService } from '../../services/clock.service';
import type { SportaskService } from '../../services/sportask.service';

/**
 * What the break modal needs from "the thing that counts the block's time". The Pomodoro's break is counted by the clock
 * (`ClockBlockDriver`, the modal's behaviour since phase 4); a block started with *Train now* has no break to ride on, so it
 * counts itself (`LocalBlockDriver`). The modal only talks to this interface.
 */
export interface BlockDriver {
  /** Seconds of the block left, and its length. */
  readonly remaining: Signal<number>;
  readonly total: Signal<number>;
  readonly running: Signal<boolean>;
  /** The block's time is over (or it was finished early): the results come next. */
  readonly ended: Signal<boolean>;
  start(): void;
  pause(): void;
  resume(): void;
  /** Stops the countdown for good ("Finish now"). */
  finish(): void;
  dispose(): void;
}

/** The Pomodoro break: everything is the clock's. */
export class ClockBlockDriver implements BlockDriver {
  readonly remaining: Signal<number>;
  readonly total: Signal<number>;
  readonly running: Signal<boolean>;
  readonly ended: Signal<boolean>;
  private readonly clock: ClockService;

  constructor(clock: ClockService) {
    this.clock = clock;
    this.remaining = clock.remainingSeconds;
    this.total = clock.totalSeconds;
    this.running = clock.running;
    // The break is over once the clock is back in focus.
    this.ended = computed(() => clock.mode() !== 'break');
  }

  start(): void {
    this.clock.start();
  }
  pause(): void {
    this.clock.pause();
  }
  resume(): void {
    this.clock.start();
  }
  finish(): void {
    this.clock.pause();
  }
  dispose(): void {
    // Nothing of its own.
  }
}

const TICK_MS = 250;

/**
 * A countdown of its own for one block outside the Pomodoro: an `endAt` deadline against the wall clock (so a hidden tab never
 * runs slow), written into `SportaskService.single` on every transition so a reload resumes it. It never touches the clock.
 * `onEnd` runs when the time runs out by itself (not on `finish`).
 */
export class LocalBlockDriver implements BlockDriver {
  readonly remaining = signal(0);
  readonly total = signal(0);
  readonly running = signal(false);
  readonly ended = signal(false);
  private readonly sportask: SportaskService;
  private readonly onEnd: () => void;
  private endAt: number | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(sportask: SportaskService, onEnd: () => void) {
    this.sportask = sportask;
    this.onEnd = onEnd;
    const s = sportask.single();
    this.total.set(s?.blockSeconds ?? 0);
    this.remaining.set(Math.max(0, Math.min(s?.left ?? 0, s?.blockSeconds ?? 0)));
    this.ended.set(s?.ended === true);
    if (s && !s.ended && s.endAt !== null) {
      // Restored in the middle of a running block: carry on, or finish if the deadline passed while the app was closed.
      this.endAt = s.endAt;
      const left = this.secondsLeft();
      this.remaining.set(left);
      if (left > 0) this.run();
      else this.expire(false);
    }
  }

  private secondsLeft(): number {
    return this.endAt === null ? this.remaining() : Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
  }

  private persist(): void {
    this.sportask.single.update((s) => (s ? { ...s, endAt: this.endAt, left: this.remaining(), ended: this.ended() } : s));
  }

  private run(): void {
    this.running.set(true);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const left = this.secondsLeft();
    if (left > 0) this.remaining.set(left);
    else this.expire(true);
  }

  private expire(notify: boolean): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.endAt = null;
    this.remaining.set(0);
    this.running.set(false);
    this.ended.set(true);
    this.persist();
    if (notify) this.onEnd();
  }

  start(): void {
    if (this.running() || this.ended() || this.remaining() <= 0) return;
    this.endAt = Date.now() + this.remaining() * 1000;
    this.run();
    this.persist();
  }

  pause(): void {
    if (this.running()) this.remaining.set(this.secondsLeft());
    clearInterval(this.timer);
    this.timer = undefined;
    this.endAt = null;
    this.running.set(false);
    this.persist();
  }

  resume(): void {
    this.start();
  }

  finish(): void {
    this.pause();
    this.ended.set(true);
    this.persist();
  }

  dispose(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
