<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectsStore } from '../stores/projects'
import { useTodosStore } from '../stores/todos'
import type { EisenhowerQuadrant } from '../types/eisenhower'
import type { Priority } from '../types/todo'

const props = defineProps<{ quadrant: EisenhowerQuadrant }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const projects = useProjectsStore()
const todos = useTodosStore()

const ICONS = ['📁', '📌', '🚀', '🎯', '📚', '💼', '🛠️', '🎨', '🧪', '🏗️', '🌱', '🔥']

const title = ref('')
const description = ref('')
const importance = ref<Priority>('medium')
const urgency = ref<Priority>('medium')
const projectRef = ref<string>('')
const milestoneRef = ref<string>('')
const pomodorosForTermination = ref('')

const showNewProject = ref(false)
const chosenIcon = ref(ICONS[0])
const projectName = ref('')

const showNewMilestone = ref(false)
const milestoneName = ref('')

const quadrantTargets: Record<EisenhowerQuadrant, { importance: Priority; urgency: Priority }> = {
  doFirst: { importance: 'high', urgency: 'high' },
  schedule: { importance: 'high', urgency: 'low' },
  delegate: { importance: 'low', urgency: 'high' },
  eliminate: { importance: 'low', urgency: 'low' },
}

function init() {
  const target = quadrantTargets[props.quadrant]
  importance.value = target.importance
  urgency.value = target.urgency
  title.value = ''
  description.value = ''
  projectRef.value = ''
  milestoneRef.value = ''
  pomodorosForTermination.value = ''
  showNewProject.value = false
  chosenIcon.value = ICONS[0]
  projectName.value = ''
  showNewMilestone.value = false
  milestoneName.value = ''
}

init()

watch(() => props.quadrant, init)

const projectSelectOptions = computed(() => {
  const opts: Array<{ value: string; label: string }> = [
    { value: '', label: t('eisenhower.createTask.noProject') },
    ...projects.sortedProjects.map((p: { id: string; icon: string; name: string }) => ({ value: p.id, label: `${p.icon} ${p.name}` })),
  ]
  opts.push({ value: '__new__', label: t('eisenhower.createTask.newProject') })
  return opts
})

const milestoneOptions = computed(() => {
  if (!selectedProjectId.value) return []
  const projectMilestones = projects.milestonesForProject(selectedProjectId.value)
  const opts: Array<{ value: string; label: string }> = [
    { value: '', label: t('eisenhower.createTask.noMilestone') },
    ...projectMilestones.map((m: { id: string; name: string }) => ({ value: m.id, label: m.name })),
  ]
  opts.push({ value: '__new__', label: t('eisenhower.createTask.newMilestone') })
  return opts
})

const selectedProjectId = computed(() => {
  if (projectRef.value === '__new__') return undefined
  return projectRef.value || undefined
})

const showMilestones = computed(() => !!selectedProjectId.value)

