<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTodosStore } from '../stores/todos'
import { useProjectsStore } from '../stores/projects'
import { useLocalStorage } from '../composables/useLocalStorage'
import EisenhowerCard from './EisenhowerCard.vue'
import TaskDetailModal from './TaskDetailModal.vue'
import NewTaskModal from './NewTaskModal.vue'
import type { Todo, Priority } from '../types/todo'
import type { EisenhowerQuadrant, EisenhowerViewMode } from '../types/eisenhower'

const { t } = useI18n()
const todos = useTodosStore()
const projects = useProjectsStore()

const viewMode = useLocalStorage<EisenhowerViewMode>('productivist.eisenhowerViewMode', 'detailed')

const activeTodos = computed(() => todos.sortTasks(todos.todos.filter((todo) => !todo.done)))

const isImportant = (todo: Todo) => todo.importance === 'high'
const isUrgent = (todo: Todo) => todo.urgency === 'high'

const doFirst = computed(() => activeTodos.value.filter((todo) => isImportant(todo) && isUrgent(todo)))
const schedule = computed(() => activeTodos.value.filter((todo) => isImportant(todo) && !isUrgent(todo)))
const delegate = computed(() => activeTodos.value.filter((todo) => !isImportant(todo) && isUrgent(todo)))
const eliminate = computed(() => activeTodos.value.filter((todo) => !isImportant(todo) && !isUrgent(todo)))

interface ProjectGroup {
  key: string
  name: string
  icon?: string
  todos: Todo[]
}

function groupByProject(list: Todo[]): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>()
  for (const todo of list) {
    const key = todo.projectId ?? '__none__'
    if (!groups.has(key)) {
      const project = todo.projectId ? projects.projects.find((p) => p.id === todo.projectId) : undefined
      groups.set(key, {
        key,
        name: project ? project.name : t('eisenhower.noProject'),
        icon: project?.icon,
        todos: [],
      })
    }
    groups.get(key)!.todos.push(todo)
  }
  return Array.from(groups.values())
}

const quadrantTargets: Record<EisenhowerQuadrant, { importance: Priority; urgency: Priority }> = {
  doFirst: { importance: 'high', urgency: 'high' },
  schedule: { importance: 'high', urgency: 'low' },
  delegate: { importance: 'low', urgency: 'high' },
  eliminate: { importance: 'low', urgency: 'low' },
}

function onDrop(quadrant: EisenhowerQuadrant) {
  const id = todos.draggedId
  if (!id) return
  todos.updateTodo(id, quadrantTargets[quadrant])
  todos.endDrag()
}

const selectedTodoId = ref<string | null>(null)
const selectedTodo = computed(() => todos.todos.find((todo) => todo.id === selectedTodoId.value) ?? null)

function openDetail(id: string) {
  selectedTodoId.value = id
}

function closeDetail() {
  selectedTodoId.value = null
}

const activeQuadrant = ref<EisenhowerQuadrant | null>(null)

function openNewTask(quadrant: EisenhowerQuadrant) {
  activeQuadrant.value = quadrant
}

function closeNewTask() {
  activeQuadrant.value = null
}
</script>

