<script setup lang="ts">
import { watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from './stores/settings'
import { useMultitaskStore } from './stores/multitask'
import { useViewStore } from './stores/view'
import AppHeader from './components/AppHeader.vue'
import PomodoroClock from './components/PomodoroClock.vue'
import TodoList from './components/TodoList.vue'
import MultitaskView from './components/MultitaskView.vue'
import EisenhowerView from './components/EisenhowerView.vue'
import PlanningLabView from './components/PlanningLabView.vue'

const settings = useSettingsStore()
const multitask = useMultitaskStore()
const view = useViewStore()
const { locale } = useI18n()

watchEffect(() => {
  document.documentElement.setAttribute('data-theme', settings.theme)
})

watchEffect(() => {
  locale.value = settings.language
  document.documentElement.setAttribute('lang', settings.language)
})
</script>

<template>
  <AppHeader />
  <PlanningLabView v-if="view.current === 'planning-lab'" />
  <EisenhowerView v-else-if="view.current === 'eisenhower'" />
  <MultitaskView v-else-if="multitask.enabled" />
  <main v-else class="main-view">
    <PomodoroClock class="main-view__clock" />
    <TodoList class="main-view__todos" />
  </main>
</template>

<style scoped>
.main-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
}

@media (min-width: 800px) {
  .main-view {
    flex-direction: row;
    align-items: flex-start;
  }

  .main-view__clock {
    flex: 1 1 40%;
  }

  .main-view__todos {
    flex: 1 1 60%;
  }
}
</style>
