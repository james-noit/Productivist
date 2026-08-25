<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTodosStore } from '../stores/todos'
import QuadrantCountBadges from './QuadrantCountBadges.vue'
import TodoForm from './TodoForm.vue'
import { countByQuadrant } from '../lib/eisenhower'
import type { Priority, Todo } from '../types/todo'

const { t } = useI18n()
const todos = useTodosStore()

const expanded = ref(false)
const addingTask = ref(false)
const editingTaskId = ref<string | null>(null)
const editTitle = ref('')
const editImportance = ref<Priority>('medium')
const editUrgency = ref<Priority>('medium')
const editTags = ref('')
const tagSuggestionsId = useId()

const tasks = computed(() => todos.unassignedTodos)
const counts = computed(() => countByQuadrant(tasks.value))

function startTaskEdit(todo: Todo) {
  editingTaskId.value = todo.id
  editTitle.value = todo.title
  editImportance.value = todo.importance
  editUrgency.value = todo.urgency
  editTags.value = todo.tags.join(', ')
}

function cancelTaskEdit() {
  editingTaskId.value = null
}

function saveTaskEdit(id: string) {
  const trimmed = editTitle.value.trim()
  if (!trimmed) return
  const tags = editTags.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  todos.updateTodo(id, { title: trimmed, importance: editImportance.value, urgency: editUrgency.value, tags })
  editingTaskId.value = null
}
</script>

<template>
  <div class="free-tasks">
    <div class="free-tasks__header">
      <button type="button" class="free-tasks__toggle" @click="expanded = !expanded">
        <span class="free-tasks__chevron" :class="{ 'free-tasks__chevron--open': expanded }" aria-hidden="true">▸</span>
        <span class="free-tasks__icon" aria-hidden="true">📥</span>
        <span class="free-tasks__name">{{ t('planningLab.freeTasks') }}</span>
      </button>
      <QuadrantCountBadges class="free-tasks__badges" :counts="counts" />
      <div class="free-tasks__actions-spacer" aria-hidden="true"></div>
    </div>

    <div v-if="expanded" class="free-tasks__body">
      <p v-if="!tasks.length" class="free-tasks__empty">{{ t('projects.noUnassigned') }}</p>

      <TransitionGroup v-else tag="ul" name="task-toss" class="free-tasks__list">
        <li v-for="todo in tasks" :key="todo.id" class="free-task">
          <form v-if="editingTaskId === todo.id" class="free-task__edit-form" @submit.prevent="saveTaskEdit(todo.id)">
            <input v-model="editTitle" type="text" class="free-task__edit-title" />
            <div class="free-task__edit-row">
              <select v-model="editImportance">
                <option value="low">{{ t('todo.low') }}</option>
                <option value="medium">{{ t('todo.medium') }}</option>
                <option value="high">{{ t('todo.high') }}</option>
              </select>
              <select v-model="editUrgency">
                <option value="low">{{ t('todo.low') }}</option>
                <option value="medium">{{ t('todo.medium') }}</option>
                <option value="high">{{ t('todo.high') }}</option>
              </select>
            </div>
            <input
              v-model="editTags"
              type="text"
              class="free-task__edit-title"
              :list="tagSuggestionsId"
              :placeholder="t('todo.tagsPlaceholder')"
            />
            <datalist :id="tagSuggestionsId">
              <option v-for="tag in todos.allTags" :key="tag" :value="tag" />
            </datalist>
            <div class="free-task__edit-actions">
              <button type="submit">{{ t('projects.save') }}</button>
              <button type="button" @click="cancelTaskEdit">{{ t('projects.cancel') }}</button>
            </div>
          </form>
          <template v-else>
            <div class="free-task__main">
              <input type="checkbox" :checked="todo.done" @change="todos.toggleDone(todo.id)" />
              <span class="free-task__title">{{ todo.title }}</span>
              <button
                type="button"
                class="free-task__edit"
                :aria-label="t('projects.edit')"
                :title="t('projects.edit')"
                @click="startTaskEdit(todo)"
              >
                ✎
              </button>
            </div>
            <div class="free-task__meta">
              <span class="badge" :class="`badge--${todo.importance}`">{{ t(`todo.${todo.importance}`) }}</span>
              <span class="badge" :class="`badge--${todo.urgency}`">{{ t(`todo.${todo.urgency}`) }}</span>
              <span v-for="tag in todo.tags" :key="tag" class="badge badge--tag">{{ tag }}</span>
            </div>
          </template>
        </li>
      </TransitionGroup>

      <div class="free-tasks__footer">
        <button type="button" @click="addingTask = !addingTask">{{ t('projects.addTask') }}</button>
      </div>
      <TodoForm v-if="addingTask" />
    </div>
  </div>
</template>

<style scoped>
.free-tasks {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.free-tasks__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.free-tasks__toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  color: var(--color-text);
  padding: 0.2rem 0;
  text-align: left;
}

.free-tasks__chevron {
  display: inline-block;
  transition: transform 0.15s;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.free-tasks__chevron--open {
  transform: rotate(90deg);
}

.free-tasks__icon {
  flex-shrink: 0;
}

.free-tasks__name {
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.free-tasks__badges {
  flex-shrink: 0;
}

.free-tasks__actions-spacer {
  flex-shrink: 0;
  min-width: 4.8rem;
}

.free-tasks__body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-left: 0.75rem;
}

@media (min-width: 480px) {
  .free-tasks__body {
    padding-left: 1.6rem;
  }
}

.free-tasks__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.free-tasks__list {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.task-toss-move {
  transition: transform 0.35s ease;
}

.task-toss-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.task-toss-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.task-toss-leave-active {
  transition: opacity 0.45s cubic-bezier(0.55, 0, 1, 0.45), transform 0.45s cubic-bezier(0.55, 0, 1, 0.45);
  position: absolute;
  width: 100%;
}

.task-toss-leave-to {
  opacity: 0;
  transform: translateX(70px) rotate(14deg) scale(0.85);
}

.free-task {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
}

.free-task__main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.free-task__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.free-task__edit {
  flex-shrink: 0;
  min-width: 2rem;
  min-height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-muted);
}

.free-task__meta {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  padding-left: 1.65rem;
}

.free-task__edit-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.free-task__edit-title {
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
}

.free-task__edit-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.free-task__edit-row select {
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
}

.free-task__edit-actions {
  display: flex;
  gap: 0.4rem;
}

.free-task__edit-actions button {
  border-radius: 4px;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
}

.free-task__edit-actions button[type='submit'] {
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border: none;
}

.free-task__edit-actions button[type='button'] {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.free-tasks__footer {
  display: flex;
}

.free-tasks__footer button {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
}

.badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background-color: var(--color-surface-alt);
  color: var(--color-text-muted);
}

.badge--low {
  background-color: var(--color-low);
  color: #fff;
}

.badge--medium {
  background-color: var(--color-medium);
  color: #fff;
}

.badge--high {
  background-color: var(--color-high);
  color: #fff;
}
</style>
