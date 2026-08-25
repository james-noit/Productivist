<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectsStore } from '../stores/projects'
import { useTodosStore } from '../stores/todos'
import { useMultitaskStore } from '../stores/multitask'
import ProjectForm from './ProjectForm.vue'
import TodoForm from './TodoForm.vue'
import QuadrantCountBadges from './QuadrantCountBadges.vue'
import type { Project } from '../types/project'
import type { Priority, Todo } from '../types/todo'
import type { QuadrantCounts } from '../lib/eisenhower'

const props = defineProps<{
  project: Project
  multitaskMode?: boolean
  isTaskPickable?: (todoId: string) => boolean
  onPickTask?: (todoId: string) => void
  quadrantCounts?: QuadrantCounts
}>()

const { t } = useI18n()
const projects = useProjectsStore()
const todos = useTodosStore()
const multitask = useMultitaskStore()

const expanded = ref(false)
const editing = ref(false)
const expandedMilestones = ref<Set<string>>(new Set())
const newMilestoneName = ref('')
const addingTaskMilestoneId = ref<string | null>(null)
const pickingMilestoneId = ref<string | null>(null)
const editingTaskId = ref<string | null>(null)
const editTitle = ref('')
const editImportance = ref<Priority>('medium')
const editUrgency = ref<Priority>('medium')
const editTags = ref('')
const tagSuggestionsId = useId()

const milestones = computed(() => projects.milestonesForProject(props.project.id))

const taskCount = computed(
  () => todos.todos.filter((todo) => !todo.done && todo.projectId === props.project.id).length,
)

function milestoneTasks(milestoneId: string) {
  return todos.sortTasks(todos.todos.filter((todo) => !todo.done && todo.milestoneId === milestoneId))
}

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

