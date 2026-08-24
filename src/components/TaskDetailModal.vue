<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTodosStore } from '../stores/todos'
import { useProjectsStore } from '../stores/projects'
import type { Priority, Todo } from '../types/todo'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const todos = useTodosStore()
const projects = useProjectsStore()

const ICONS = ['📁', '📌', '🚀', '🎯', '📚', '💼', '🛠️', '🎨', '🧪', '🏗️', '🌱', '🔥']

const title = ref(props.todo.title)
const description = ref(props.todo.description ?? '')
const importance = ref<Priority>(props.todo.importance)
const urgency = ref<Priority>(props.todo.urgency)
const tagsInput = ref(props.todo.tags.join(', '))
const pomodorosForTermination = ref(props.todo.pomodorosForTermination?.toString() ?? '')

const projectRef = ref<string>(props.todo.projectId ?? '')
const milestoneRef = ref<string>(props.todo.milestoneId ?? '')

const showNewProject = ref(false)
const chosenIcon = ref(ICONS[0])
const projectName = ref('')

const showNewMilestone = ref(false)
const milestoneName = ref('')

watch(
  () => props.todo.id,
  () => {
    title.value = props.todo.title
    description.value = props.todo.description ?? ''
    importance.value = props.todo.importance
    urgency.value = props.todo.urgency
    tagsInput.value = props.todo.tags.join(', ')
    pomodorosForTermination.value = props.todo.pomodorosForTermination?.toString() ?? ''
    projectRef.value = props.todo.projectId ?? ''
    milestoneRef.value = props.todo.milestoneId ?? ''
    showNewProject.value = false
    chosenIcon.value = ICONS[0]
    projectName.value = ''
    showNewMilestone.value = false
    milestoneName.value = ''
  },
)

const selectedProjectId = computed(() => {
  if (projectRef.value === '__new__') return undefined
  return projectRef.value || undefined
})

const showMilestones = computed(() => !!selectedProjectId.value)

const projectSelectOptions = computed(() => {
  const opts: Array<{ value: string; label: string }> = [
    { value: '', label: t('eisenhower.createTask.noProject') },
    ...projects.sortedProjects.map((p) => ({ value: p.id, label: `${p.icon} ${p.name}` })),
  ]
  opts.push({ value: '__new__', label: t('eisenhower.createTask.newProject') })
  return opts
})

const milestoneOptions = computed(() => {
  if (!selectedProjectId.value) return []
  const projectMilestones = projects.milestonesForProject(selectedProjectId.value)
  const opts: Array<{ value: string; label: string }> = [
    { value: '', label: t('eisenhower.createTask.noMilestone') },
    ...projectMilestones.map((m) => ({ value: m.id, label: m.name })),
  ]
  opts.push({ value: '__new__', label: t('eisenhower.createTask.newMilestone') })
  return opts
})

function commitTitle() {
  const trimmed = title.value.trim()
  if (!trimmed || trimmed === props.todo.title) {
    title.value = props.todo.title
    return
  }
  todos.updateTodo(props.todo.id, { title: trimmed })
}

function commitImportance() {
  todos.updateTodo(props.todo.id, { importance: importance.value })
}

function commitUrgency() {
  todos.updateTodo(props.todo.id, { urgency: urgency.value })
}

function commitTags() {
  const tags = tagsInput.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  todos.updateTodo(props.todo.id, { tags })
}

function commitDescription() {
  todos.updateTodo(props.todo.id, { description: description.value.trim() || undefined })
}

function commitPomodorosForTermination() {
  const parsed = parseInt(pomodorosForTermination.value, 10)
  todos.updateTodo(props.todo.id, {
    pomodorosForTermination: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
  })
}

function onProjectSelect() {
  if (projectRef.value === '__new__') {
    showNewProject.value = true
    showNewMilestone.value = false
    return
  }
  const projectId = projectRef.value || undefined
  if (projectId === props.todo.projectId) return
  milestoneRef.value = ''
  showNewMilestone.value = false
  todos.updateTodo(props.todo.id, { projectId, milestoneId: undefined })
}

function onMilestoneSelect() {
  if (milestoneRef.value === '__new__') {
    showNewMilestone.value = true
    return
  }
  const projectId = selectedProjectId.value
  if (!projectId) return
  const milestoneId = milestoneRef.value || undefined
  if (milestoneId === props.todo.milestoneId && projectId === props.todo.projectId) return
  todos.updateTodo(props.todo.id, { projectId, milestoneId })
}

function submitNewProject() {
  const name = projectName.value.trim()
  if (!name) return
  const created = projects.addProject({ icon: chosenIcon.value, name, description: '', notes: '' })
  showNewProject.value = false
  projectName.value = ''
  projectRef.value = created.id
  milestoneRef.value = ''
  showNewMilestone.value = false
  todos.updateTodo(props.todo.id, { projectId: created.id, milestoneId: undefined })
}

function submitNewMilestone() {
  const name = milestoneName.value.trim()
  const projectId = selectedProjectId.value
  if (!name || !projectId) return
  const created = projects.addMilestone(projectId, name)
  showNewMilestone.value = false
  milestoneName.value = ''
  milestoneRef.value = created.id
  todos.updateTodo(props.todo.id, { projectId, milestoneId: created.id })
}

function remove() {
  todos.removeTodo(props.todo.id)
  emit('close')
}
</script>

