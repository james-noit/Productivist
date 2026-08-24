<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMultitaskStore } from '../stores/multitask'

const { t } = useI18n()
const multitask = useMultitaskStore()

function onToggle() {
  if (multitask.enabled) multitask.setEnabled(false)
  else multitask.enableWithCurrentTask()
}
</script>

<template>
  <button
    type="button"
    class="multitask-toggle"
    role="switch"
    :aria-checked="multitask.enabled"
    :aria-label="t('multitask.toggleLabel')"
    :class="{ 'multitask-toggle--on': multitask.enabled }"
    @click="onToggle"
  >
    <span class="multitask-toggle__label">{{ t('multitask.toggleLabel') }}</span>
    <span class="multitask-toggle__track">
      <span class="multitask-toggle__thumb"></span>
    </span>
  </button>
</template>

<style scoped>
.multitask-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  color: var(--color-text);
  padding: 0.4rem;
  border-radius: 4px;
  font-size: 0.85rem;
}

.multitask-toggle:hover {
  background-color: var(--color-surface-alt);
}

.multitask-toggle__label {
  white-space: nowrap;
}

.multitask-toggle__track {
  position: relative;
  width: 2.25rem;
  height: 1.25rem;
  border-radius: 999px;
  background-color: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.multitask-toggle__thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background-color: var(--color-text);
  transition: transform 0.2s;
}

.multitask-toggle--on .multitask-toggle__track {
  background: var(--gradient-accent, var(--color-primary));
  border-color: var(--color-primary);
}

.multitask-toggle--on .multitask-toggle__thumb {
  background-color: var(--color-primary-contrast);
  transform: translateX(1rem);
}
</style>