function toggleMilestone(id: string) {
  const next = new Set(expandedMilestones.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedMilestones.value = next
}

function saveEdit(data: { icon: string; name: string; description: string; notes: string }) {
  projects.updateProject(props.project.id, data)
  editing.value = false
}

function deleteProject() {
  if (!window.confirm(t('projects.deleteConfirm'))) return
  projects.removeProject(props.project.id)
}

function addMilestone() {
  const trimmed = newMilestoneName.value.trim()
  if (!trimmed) return
  const milestone = projects.addMilestone(props.project.id, trimmed)
  expandedMilestones.value = new Set(expandedMilestones.value).add(milestone.id)
  newMilestoneName.value = ''
}

function deleteMilestone(id: string) {
  if (!window.confirm(t('projects.deleteMilestoneConfirm'))) return
  projects.removeMilestone(id)
}

function assignExisting(todoId: string, milestoneId: string) {
  todos.assignToMilestone(todoId, props.project.id, milestoneId)
}

function isPickable(todoId: string): boolean {
  return props.isTaskPickable ? props.isTaskPickable(todoId) : !multitask.assignedTaskIds.has(todoId)
}

function pickTask(todoId: string) {
  if (props.onPickTask) props.onPickTask(todoId)
  else multitask.addCard(todoId)
}
</script>

<template>
  <div class="project-tree">
    <div class="project-tree__header">
      <button type="button" class="project-tree__toggle" @click="expanded = !expanded">
        <span class="project-tree__chevron" :class="{ 'project-tree__chevron--open': expanded }" aria-hidden="true">▸</span>
        <span class="project-tree__icon" aria-hidden="true">{{ project.icon }}</span>
        <span class="project-tree__name">{{ project.name }}</span>
      </button>
      <QuadrantCountBadges v-if="quadrantCounts" class="project-tree__badges" :counts="quadrantCounts" />
      <span v-else class="project-tree__count">{{ taskCount }}</span>
      <div class="project-tree__actions">
        <button type="button" :aria-label="t('projects.edit')" :title="t('projects.edit')" @click="editing = !editing">✎</button>
        <button type="button" class="project-tree__delete" :aria-label="t('projects.delete')" :title="t('projects.delete')" @click="deleteProject">✕</button>
      </div>
    </div>

    <ProjectForm v-if="editing" :project="project" @save="saveEdit" @cancel="editing = false" />

    <div v-if="expanded" class="project-tree__body">
      <p v-if="project.description" class="project-tree__description">{{ project.description }}</p>
      <p v-if="project.notes" class="project-tree__notes">{{ project.notes }}</p>

      <p v-if="!milestones.length" class="project-tree__empty">{{ t('projects.noMilestones') }}</p>

      <div v-for="milestone in milestones" :key="milestone.id" class="milestone-tree">
        <div class="milestone-tree__header">
          <button type="button" class="milestone-tree__toggle" @click="toggleMilestone(milestone.id)">
            <span
              class="milestone-tree__chevron"
              :class="{ 'milestone-tree__chevron--open': expandedMilestones.has(milestone.id) }"
              aria-hidden="true"
            >
              ▸
            </span>
            <span class="milestone-tree__name">{{ milestone.name }}</span>
            <span class="milestone-tree__count">{{ milestoneTasks(milestone.id).length }}</span>
          </button>
          <button type="button" class="milestone-tree__delete" :aria-label="t('projects.delete')" @click="deleteMilestone(milestone.id)">
            ✕
          </button>
        </div>

        <div v-if="expandedMilestones.has(milestone.id)" class="milestone-tree__body">
          <TransitionGroup
            v-if="milestoneTasks(milestone.id).length"
            tag="ul"
            name="task-toss"
            class="milestone-tree__tasks"
          >
            <li v-for="todo in milestoneTasks(milestone.id)" :key="todo.id" class="milestone-task">
              <form v-if="editingTaskId === todo.id" class="milestone-task__edit-form" @submit.prevent="saveTaskEdit(todo.id)">
                <input v-model="editTitle" type="text" class="milestone-task__edit-title" />
                <div class="milestone-task__edit-row">
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
                  class="milestone-task__edit-title"
                  :list="tagSuggestionsId"
                  :placeholder="t('todo.tagsPlaceholder')"
                />
                <datalist :id="tagSuggestionsId">
                  <option v-for="tag in todos.allTags" :key="tag" :value="tag" />
                </datalist>
                <div class="milestone-task__edit-actions">
                  <button type="submit">{{ t('projects.save') }}</button>
                  <button type="button" @click="cancelTaskEdit">{{ t('projects.cancel') }}</button>
                </div>
              </form>
              <template v-else>
                <div class="milestone-task__main">
                  <input type="checkbox" :checked="todo.done" @change="todos.toggleDone(todo.id)" />
                  <span class="milestone-task__title">{{ todo.title }}</span>
                  <button
                    type="button"
                    class="milestone-task__edit"
                    :aria-label="t('projects.edit')"
                    :title="t('projects.edit')"
                    @click="startTaskEdit(todo)"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    class="milestone-task__unassign"
                    :aria-label="t('projects.unassign')"
                    :title="t('projects.unassign')"
                    @click="todos.unassignFromProject(todo.id)"
                  >
                    ✕
                  </button>
                </div>
                <div class="milestone-task__meta">
                  <div class="milestone-task__badges">
                    <span class="badge" :class="`badge--${todo.importance}`">{{ t(`todo.${todo.importance}`) }}</span>
                    <span class="badge" :class="`badge--${todo.urgency}`">{{ t(`todo.${todo.urgency}`) }}</span>
                    <span v-for="tag in todo.tags" :key="tag" class="badge badge--tag">{{ tag }}</span>
                  </div>
                  <button
                    v-if="multitaskMode && isPickable(todo.id)"
                    type="button"
                    class="milestone-task__assign"
                    :aria-label="t('multitask.assignToCard')"
                    :title="t('multitask.assignToCard')"
                    @click="pickTask(todo.id)"
                  >
                    +
                  </button>
                  <span v-else-if="multitaskMode" class="milestone-task__in-grid">{{ t('multitask.inGrid') }}</span>
                </div>
              </template>
            </li>
          </TransitionGroup>
          <p v-else class="project-tree__empty">{{ t('projects.noMilestoneTasks') }}</p>

          <div class="milestone-tree__footer">
            <button type="button" @click="addingTaskMilestoneId = addingTaskMilestoneId === milestone.id ? null : milestone.id">
              {{ t('projects.addTask') }}
            </button>
            <button
              v-if="todos.unassignedTodos.length"
              type="button"
              @click="pickingMilestoneId = pickingMilestoneId === milestone.id ? null : milestone.id"
            >
              {{ t('projects.pickExisting') }}
            </button>
          </div>

          <TodoForm v-if="addingTaskMilestoneId === milestone.id" :project-id="project.id" :milestone-id="milestone.id" />

          <ul v-if="pickingMilestoneId === milestone.id" class="milestone-tree__pool">
            <li v-if="!todos.unassignedTodos.length" class="project-tree__empty">{{ t('projects.noUnassigned') }}</li>
            <li v-for="todo in todos.unassignedTodos" :key="todo.id" class="milestone-task">
              <span class="milestone-task__title">{{ todo.title }}</span>
              <button type="button" @click="assignExisting(todo.id, milestone.id)">+</button>
            </li>
          </ul>
        </div>
      </div>

      <form class="project-tree__add-milestone" @submit.prevent="addMilestone">
        <input v-model="newMilestoneName" type="text" :placeholder="t('projects.milestoneNamePlaceholder')" />
        <button type="submit">{{ t('projects.addMilestone') }}</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.project-tree {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.project-tree__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.project-tree__toggle {
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

.project-tree__chevron {
  display: inline-block;
  transition: transform 0.15s;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.project-tree__chevron--open {
  transform: rotate(90deg);
}

.project-tree__icon {
  flex-shrink: 0;
}

.project-tree__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-tree__count {
  flex-shrink: 0;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  background-color: var(--color-surface-alt);
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
}

.project-tree__badges {
  flex-shrink: 0;
}

.project-tree__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.3rem;
  flex-shrink: 0;
  min-width: 4.8rem;
}

.project-tree__actions button {
  min-width: 2.25rem;
  min-height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  padding: 0.2rem 0.5rem;
}

.project-tree__delete {
  color: var(--color-high);
}

.project-tree__body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-left: 0.75rem;
}

@media (min-width: 480px) {
  .project-tree__body {
    padding-left: 1.6rem;
  }
}

.project-tree__description {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.project-tree__notes {
  margin: 0;
  background-color: var(--color-surface-alt);
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  white-space: pre-wrap;
  font-size: 0.85rem;
  color: var(--color-text);
}

.project-tree__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}

.milestone-tree {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.milestone-tree__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.milestone-tree__toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: none;
  color: var(--color-text);
  padding: 0.15rem 0;
  text-align: left;
}

.milestone-tree__chevron {
  display: inline-block;
  transition: transform 0.15s;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.milestone-tree__chevron--open {
  transform: rotate(90deg);
}

.milestone-tree__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.milestone-tree__count {
  flex-shrink: 0;
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.milestone-tree__delete {
  flex-shrink: 0;
  min-width: 2.25rem;
  min-height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--color-text-muted);
}

.milestone-tree__body {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-left: 0.6rem;
}

@media (min-width: 480px) {
  .milestone-tree__body {
    padding-left: 1.4rem;
  }
}

.milestone-tree__tasks {
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

.milestone-task {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
}

.milestone-task__main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.milestone-task__meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  padding-left: 1.65rem;
}

.milestone-task__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.milestone-task__edit {
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

.milestone-task__badges {
  display: flex;
  gap: 0.3rem;
  flex-shrink: 0;
}

.milestone-task__assign {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border: none;
  border-radius: 50%;
  font-size: 1rem;
  line-height: 1;
}

.milestone-task__in-grid {
  flex-shrink: 0;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.milestone-task__unassign {
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

.milestone-task__edit-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.milestone-task__edit-title {
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
}

.milestone-task__edit-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.milestone-task__edit-row select {
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
}

.milestone-task__edit-actions {
  display: flex;
  gap: 0.4rem;
}

.milestone-task__edit-actions button {
  border-radius: 4px;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
}

.milestone-task__edit-actions button[type='submit'] {
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border: none;
}

.milestone-task__edit-actions button[type='button'] {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.milestone-tree__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.milestone-tree__footer button {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
}

.milestone-tree__pool {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.project-tree__add-milestone {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.project-tree__add-milestone input {
  flex: 1 1 8rem;
  min-width: 0;
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
}

.project-tree__add-milestone button {
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
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
