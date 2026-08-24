<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useLocalStorage } from '../composables/useLocalStorage'
import DailyBacklogView from './DailyBacklogView.vue'
import GeneralBacklogView from './GeneralBacklogView.vue'

type PlanningLabTab = 'daily' | 'general'

const { t } = useI18n()
const tab = useLocalStorage<PlanningLabTab>('productivist.planningLabTab', 'daily')
</script>

<template>
  <main class="planning-lab">
    <div class="planning-lab__header">
      <h2>{{ t('planningLab.title') }}</h2>
      <div class="planning-lab__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'daily'"
          :class="{ active: tab === 'daily' }"
          @click="tab = 'daily'"
        >
          {{ t('planningLab.dailyBacklog') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'general'"
          :class="{ active: tab === 'general' }"
          @click="tab = 'general'"
        >
          {{ t('planningLab.generalBacklog') }}
        </button>
      </div>
    </div>

    <DailyBacklogView v-if="tab === 'daily'" />
    <GeneralBacklogView v-else />
  </main>
</template>

<style scoped>
.planning-lab {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
}

.planning-lab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.planning-lab__header h2 {
  margin: 0;
}

.planning-lab__tabs {
  display: flex;
  gap: 0.5rem;
}

.planning-lab__tabs button {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  padding: 0.35rem 1rem;
}

.planning-lab__tabs button.active {
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border-color: var(--color-primary);
}
</style>
