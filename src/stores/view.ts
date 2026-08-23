import { defineStore } from 'pinia'
import { useLocalStorage } from '../composables/useLocalStorage'

export type AppView = 'pomodoro' | 'eisenhower'

export const useViewStore = defineStore('view', () => {
  const current = useLocalStorage<AppView>('productivist.activeView', 'pomodoro')

  function setView(view: AppView) {
    current.value = view
  }

  function reset() {
    current.value = 'pomodoro'
  }

  return {
    current,
    setView,
    reset,
  }
})
