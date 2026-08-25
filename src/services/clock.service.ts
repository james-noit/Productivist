import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { SettingsService, type BellSoundId } from './settings.service';

export type ClockMode = 'focus' | 'break';

interface ClockPersistShape {
  mode: ClockMode;
  running: boolean;
  endAt: number | null;
  remainingSeconds: number;
}

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playNote(
  ctx: AudioContext,
  frequency: number,
  startDelay: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.3,
): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const startTime = ctx.currentTime + startDelay;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(gain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

export function playSound(id: BellSoundId): void {
  const ctx = getAudioCtx();
  if (id === 'digital') {
    for (let i = 0; i < 10; i++) {
      playNote(ctx, 1200, i * 0.2, 0.1, 'square', 0.35);
    }
  } else if (id === 'classic') {
    for (let i = 0; i < 10; i++) {
      playNote(ctx, i % 2 === 0 ? 880 : 1108.7, i * 0.2, 0.2, 'square', 0.32);
    }
  } else if (id === 'siren') {
    for (let i = 0; i < 10; i++) {
      playNote(ctx, i % 2 === 0 ? 600 : 1400, i * 0.2, 0.2, 'sawtooth', 0.3);
    }
  } else if (id === 'buzzer') {
    for (let i = 0; i < 5; i++) {
      playNote(ctx, 220, i * 0.4, 0.35, 'sawtooth', 0.35);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly settings = inject(SettingsService);
  private readonly translate = inject(TranslateService);

  readonly mode = signal<ClockMode>('focus');
  readonly running = signal(false);
  readonly sessionModalOpen = signal(false);
  readonly lastFocusEndAt = signal<number | null>(null);

  private intervalId: ReturnType<typeof setInterval> | undefined;
  private hasTicked = false;
  // Wall-clock deadline for the current session (ms since epoch). Remaining time
  // is always derived from this against Date.now(), so a throttled or hidden
  // tab can never make the clock run slow.
  private endAt: number | null = null;
  private restoring = true;

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
    if (this.running()) return;
    if (this.mode() === 'focus') this.settings.setFocusSeconds(this.settings.focusSeconds() + deltaSeconds);
    else this.settings.setBreakSeconds(this.settings.breakSeconds() + deltaSeconds);
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

  private tick(): void {
    if (this.endAt === null) return;
    const remaining = Math.max(0, Math.ceil((this.endAt - Date.now()) / 1000));
    if (remaining <= 0) {
      if (!this.hasTicked) {
        this.hasTicked = true;
        this.pause();
        if (this.settings.bellSound()) playSound(this.settings.bellSoundId());
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
    if (this.running() || this.remainingSeconds() <= 0) return;
    this.ensureNotificationPermission();
    this.endAt = Date.now() + this.remainingSeconds() * 1000;
    this.running.set(true);
    this.intervalId = setInterval(() => this.tick(), 250);
    this.persistState();
  }

  pause(): void {
    if (this.running() && this.endAt !== null) this.remainingSeconds.set(this.computedRemaining());
    this.running.set(false);
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = undefined;
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
        this.intervalId = setInterval(() => this.tick(), 250);
      } else {
        // Session finished while the app was closed: prompt the next phase.
        this.switchToNextMode();
      }
    } else {
      this.remainingSeconds.set(stored.remainingSeconds);
    }
  }

  startNextSession(): void {
    this.sessionModalOpen.set(false);
    this.start();
  }

  dismissSessionModal(): void {
    this.sessionModalOpen.set(false);
  }
}
