<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div class="general-backlog">
    <p class="general-backlog__hint">{{ t('planningLab.generalBacklogHint') }}</p>
    <p class="general-backlog__empty">{{ t('planningLab.generalBacklogEmpty') }}</p>
  </div>
</template>

<style scoped>
.general-backlog {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  background-color: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  border-top: 4px solid var(--color-quadrant-eliminate);
  padding: 1rem;
  min-height: 220px;
}

.general-backlog__hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.general-backlog__empty {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
</style>
