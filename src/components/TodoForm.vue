<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTodosStore } from '../stores/todos'
import type { Priority } from '../types/todo'

const props = defineProps<{ projectId?: string; milestoneId?: string }>()
const { t } = useI18n()
const todos = useTodosStore()

const title = ref('')
const description = ref('')
const importance = ref<Priority>('medium')
const urgency = ref<Priority>('medium')
const tagsInput = ref('')
const pomodorosForTermination = ref('')
const expanded = ref(false)
const formEl = ref<HTMLFormElement | null>(null)
const titleInputEl = ref<HTMLInputElement | null>(null)

async function submit() {
  const trimmed = title.value.trim()
  if (!trimmed) return
  const tags = tagsInput.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  const pomodoros = parseInt(pomodorosForTermination.value, 10)
  todos.addTodo({
    title: trimmed,
    description: description.value.trim() || undefined,
    importance: importance.value,
    urgency: urgency.value,
    tags,
    projectId: props.projectId,
    milestoneId: props.milestoneId,
    pomodorosForTermination: Number.isFinite(pomodoros) && pomodoros > 0 ? pomodoros : undefined,
  })
  title.value = ''
  description.value = ''
  tagsInput.value = ''
  pomodorosForTermination.value = ''
  expanded.value = false
  await nextTick()
  titleInputEl.value?.focus()
}

function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (formEl.value && next && formEl.value.contains(next)) return
  expanded.value = false
}
</script>

<template>
  <form
    ref="formEl"
    class="todo-form"
    :class="{ 'todo-form--expanded': expanded }"
    @submit.prevent="submit"
    @focusin="expanded = true"
    @focusout="onFocusOut"
  >
    <input
      ref="titleInputEl"
      v-model="title"
      type="text"
      class="todo-form__title"
      :placeholder="t('todo.addPlaceholder')"
    />
    <div v-if="expanded" class="todo-form__details">
      <div class="todo-form__row">
        <label>
          {{ t('todo.importance') }}
          <select v-model="importance">
            <option value="low">{{ t('todo.low') }}</option>
            <option value="medium">{{ t('todo.medium') }}</option>
            <option value="high">{{ t('todo.high') }}</option>
          </select>
        </label>
        <label>
          {{ t('todo.urgency') }}
          <select v-model="urgency">
            <option value="low">{{ t('todo.low') }}</option>
            <option value="medium">{{ t('todo.medium') }}</option>
            <option value="high">{{ t('todo.high') }}</option>
          </select>
        </label>
      </div>
      <input v-model="tagsInput" type="text" :placeholder="t('todo.tagsPlaceholder')" />
      <textarea v-model="description" rows="2" :placeholder="t('todo.descriptionPlaceholder')" />
      <label class="todo-form__pomodoros">
        {{ t('todo.pomodorosForTermination') }}
        <input
          v-model="pomodorosForTermination"
          type="number"
          min="1"
          :placeholder="t('todo.pomodorosForTerminationPlaceholder')"
        />
      </label>
      <button type="submit">{{ t('todo.add') }}</button>
    </div>
  </form>
</template>

<style scoped>
.todo-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
}

.todo-form input,
.todo-form select,
.todo-form textarea {
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  font-family: inherit;
}

.todo-form textarea {
  width: 100%;
  resize: vertical;
}

.todo-form__pomodoros {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.todo-form__title {
  width: 100%;
}

.todo-form__details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.todo-form__row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.todo-form__row label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  flex: 1 1 120px;
}

.todo-form button {
  align-self: flex-start;
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
}
</style>
