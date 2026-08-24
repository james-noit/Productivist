import { defineStore } from 'pinia'
import { useLocalStorage } from '../composables/useLocalStorage'

export type AppView = 'planning-lab' | 'pomodoro' | 'eisenhower'

export const useViewStore = defineStore('view', () => {
  const current = useLocalStorage<AppView>('productivist.activeView', 'planning-lab')

  function setView(view: AppView) {
    current.value = view
  }

  function reset() {
    current.value = 'planning-lab'
  }

  return {
    current,
    setView,
    reset,
  }
})
