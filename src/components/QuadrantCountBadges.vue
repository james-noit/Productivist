<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { QUADRANTS, type QuadrantCounts } from '../lib/eisenhower'

defineProps<{ counts: QuadrantCounts }>()

const { t } = useI18n()
</script>

<template>
  <span class="quadrant-badges">
    <span
      v-for="q in QUADRANTS"
      :key="q.key"
      class="quadrant-badges__circle"
      :class="`quadrant-badges__circle--${q.cssKey}`"
      :title="t(q.labelKey)"
    >
      {{ counts[q.key] }}
    </span>
  </span>
</template>

<style scoped>
.quadrant-badges {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}

.quadrant-badges__circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
  background-color: var(--color-surface-alt);
  flex-shrink: 0;
}

.quadrant-badges__circle--do-first {
  background-color: color-mix(in srgb, var(--color-quadrant-do-first) 25%, transparent);
  color: var(--color-quadrant-do-first);
}

.quadrant-badges__circle--schedule {
  background-color: color-mix(in srgb, var(--color-quadrant-schedule) 25%, transparent);
  color: var(--color-quadrant-schedule);
}

.quadrant-badges__circle--delegate {
  background-color: color-mix(in srgb, var(--color-quadrant-delegate) 25%, transparent);
  color: var(--color-quadrant-delegate);
}

.quadrant-badges__circle--eliminate {
  background-color: color-mix(in srgb, var(--color-quadrant-eliminate) 25%, transparent);
  color: var(--color-quadrant-eliminate);
}
</style>