<template>
  <main class="eisenhower-view">
    <div class="eisenhower-view__header">
      <h2>{{ t('eisenhower.title') }}</h2>
      <div class="eisenhower-view__modes" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="viewMode === 'detailed'"
          :class="{ active: viewMode === 'detailed' }"
          :title="t('eisenhower.viewDetailed')"
          :aria-label="t('eisenhower.viewDetailed')"
          @click="viewMode = 'detailed'"
        >
          ⊞
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="viewMode === 'compact'"
          :class="{ active: viewMode === 'compact' }"
          :title="t('eisenhower.viewCompact')"
          :aria-label="t('eisenhower.viewCompact')"
          @click="viewMode = 'compact'"
        >
          ☰
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="viewMode === 'minimal'"
          :class="{ active: viewMode === 'minimal' }"
          :title="t('eisenhower.viewMinimal')"
          :aria-label="t('eisenhower.viewMinimal')"
          @click="viewMode = 'minimal'"
        >
          ≡
        </button>
      </div>
    </div>

    <p v-if="!activeTodos.length" class="eisenhower-view__empty">{{ t('todo.empty') }}</p>
    <div v-else class="eisenhower-view__grid" :class="`eisenhower-view__grid--${viewMode}`">
      <section
        class="eisenhower-quadrant eisenhower-quadrant--do-first"
        @dragover.prevent
        @drop="onDrop('doFirst')"
      >
        <header class="eisenhower-quadrant__header">
          <h3>{{ t('eisenhower.doFirst') }}</h3>
          <span class="eisenhower-quadrant__hint">{{ t('eisenhower.doFirstHint') }}</span>
          <button type="button" class="eisenhower-quadrant__add" :aria-label="t('eisenhower.addTaskToQuadrant')" @click="openNewTask('doFirst')">+</button>
        </header>
        <ul v-if="viewMode === 'detailed'" class="eisenhower-quadrant__list">
          <EisenhowerCard v-for="todo in doFirst" :key="todo.id" :todo="todo" :view-mode="viewMode" @open="openDetail" />
          <li v-if="!doFirst.length" class="eisenhower-quadrant__empty">{{ t('eisenhower.empty') }}</li>
        </ul>
        <div v-else class="eisenhower-quadrant__groups">
          <div v-for="group in groupByProject(doFirst)" :key="group.key" class="eisenhower-quadrant__group">
            <span class="eisenhower-quadrant__group-name">
              <span v-if="group.icon" aria-hidden="true">{{ group.icon }}</span>
              {{ group.name }}
            </span>
            <ul class="eisenhower-quadrant__list">
              <EisenhowerCard v-for="todo in group.todos" :key="todo.id" :todo="todo" :view-mode="viewMode" @open="openDetail" />
            </ul>
          </div>
          <p v-if="!doFirst.length" class="eisenhower-quadrant__empty">{{ t('eisenhower.empty') }}</p>
        </div>
      </section>

      <section
        class="eisenhower-quadrant eisenhower-quadrant--schedule"
        @dragover.prevent
        @drop="onDrop('schedule')"
      >
        <header class="eisenhower-quadrant__header">
          <h3>{{ t('eisenhower.schedule') }}</h3>
          <span class="eisenhower-quadrant__hint">{{ t('eisenhower.scheduleHint') }}</span>
          <button type="button" class="eisenhower-quadrant__add" :aria-label="t('eisenhower.addTaskToQuadrant')" @click="openNewTask('schedule')">+</button>
        </header>
        <ul v-if="viewMode === 'detailed'" class="eisenhower-quadrant__list">
          <EisenhowerCard v-for="todo in schedule" :key="todo.id" :todo="todo" :view-mode="viewMode" @open="openDetail" />
          <li v-if="!schedule.length" class="eisenhower-quadrant__empty">{{ t('eisenhower.empty') }}</li>
        </ul>
        <div v-else class="eisenhower-quadrant__groups">
          <div v-for="group in groupByProject(schedule)" :key="group.key" class="eisenhower-quadrant__group">
            <span class="eisenhower-quadrant__group-name">
              <span v-if="group.icon" aria-hidden="true">{{ group.icon }}</span>
              {{ group.name }}
            </span>
            <ul class="eisenhower-quadrant__list">
              <EisenhowerCard v-for="todo in group.todos" :key="todo.id" :todo="todo" :view-mode="viewMode" @open="openDetail" />
            </ul>
          </div>
          <p v-if="!schedule.length" class="eisenhower-quadrant__empty">{{ t('eisenhower.empty') }}</p>
        </div>
      </section>

      <section
        class="eisenhower-quadrant eisenhower-quadrant--delegate"
        @dragover.prevent
        @drop="onDrop('delegate')"
      >
        <header class="eisenhower-quadrant__header">
          <h3>{{ t('eisenhower.delegate') }}</h3>
          <span class="eisenhower-quadrant__hint">{{ t('eisenhower.delegateHint') }}</span>
          <button type="button" class="eisenhower-quadrant__add" :aria-label="t('eisenhower.addTaskToQuadrant')" @click="openNewTask('delegate')">+</button>
        </header>
        <ul v-if="viewMode === 'detailed'" class="eisenhower-quadrant__list">
          <EisenhowerCard v-for="todo in delegate" :key="todo.id" :todo="todo" :view-mode="viewMode" @open="openDetail" />
          <li v-if="!delegate.length" class="eisenhower-quadrant__empty">{{ t('eisenhower.empty') }}</li>
        </ul>
        <div v-else class="eisenhower-quadrant__groups">
          <div v-for="group in groupByProject(delegate)" :key="group.key" class="eisenhower-quadrant__group">
            <span class="eisenhower-quadrant__group-name">
              <span v-if="group.icon" aria-hidden="true">{{ group.icon }}</span>
              {{ group.name }}
            </span>
            <ul class="eisenhower-quadrant__list">
              <EisenhowerCard v-for="todo in group.todos" :key="todo.id" :todo="todo" :view-mode="viewMode" @open="openDetail" />
            </ul>
          </div>
          <p v-if="!delegate.length" class="eisenhower-quadrant__empty">{{ t('eisenhower.empty') }}</p>
        </div>
      </section>

      <section
        class="eisenhower-quadrant eisenhower-quadrant--eliminate"
        @dragover.prevent
        @drop="onDrop('eliminate')"
      >
        <header class="eisenhower-quadrant__header">
          <h3>{{ t('eisenhower.eliminate') }}</h3>
          <span class="eisenhower-quadrant__hint">{{ t('eisenhower.eliminateHint') }}</span>
          <button type="button" class="eisenhower-quadrant__add" :aria-label="t('eisenhower.addTaskToQuadrant')" @click="openNewTask('eliminate')">+</button>
        </header>
        <ul v-if="viewMode === 'detailed'" class="eisenhower-quadrant__list">
          <EisenhowerCard v-for="todo in eliminate" :key="todo.id" :todo="todo" :view-mode="viewMode" @open="openDetail" />
          <li v-if="!eliminate.length" class="eisenhower-quadrant__empty">{{ t('eisenhower.empty') }}</li>
        </ul>
        <div v-else class="eisenhower-quadrant__groups">
          <div v-for="group in groupByProject(eliminate)" :key="group.key" class="eisenhower-quadrant__group">
            <span class="eisenhower-quadrant__group-name">
              <span v-if="group.icon" aria-hidden="true">{{ group.icon }}</span>
              {{ group.name }}
            </span>
            <ul class="eisenhower-quadrant__list">
              <EisenhowerCard v-for="todo in group.todos" :key="todo.id" :todo="todo" :view-mode="viewMode" @open="openDetail" />
            </ul>
          </div>
          <p v-if="!eliminate.length" class="eisenhower-quadrant__empty">{{ t('eisenhower.empty') }}</p>
        </div>
      </section>

      <span class="eisenhower-view__axis eisenhower-view__axis--urgent-top">{{ t('eisenhower.axisUrgent') }}</span>
      <span class="eisenhower-view__axis eisenhower-view__axis--urgent-bottom">{{ t('eisenhower.axisNotUrgent') }}</span>
      <span class="eisenhower-view__axis eisenhower-view__axis--important-left">{{ t('eisenhower.axisImportant') }}</span>
    </div>

    <TaskDetailModal v-if="selectedTodo" :todo="selectedTodo" @close="closeDetail" />
    
    <NewTaskModal v-if="activeQuadrant" :quadrant="activeQuadrant" @close="closeNewTask" />
  </main>
