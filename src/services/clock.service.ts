import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { localStorageSignal } from '../core/local-storage-signal';
import {
  SettingsService,
  MIN_DURATION_SECONDS,
  MAX_FOCUS_SECONDS,
  MAX_BREAK_SECONDS,
  type BellSoundId,
} from './settings.service';

type BellSounds = typeof import('../lib/bell-sounds');

export type ClockMode = 'focus' | 'break';

interface ClockPersistShape {
  mode: ClockMode;
  running: boolean;
  endAt: number | null;
  remainingSeconds: number;
}

// Remaining time is always derived from `endAt` against the wall clock, so the interval
// only has to be fine enough for the display to look smooth — it is not what keeps time.
// A whole second is enough, and re-aligning each tick to the deadline stops the visible
// digit from drifting relative to the second it represents.
const TICK_MS = 1000;

@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly settings = inject(SettingsService);
  private readonly translate = inject(TranslateService);

  readonly mode = signal<ClockMode>('focus');
  readonly running = signal(false);
  readonly sessionModalOpen = signal(false);
  readonly lastFocusEndAt = signal<number | null>(null);

  // Holds either the boundary-alignment timeout or the per-second interval; browsers
  // share one id space between the two, so a single clearTimeout cancels either.
  private tickTimer: ReturnType<typeof setTimeout> | undefined;
  private hasTicked = false;
  // Wall-clock deadline for the current session (ms since epoch). Remaining time
  // is always derived from this against Date.now(), so a throttled or hidden
  // tab can never make the clock run slow.
  private endAt: number | null = null;
  private restoring = true;

  /** True while the end-of-session sound is ringing (the header offers "Stop alarm"). */
  readonly ringing = signal(false);
  // The synthesis lives in a lazy chunk; `start()` and the previews (user gestures) load it before the bell is needed.
  private bells?: Promise<BellSounds>;
  private audioCtx: AudioContext | null = null;
  private ringHandle: { stop(): void } | null = null;
  private ringToken = 0;

  /**
   * Display and stepper state, shared by every view that renders the clock. These were
   * previously duplicated verbatim in pomodoro-clock and multitask-view.
   */
  readonly formattedTime = computed(() => {
    const remaining = this.remainingSeconds();
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });

  readonly maxDurationSeconds = computed(() =>
    this.mode() === 'focus' ? MAX_FOCUS_SECONDS : MAX_BREAK_SECONDS,
  );
  readonly canDecreaseDuration = computed(
    () => !this.running() && this.durationSeconds() > MIN_DURATION_SECONDS,
  );
  readonly canIncreaseDuration = computed(
    () => !this.running() && this.durationSeconds() < this.maxDurationSeconds(),
  );

  readonly durationSeconds = computed(() =>
    this.mode() === 'focus' ? this.settings.focusSeconds() : this.settings.breakSeconds(),
  );
  readonly totalSeconds = computed(() => this.durationSeconds());
  readonly remainingSeconds = signal(0);

  // Persisted so the timer survives a page refresh. Written only on
  // state transitions (start/pause/reset/switch), never on every tick.
  private readonly persist = localStorageSignal<ClockPersistShape>('productivist.clock', {
    mode: 'focus',
    running: false,
    endAt: null,
    remainingSeconds: this.totalSeconds(),
  });

  constructor() {
    this.remainingSeconds.set(this.totalSeconds());

    // Keep the non-running remainder in sync when the configured duration or the
    // active mode changes. Skipped while a session is running and while we are
    // still restoring a persisted state, so a restored paused remainder is not
    // clobbered.
    effect(() => {
      this.mode();
      this.totalSeconds();
      if (!this.running() && !this.restoring) {
        this.remainingSeconds.set(this.totalSeconds());
        this.persistState();
      }
    });

    this.restorePersistedState();

    // Release the restore guard once the initial effect flush has settled, so
    // the mode/totalSeconds effect above does not overwrite the restored state.
    queueMicrotask(() => {
      this.restoring = false;
    });
  }

  private persistState(): void {
    this.persist.set({
      mode: this.mode(),
      running: this.running(),
      endAt: this.endAt,
      remainingSeconds: this.remainingSeconds(),
    });
  }

  adjustDuration(deltaSeconds: number): void {
    this.stopAlarm();
    if (this.running()) return;
    if (this.mode() === 'focus') this.settings.setFocusSeconds(this.settings.focusSeconds() + deltaSeconds);
    else this.settings.setBreakSeconds(this.settings.breakSeconds() + deltaSeconds);
  }

  /**
   * The AudioContext, created and resumed here rather than in the lazy chunk: called from a click handler this
   * happens inside the user gesture, which browsers require before they let a context make sound.
   */
  private audio(): AudioContext | null {
    try {
      this.audioCtx ??= new AudioContext();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => undefined);
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  private loadBells(): Promise<BellSounds> {
    return (this.bells ??= import('../lib/bell-sounds'));
  }

  /** Rings a sound (loading its chunk first) and keeps `ringing` true until it ends or `stopAlarm()` cuts it. */
  private ring(id: BellSoundId, loop: boolean): void {
    const ctx = this.audio();
    if (!ctx) return;
    const token = ++this.ringToken;
    this.ringing.set(true);
    const end = (): void => {
      if (token !== this.ringToken) return;
      this.ringHandle = null;
      this.ringing.set(false);
    };
    this.loadBells().then((bells) => {
      if (token === this.ringToken) this.ringHandle = bells.ring(ctx, id, { loop, onEnd: end });
    }, end);
  }

  /** One cycle of a sound, for the settings panel: never loops. */
  preview(id: BellSoundId): void {
    this.stopAlarm();
    this.ring(id, false);
  }

  /** Silences the alarm; every user action on the clock calls it. */
  stopAlarm(): void {
    this.ringToken++;
    this.ringHandle?.stop();
    this.ringHandle = null;
    if (this.ringing()) this.ringing.set(false);
  }

  ensureNotificationPermission(): void {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }

  private sendNotification(finishedMode: ClockMode): void {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const body = this.translate.instant(
      finishedMode === 'focus' ? 'clock.notificationBodyFocus' : 'clock.notificationBodyBreak',
    );
    new Notification(this.translate.instant('clock.notificationTitle'), { body });
  }

  private computedRemaining(): number {
    if (this.endAt === null) return this.remainingSeconds();
    return Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
  }

  private startTicking(): void {
    this.stopTicking();
    // Fire on the boundary of the next whole second remaining, then every second after,
    // so the displayed digit changes at the moment it actually changes.
    const msIntoSecond = this.endAt === null ? 0 : (this.endAt - Date.now()) % TICK_MS;
    this.tickTimer = setTimeout(() => {
      this.tick();
      this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    }, msIntoSecond);
  }

  private stopTicking(): void {
    if (this.tickTimer !== undefined) clearTimeout(this.tickTimer);
    this.tickTimer = undefined;
  }

  private tick(): void {
    if (this.endAt === null) return;
    const remaining = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
    if (remaining <= 0) {
      if (!this.hasTicked) {
        this.hasTicked = true;
        this.pause();
        if (this.settings.bellSound()) this.ring(this.settings.bellSoundId(), this.settings.bellLoop());
        this.sendNotification(this.mode());
        this.switchToNextMode();
      }
      return;
    }
    this.remainingSeconds.set(remaining);
  }

  private switchToNextMode(): void {
    const wasFocus = this.mode() === 'focus';
    this.mode.set(wasFocus ? 'break' : 'focus');
    this.hasTicked = false;
    this.remainingSeconds.set(this.totalSeconds());
    this.sessionModalOpen.set(true);
    if (wasFocus) this.lastFocusEndAt.set(Date.now());
    this.persistState();
  }

  start(): void {
    this.stopAlarm();
    if (this.running() || this.remainingSeconds() <= 0) return;
    this.ensureNotificationPermission();
    // A user gesture: get the audio ready so the bell can sound later (the chunk, the context, the sample).
    const ctx = this.audio();
    if (ctx) this.loadBells().then((bells) => bells.prepare(ctx, this.settings.bellSoundId()), () => undefined);
    this.endAt = Date.now() + this.remainingSeconds() * 1000;
    this.running.set(true);
    this.startTicking();
    this.persistState();
  }

  pause(): void {
    this.stopAlarm();
    if (this.running() && this.endAt !== null) this.remainingSeconds.set(this.computedRemaining());
    this.running.set(false);
    this.stopTicking();
    this.endAt = null;
    this.persistState();
  }

  reset(): void {
    this.hasTicked = false;
    this.pause();
    this.remainingSeconds.set(this.totalSeconds());
    this.persistState();
  }

  setMode(next: ClockMode): void {
    this.hasTicked = false;
    this.pause();
    this.mode.set(next);
    this.remainingSeconds.set(this.totalSeconds());
    this.persistState();
  }

  private restorePersistedState(): void {
    const stored = this.persist();
    this.mode.set(stored.mode);
    if (stored.running && stored.endAt !== null) {
      if (stored.endAt > Date.now()) {
        this.endAt = stored.endAt;
        this.remainingSeconds.set(Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000)));
        this.running.set(true);
        this.startTicking();
      } else {
        // Session finished while the app was closed: prompt the next phase.
        this.switchToNextMode();
      }
    } else {
      this.remainingSeconds.set(stored.remainingSeconds);
    }
  }

  startNextSession(): void {
    this.stopAlarm();
    this.sessionModalOpen.set(false);
    this.start();
  }

  dismissSessionModal(): void {
    this.stopAlarm();
    this.sessionModalOpen.set(false);
  }
}