function handleSubmit(_e: Event) {
  const target = quadrantTargets[props.quadrant]
  const trimmedTitle = title.value.trim()
  
  if (!trimmedTitle) return
  
  let finalProjectId: string | undefined = selectedProjectId.value
  let finalMilestoneId: string | undefined = milestoneRef.value || undefined

  if (projectRef.value === '__new__' && projectName.value.trim()) {
    const createdProject = projects.addProject({
      icon: chosenIcon.value,
      name: projectName.value.trim(),
      description: '',
      notes: '',
    })
    finalProjectId = createdProject.id
  } else if (projectRef.value === '__new__') {
    return
  }

  if (showMilestones.value && milestoneRef.value === '__new__' && milestoneName.value.trim()) {
    const createdMilestone = projects.addMilestone(finalProjectId!, milestoneName.value.trim())
    finalMilestoneId = createdMilestone.id
  } else if (showMilestones.value && milestoneRef.value === '__new__') {
    return
  }

  const pomodoros = parseInt(pomodorosForTermination.value, 10)

  todos.addTodo({
    title: trimmedTitle,
    description: description.value.trim() || undefined,
    importance: target.importance,
    urgency: target.urgency,
    tags: [],
    projectId: finalProjectId,
    milestoneId: finalMilestoneId,
    pomodorosForTermination: Number.isFinite(pomodoros) && pomodoros > 0 ? pomodoros : undefined,
  })

  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

const importanceLabel = computed(() => t(`todo.${importance.value}`))
const urgencyLabel = computed(() => t(`todo.${urgency.value}`))
</script>

<template>
  <div class="new-task__overlay" @click.self="emit('close')" @keydown="handleKeydown" role="dialog" aria-modal="true">
    <form class="new-task__modal" @submit.prevent="handleSubmit">
      <div class="new-task__header">
        <h3>{{ t('eisenhower.newTaskIn', { quadrant: t(`eisenhower.${props.quadrant}`) }) }}</h3>
        <button type="button" class="new-task__close" aria-label="Close" @click="emit('close')">✕</button>
      </div>

      <div class="new-task__priority">
        <span>{{ importanceLabel }}</span>
        <span>·</span>
        <span>{{ urgencyLabel }}</span>
      </div>

      <label class="new-task__field new-task__field--title">
        <input
          v-model="title"
          type="text"
          :placeholder="t('todo.addPlaceholder')"
          autofocus
          required
        />
      </label>

      <label class="new-task__field">
        <textarea
          v-model="description"
          rows="2"
          :placeholder="t('todo.descriptionPlaceholder')"
        />
      </label>

      <label class="new-task__field new-task__field--pomodoros">
        {{ t('todo.pomodorosForTermination') }}
        <input
          v-model="pomodorosForTermination"
          type="number"
          min="1"
          :placeholder="t('todo.pomodorosForTerminationPlaceholder')"
        />
      </label>

      <div class="new-task__select-group">
        <div class="new-task__select-label">{{ t('eisenhower.createTask.project') }}</div>
        
        <div class="new-task__select-wrapper">
          <select v-model="projectRef" :required="false">
            <option v-for="opt in projectSelectOptions" :key="opt.value || 'none'" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>

        <div v-if="projectRef === '__new__'" class="new-task__inline-create">
          <div class="new-task__icons">
            <button
              v-for="icon in ICONS"
              :key="icon"
              type="button"
              class="new-task__icon"
              :class="{ 'new-task__icon--selected': chosenIcon === icon }"
              @click="chosenIcon = icon"
            >{{ icon }}</button>
          </div>
          <input
            v-model="projectName"
            type="text"
            :placeholder="t('eisenhower.createTask.projectName')"
          />
        </div>
      </div>

      <div class="new-task__select-group">
        <div class="new-task__select-label">{{ t('eisenhower.createTask.milestone') }}</div>
        
        <template v-if="showMilestones">
          <div class="new-task__select-wrapper">
            <select v-model="milestoneRef">
              <option v-for="opt in milestoneOptions" :key="opt.value || 'none'" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>

          <div v-if="milestoneRef === '__new__'" class="new-task__inline-create">
            <input
              v-model="milestoneName"
              type="text"
              :placeholder="t('eisenhower.createTask.milestoneName')"
            />
          </div>
        </template>
        <p v-else class="new-task__hint">{{ t('eisenhower.createTask.pickerProjectHint') }}</p>
      </div>

      <div class="new-task__actions">
        <button type="button" @click="emit('close')">{{ t('projects.cancel') }}</button>
        <button type="submit" class="new-task__save">{{ t('eisenhower.createTask.save') }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.new-task__overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  padding: 1rem;
}

.new-task__modal {
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

.new-task__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.new-task__header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.new-task__close {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  padding: 0.2rem 0.5rem;
  cursor: pointer;
}

.new-task__close:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.new-task__quadrant {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.new-task__priority {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  padding: 0.2rem 0;
}

.new-task__select-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.new-task__select-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.new-task__select-wrapper select {
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  font-family: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.new-task__select-wrapper select:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.new-task__field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.new-task__field input,
.new-task__field textarea {
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  font-family: inherit;
}

.new-task__field textarea {
  width: 100%;
  resize: vertical;
}

.new-task__field--title input {
  width: 100%;
  font-size: 1rem;
  font-weight: 500;
}

.new-task__field--title input:focus,
.new-task__select-wrapper select:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.new-task__inline-create {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-left: 0.5rem;
}

.new-task__icons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.new-task__icon {
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

.new-task__icon--selected {
  border-color: var(--color-primary);
}

.new-task__hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  padding-left: 0.5rem;
}

.new-task__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.25rem;
}

.new-task__actions button {
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  font-family: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.new-task__actions button:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.new-task__actions button:first-child {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.new-task__save {
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border: none;
}
</style>
