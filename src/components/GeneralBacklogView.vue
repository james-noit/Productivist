<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTodosStore } from '../stores/todos'
import { useProjectsStore } from '../stores/projects'
import { QUADRANTS, countByQuadrant } from '../lib/eisenhower'
import FreeTasksCard from './FreeTasksCard.vue'
import ProjectTreeItem from './ProjectTreeItem.vue'
import type { Project } from '../types/project'
import type { QuadrantCounts } from '../lib/eisenhower'

const { t } = useI18n()
const todos = useTodosStore()
const projects = useProjectsStore()

const activeTodos = computed(() => todos.todos.filter((todo) => !todo.done))

const combinedTotal = computed(() => activeTodos.value.length)
const combinedCounts = computed(() => countByQuadrant(activeTodos.value))

// Ordered red (doFirst) > yellow (delegate) > blue (schedule) > grey (eliminate),
// each descending, matching the priority a project's most urgent work implies.
interface ProjectRow {
  project: Project
  counts: QuadrantCounts
}

const projectRows = computed<ProjectRow[]>(() => {
  const rows: ProjectRow[] = projects.sortedProjects.map((project) => ({
    project,
    counts: countByQuadrant(activeTodos.value.filter((todo) => todo.projectId === project.id)),
  }))
  return rows.sort((a, b) => {
    if (b.counts.doFirst !== a.counts.doFirst) return b.counts.doFirst - a.counts.doFirst
    if (b.counts.delegate !== a.counts.delegate) return b.counts.delegate - a.counts.delegate
    if (b.counts.schedule !== a.counts.schedule) return b.counts.schedule - a.counts.schedule
    return b.counts.eliminate - a.counts.eliminate
  })
})

const isEmpty = computed(() => activeTodos.value.length === 0 && projects.sortedProjects.length === 0)
</script>

<template>
  <div class="general-backlog">
    <p class="general-backlog__hint">{{ t('planningLab.generalBacklogHint') }}</p>

    <p v-if="isEmpty" class="general-backlog__empty">{{ t('planningLab.generalBacklogEmpty') }}</p>
    <template v-else>
      <div class="general-backlog__table-wrap">
        <table class="general-backlog__table">
          <thead>
            <tr>
              <th class="general-backlog__col-name">{{ t('planningLab.project') }}</th>
              <th class="general-backlog__col-total">{{ t('planningLab.totalTasks') }}</th>
              <th
                v-for="q in QUADRANTS"
                :key="q.key"
                class="general-backlog__col-quadrant"
                :class="`general-backlog__col-quadrant--${q.cssKey}`"
              >
                {{ t(q.labelKey) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr class="general-backlog__row general-backlog__row--combined">
              <td class="general-backlog__name">{{ t('planningLab.allProjectsCombined') }}</td>
              <td class="general-backlog__total">{{ combinedTotal }}</td>
              <td v-for="q in QUADRANTS" :key="q.key" class="general-backlog__count-cell">
                <span
                  class="general-backlog__count"
                  :class="`general-backlog__count--${q.cssKey}`"
                  :title="t(q.labelKey)"
                >
                  {{ combinedCounts[q.key] }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="general-backlog__cards">
        <FreeTasksCard />
        <ProjectTreeItem
          v-for="row in projectRows"
          :key="row.project.id"
          :project="row.project"
          :quadrant-counts="row.counts"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.general-backlog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
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

.general-backlog__table-wrap {
  overflow-x: auto;
}

.general-backlog__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.general-backlog__table th {
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-muted);
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.general-backlog__col-total,
.general-backlog__col-quadrant {
  text-align: center;
}

.general-backlog__col-quadrant--do-first {
  color: var(--color-quadrant-do-first);
}

.general-backlog__col-quadrant--schedule {
  color: var(--color-quadrant-schedule);
}

.general-backlog__col-quadrant--delegate {
  color: var(--color-quadrant-delegate);
}

.general-backlog__col-quadrant--eliminate {
  color: var(--color-quadrant-eliminate);
}

.general-backlog__row td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
}

.general-backlog__row--combined {
  font-weight: 600;
  background-color: var(--color-surface-alt);
}

.general-backlog__name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}

.general-backlog__total,
.general-backlog__count-cell {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.general-backlog__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  font-size: 0.75rem;
  color: var(--color-text);
  background-color: var(--color-surface-alt);
}

.general-backlog__count--do-first {
  background-color: color-mix(in srgb, var(--color-quadrant-do-first) 22%, transparent);
  color: var(--color-quadrant-do-first);
}

.general-backlog__count--schedule {
  background-color: color-mix(in srgb, var(--color-quadrant-schedule) 22%, transparent);
  color: var(--color-quadrant-schedule);
}

.general-backlog__count--delegate {
  background-color: color-mix(in srgb, var(--color-quadrant-delegate) 22%, transparent);
  color: var(--color-quadrant-delegate);
}

.general-backlog__count--eliminate {
  background-color: color-mix(in srgb, var(--color-quadrant-eliminate) 22%, transparent);
  color: var(--color-quadrant-eliminate);
}

.general-backlog__cards {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
</style>