<template>
  <div class="task-detail__overlay" @click.self="emit('close')">
    <div class="task-detail__modal" role="dialog" aria-modal="true" :aria-label="t('eisenhower.taskDetail')">
      <div class="task-detail__header">
        <h3>{{ t('eisenhower.taskDetail') }}</h3>
        <button type="button" class="task-detail__close" :aria-label="t('todo.close')" @click="emit('close')">✕</button>
      </div>

      <label class="task-detail__done">
        <input type="checkbox" :checked="props.todo.done" @change="todos.toggleDone(props.todo.id)" />
        {{ t('eisenhower.markDone') }}
      </label>

      <input
        v-model="title"
        type="text"
        class="task-detail__title"
        @change="commitTitle"
      />

      <label class="task-detail__description-label">
        {{ t('todo.description') }}
        <textarea
          v-model="description"
          rows="2"
          :placeholder="t('todo.descriptionPlaceholder')"
          @change="commitDescription"
        />
      </label>

      <div class="task-detail__select-group">
        <div class="task-detail__select-label">{{ t('eisenhower.createTask.project') }}</div>
        <div class="task-detail__select-wrapper">
          <select v-model="projectRef" @change="onProjectSelect">
            <option v-for="opt in projectSelectOptions" :key="opt.value || 'none'" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div v-if="projectRef === '__new__'" class="task-detail__inline-create">
          <div class="task-detail__icons">
            <button
              v-for="icon in ICONS"
              :key="icon"
              type="button"
              class="task-detail__icon"
              :class="{ 'task-detail__icon--selected': chosenIcon === icon }"
              @click="chosenIcon = icon"
            >{{ icon }}</button>
          </div>
          <input
            v-model="projectName"
            type="text"
            :placeholder="t('eisenhower.createTask.projectName')"
            @keydown.enter.prevent="submitNewProject"
          />
          <button type="button" class="task-detail__inline-create-submit" @click="submitNewProject">
            {{ t('eisenhower.createTask.save') }}
          </button>
        </div>
      </div>

      <div class="task-detail__select-group">
        <div class="task-detail__select-label">{{ t('eisenhower.createTask.milestone') }}</div>
        <template v-if="showMilestones">
          <div class="task-detail__select-wrapper">
            <select v-model="milestoneRef" @change="onMilestoneSelect">
              <option v-for="opt in milestoneOptions" :key="opt.value || 'none'" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div v-if="milestoneRef === '__new__'" class="task-detail__inline-create">
            <input
              v-model="milestoneName"
              type="text"
              :placeholder="t('eisenhower.createTask.milestoneName')"
              @keydown.enter.prevent="submitNewMilestone"
            />
            <button type="button" class="task-detail__inline-create-submit" @click="submitNewMilestone">
              {{ t('eisenhower.createTask.save') }}
            </button>
          </div>
        </template>
        <p v-else class="task-detail__hint">{{ t('eisenhower.createTask.pickerProjectHint') }}</p>
      </div>

      <div class="task-detail__row">
        <label>
          {{ t('todo.importance') }}
          <select v-model="importance" @change="commitImportance">
            <option value="low">{{ t('todo.low') }}</option>
            <option value="medium">{{ t('todo.medium') }}</option>
            <option value="high">{{ t('todo.high') }}</option>
          </select>
        </label>
        <label>
          {{ t('todo.urgency') }}
          <select v-model="urgency" @change="commitUrgency">
            <option value="low">{{ t('todo.low') }}</option>
            <option value="medium">{{ t('todo.medium') }}</option>
            <option value="high">{{ t('todo.high') }}</option>
          </select>
        </label>
      </div>

      <label class="task-detail__tags-label">
        {{ t('todo.tags') }}
        <input v-model="tagsInput" type="text" :placeholder="t('todo.tagsPlaceholder')" @change="commitTags" />
      </label>

      <label class="task-detail__tags-label">
        {{ t('todo.pomodorosForTermination') }}
        <input
          v-model="pomodorosForTermination"
          type="number"
          min="1"
          :placeholder="t('todo.pomodorosForTerminationPlaceholder')"
          @change="commitPomodorosForTermination"
        />
      </label>

      <button type="button" class="task-detail__delete" @click="remove">{{ t('todo.delete') }}</button>
    </div>
  </div>
</template>

<style scoped>
.task-detail__overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  padding: 1rem;
}

.task-detail__modal {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 0.75rem;
  text-align: left;
}

.task-detail__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.task-detail__header h3 {
  margin: 0;
}

.task-detail__close {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  padding: 0.2rem 0.5rem;
}

.task-detail__done {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.task-detail__done input {
  width: 1.05rem;
  height: 1.05rem;
}

.task-detail__title,
.task-detail__row select,
.task-detail__tags-label input,
.task-detail__description-label textarea,
.task-detail__select-wrapper select,
.task-detail__inline-create input {
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  font-family: inherit;
}

.task-detail__description-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.task-detail__description-label textarea {
  width: 100%;
  resize: vertical;
}

.task-detail__title {
  width: 100%;
  font-size: 1rem;
  font-weight: 600;
}

.task-detail__select-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.task-detail__select-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.task-detail__select-wrapper select {
  width: 100%;
  cursor: pointer;
}

.task-detail__inline-create {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-left: 0.5rem;
}

.task-detail__icons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.task-detail__icon {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-surface-alt);
  border: 2px solid transparent;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
}

.task-detail__icon--selected {
  border-color: var(--color-primary);
}

.task-detail__inline-create-submit {
  align-self: flex-end;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  padding: 0.35rem 0.9rem;
  font-family: inherit;
  cursor: pointer;
}

.task-detail__hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  padding-left: 0.5rem;
}

.task-detail__row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.task-detail__row label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  flex: 1 1 120px;
}

.task-detail__tags-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.task-detail__delete {
  align-self: flex-start;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  padding: 0.5rem 1.25rem;
}

.task-detail__delete:hover {
  background-color: var(--color-surface-alt);
}
</style>