</template>

<style scoped>
.eisenhower-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
}

.eisenhower-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.eisenhower-view h2 {
  margin: 0;
}

.eisenhower-view__modes {
  display: flex;
  gap: 0.35rem;
}

.eisenhower-view__modes button {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  min-width: 2.25rem;
  min-height: 2.25rem;
  font-size: 1.1rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.eisenhower-view__modes button.active {
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border-color: var(--color-primary);
}

.eisenhower-view__empty {
  color: var(--color-text-muted);
}

.eisenhower-view__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: 1fr 1fr;
  gap: 0.75rem;
  position: relative;
}

.eisenhower-quadrant {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background-color: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.75rem;
  min-height: 160px;
  min-width: 0;
  border-top: 4px solid var(--color-border);
}

.eisenhower-view__grid--minimal .eisenhower-quadrant {
  padding: 0.5rem;
  gap: 0.3rem;
}

.eisenhower-quadrant--do-first {
  border-top-color: var(--color-quadrant-do-first);
}

.eisenhower-quadrant--schedule {
  border-top-color: var(--color-quadrant-schedule);
}

.eisenhower-quadrant--delegate {
  border-top-color: var(--color-quadrant-delegate);
}

.eisenhower-quadrant--eliminate {
  border-top-color: var(--color-quadrant-eliminate);
}

.eisenhower-quadrant__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.eisenhower-quadrant__add {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  border: none;
  border-radius: 4px;
  width: 1.75rem;
  height: 1.75rem;
  font-size: 1.2rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-left: auto;
  flex-shrink: 0;
}

.eisenhower-quadrant__add:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.eisenhower-quadrant__header h3 {
  margin: 0;
  font-size: 0.95rem;
  min-width: 0;
}

.eisenhower-quadrant__hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eisenhower-quadrant__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow-y: auto;
}

.eisenhower-view__grid--minimal .eisenhower-quadrant__list {
  gap: 0.15rem;
}

.eisenhower-quadrant__empty {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin: 0;
}

.eisenhower-quadrant__groups {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  overflow-y: auto;
}

.eisenhower-view__grid--minimal .eisenhower-quadrant__groups {
  gap: 0.3rem;
}

.eisenhower-quadrant__group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.eisenhower-quadrant__group-name {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.eisenhower-view__axis {
  display: none;
}

@media (max-width: 600px) {
  .eisenhower-view {
    padding: 0.75rem 0.5rem;
    gap: 0.75rem;
  }

  .eisenhower-view__grid {
    gap: 0.5rem;
  }

  .eisenhower-quadrant {
    min-height: 0;
    padding: 0.5rem;
    gap: 0.35rem;
  }

  .eisenhower-quadrant__list,
  .eisenhower-quadrant__groups {
    gap: 0.25rem;
  }
}

@media (min-width: 700px) {
  .eisenhower-view__grid {
    padding: 1.5rem 0 0 4.5rem;
  }

  .eisenhower-view__axis {
    display: block;
    position: absolute;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--color-text-muted);
    letter-spacing: 0.02em;
  }

  .eisenhower-view__axis--urgent-top {
    top: 0;
    left: 4.5rem;
    right: 0;
    text-align: center;
  }

  .eisenhower-view__axis--urgent-bottom {
    bottom: -1.25rem;
    left: 4.5rem;
    right: 0;
    text-align: center;
  }

  .eisenhower-view__axis--important-left {
    top: 1.5rem;
    bottom: 0;
    left: 0;
    width: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    writing-mode: vertical-lr;
    transform: rotate(180deg);
  }

}
</style>
