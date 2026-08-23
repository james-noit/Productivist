import { defineStore } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocalStorage } from '../composables/useLocalStorage'
import { useSettingsStore } from './settings'
import type { BellSoundId } from './settings'

export type ClockMode = 'focus' | 'break'

interface ClockPersistShape {
  mode: ClockMode
  running: boolean
  endAt: number | null
  remainingSeconds: number
}

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function playNote(
  ctx: AudioContext,
  frequency: number,
  startDelay: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.3,
) {
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()
  const startTime = ctx.currentTime + startDelay

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startTime)

  gainNode.gain.setValueAtTime(gain, startTime)
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.start(startTime)
  oscillator.stop(startTime + duration)
}

export function playSound(id: BellSoundId) {
  const ctx = getAudioCtx()
  if (id === 'digital') {
    for (let i = 0; i < 10; i++) {
      playNote(ctx, 1200, i * 0.2, 0.1, 'square', 0.35)
    }
  } else if (id === 'classic') {
    for (let i = 0; i < 10; i++) {
      playNote(ctx, i % 2 === 0 ? 880 : 1108.7, i * 0.2, 0.2, 'square', 0.32)
    }
  } else if (id === 'siren') {
    for (let i = 0; i < 10; i++) {
      playNote(ctx, i % 2 === 0 ? 600 : 1400, i * 0.2, 0.2, 'sawtooth', 0.3)
    }
  } else if (id === 'buzzer') {
    for (let i = 0; i < 5; i++) {
      playNote(ctx, 220, i * 0.4, 0.35, 'sawtooth', 0.35)
    }
  }
}

export const useClockStore = defineStore('clock', () => {
  const settings = useSettingsStore()
  const { t } = useI18n()

  const mode = ref<ClockMode>('focus')
  const running = ref(false)
  let intervalId: ReturnType<typeof setInterval> | undefined
  let hasTicked = false
  // Wall-clock deadline for the current session (ms since epoch). Remaining time
  // is always derived from this against Date.now(), so a throttled or hidden
  // tab can never make the clock run slow.
  let endAt: number | null = null

  const durationSeconds = computed(() =>
    mode.value === 'focus' ? settings.focusSeconds : settings.breakSeconds,
  )
  const totalSeconds = computed(() => durationSeconds.value)
  const remainingSeconds = ref(totalSeconds.value)

  // Persisted so the timer survives a page refresh. Written only on
  // state transitions (start/pause/reset/switch), never on every tick.
  const persist = useLocalStorage<ClockPersistShape>('productivist.clock', {
    mode: 'focus',
    running: false,
    endAt: null,
    remainingSeconds: totalSeconds.value,
  })

  function persistState() {
    persist.value = {
      mode: mode.value,
      running: running.value,
      endAt,
      remainingSeconds: remainingSeconds.value,
    }
  }

  function adjustDuration(deltaSeconds: number) {
    if (running.value) return
    if (mode.value === 'focus') settings.setFocusSeconds(settings.focusSeconds + deltaSeconds)
    else settings.setBreakSeconds(settings.breakSeconds + deltaSeconds)
  }

  const sessionModalOpen = ref(false)
  const lastFocusEndAt = ref<number | null>(null)

  function ensureNotificationPermission() {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }

  function sendNotification(finishedMode: ClockMode) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const body = finishedMode === 'focus' ? t('clock.notificationBodyFocus') : t('clock.notificationBodyBreak')
    new Notification(t('clock.notificationTitle'), { body })
  }

  function computedRemaining(): number {
    if (endAt === null) return remainingSeconds.value
    return Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
  }

  function tick() {
    if (endAt === null) return
    const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
    if (remaining <= 0) {
      if (!hasTicked) {
        hasTicked = true
        pause()
        if (settings.bellSound) playSound(settings.bellSoundId)
        sendNotification(mode.value)
        switchToNextMode()
      }
      return
    }
    remainingSeconds.value = remaining
  }

  function switchToNextMode() {
    const wasFocus = mode.value === 'focus'
    mode.value = mode.value === 'focus' ? 'break' : 'focus'
    hasTicked = false
    remainingSeconds.value = totalSeconds.value
    sessionModalOpen.value = true
    if (wasFocus) lastFocusEndAt.value = Date.now()
    persistState()
  }

  function start() {
    if (running.value || remainingSeconds.value <= 0) return
    ensureNotificationPermission()
    endAt = Date.now() + remainingSeconds.value * 1000
    running.value = true
    intervalId = setInterval(tick, 250)
    persistState()
  }

  function pause() {
    if (running.value && endAt !== null) remainingSeconds.value = computedRemaining()
    running.value = false
    if (intervalId) clearInterval(intervalId)
    intervalId = undefined
    endAt = null
    persistState()
  }

  function reset() {
    hasTicked = false
    pause()
    remainingSeconds.value = totalSeconds.value
    persistState()
  }

  function setMode(next: ClockMode) {
    hasTicked = false
    pause()
    mode.value = next
    remainingSeconds.value = totalSeconds.value
    persistState()
  }

  // Keep the non-running remainder in sync when the configured duration or the
  // active mode changes (the [mode, totalSeconds] watcher). Skipped while a
  // session is running and while we are still restoring a persisted state, so a
  // restored paused remainder is not clobbered.
  let restoring = true
  watch([mode, totalSeconds], () => {
    if (!running.value && !restoring) {
      remainingSeconds.value = totalSeconds.value
      persistState()
    }
  })

  function restorePersistedState() {
    const stored = persist.value
    mode.value = stored.mode
    if (stored.running && stored.endAt !== null) {
      if (stored.endAt > Date.now()) {
        endAt = stored.endAt
        remainingSeconds.value = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
        running.value = true
        intervalId = setInterval(tick, 250)
      } else {
        // Session finished while the app was closed: prompt the next phase.
        switchToNextMode()
      }
    } else {
      remainingSeconds.value = stored.remainingSeconds
    }
  }

  restorePersistedState()

  // Release the restore guard after Vue has settled the initial watcher flush,
  // so the [mode, totalSeconds] watcher does not overwrite the restored state.
  void nextTick(() => {
    restoring = false
  })

  function startNextSession() {
    sessionModalOpen.value = false
    start()
  }

  function dismissSessionModal() {
    sessionModalOpen.value = false
  }

  return {
    mode,
    running,
    remainingSeconds,
    durationSeconds,
    totalSeconds,
    sessionModalOpen,
    lastFocusEndAt,
    ensureNotificationPermission,
    start,
    pause,
    reset,
    setMode,
    adjustDuration,
    startNextSession,
    dismissSessionModal,
  }
})
