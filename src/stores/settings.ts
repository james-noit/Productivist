import { defineStore } from 'pinia'
import { useLocalStorage } from '../composables/useLocalStorage'

export type Theme = 'light' | 'dark' | 'japanese' | 'nordic'
export type Language = 'en' | 'es'
export type BellSoundId = 'digital' | 'classic' | 'siren' | 'buzzer'
export type ClockStyle = 'boxes' | 'ring'
export type BoxClockOrder = 'sequential' | 'random'

export const DEFAULT_FOCUS_SECONDS = 25 * 60
export const DEFAULT_BREAK_SECONDS = 5 * 60
export const MIN_DURATION_SECONDS = 30
export const MAX_FOCUS_SECONDS = 180 * 60
export const MAX_BREAK_SECONDS = 60 * 60
export const DEFAULT_BELL_SOUND_ID: BellSoundId = 'classic'
export const DEFAULT_CLOCK_STYLE: ClockStyle = 'boxes'
export const DEFAULT_BOX_CLOCK_ORDER: BoxClockOrder = 'sequential'

function roundToStep(seconds: number, min: number, max: number): number {
  const stepped = Math.round(seconds / 30) * 30
  return Math.max(min, Math.min(max, stepped))
}

export const useSettingsStore = defineStore('settings', () => {
  const theme = useLocalStorage<Theme>('productivist.theme', 'light')
  const language = useLocalStorage<Language>('productivist.language', 'en')
  const focusSeconds = useLocalStorage<number>('productivist.focusSeconds', DEFAULT_FOCUS_SECONDS)
  const breakSeconds = useLocalStorage<number>('productivist.breakSeconds', DEFAULT_BREAK_SECONDS)
  const bellSound = useLocalStorage<boolean>('productivist.bellSound', true)
  const bellSoundId = useLocalStorage<BellSoundId>('productivist.bellSoundId', DEFAULT_BELL_SOUND_ID)
  const clockStyle = useLocalStorage<ClockStyle>('productivist.clockStyle', DEFAULT_CLOCK_STYLE)
  const boxClockOrder = useLocalStorage<BoxClockOrder>('productivist.boxClockOrder', DEFAULT_BOX_CLOCK_ORDER)

  function setTheme(next: Theme) {
    theme.value = next
  }

  function setLanguage(lang: Language) {
    language.value = lang
  }

  function setFocusSeconds(seconds: number) {
    focusSeconds.value = roundToStep(seconds, MIN_DURATION_SECONDS, MAX_FOCUS_SECONDS)
  }

  function setBreakSeconds(seconds: number) {
    breakSeconds.value = roundToStep(seconds, MIN_DURATION_SECONDS, MAX_BREAK_SECONDS)
  }

  function setBellSound(val: boolean) {
    bellSound.value = val
  }

  function setBellSoundId(id: BellSoundId) {
    bellSoundId.value = id
  }

  function setClockStyle(style: ClockStyle) {
    clockStyle.value = style
  }

  function setBoxClockOrder(order: BoxClockOrder) {
    boxClockOrder.value = order
  }

  function reset() {
    theme.value = 'light'
    language.value = 'en'
    focusSeconds.value = DEFAULT_FOCUS_SECONDS
    breakSeconds.value = DEFAULT_BREAK_SECONDS
    bellSound.value = true
    bellSoundId.value = DEFAULT_BELL_SOUND_ID
    clockStyle.value = DEFAULT_CLOCK_STYLE
    boxClockOrder.value = DEFAULT_BOX_CLOCK_ORDER
  }

  return {
    theme,
    language,
    focusSeconds,
    breakSeconds,
    bellSound,
    bellSoundId,
    clockStyle,
    boxClockOrder,
    setTheme,
    setLanguage,
    setFocusSeconds,
    setBreakSeconds,
    setBellSound,
    setBellSoundId,
    setClockStyle,
    setBoxClockOrder,
    reset,
  }
})
