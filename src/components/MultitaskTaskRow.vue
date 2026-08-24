<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTodosStore } from '../stores/todos'
import { useMultitaskStore } from '../stores/multitask'
import { useClockStore } from '../stores/clock'
import { useProjectsStore } from '../stores/projects'
import ProjectsPanel from './ProjectsPanel.vue'
import TaskProjectTag from './TaskProjectTag.vue'
import TaskDetailModal from './TaskDetailModal.vue'
import type { AccomplishmentMark, MultitaskCard } from '../types/multitask'
import type { Priority } from '../types/todo'

const props = defineProps<{ card: MultitaskCard; borderColor: string }>()

const { t } = useI18n()
const todos = useTodosStore()
const multitask = useMultitaskStore()
const clock = useClockStore()
const projects = useProjectsStore()

const task = computed(() => todos.todos.find((todo) => todo.id === props.card.taskId) ?? null)

const project = computed(() => (task.value ? projects.projects.find((p) => p.id === task.value!.projectId) : undefined))
const milestone = computed(() => (task.value ? projects.milestones.find((m) => m.id === task.value!.milestoneId) : undefined))

const taskModalOpen = ref(false)
const showDetail = ref(false)
const titleEditing = ref(false)
const editTitle = ref('')
const pickTab = ref<'all' | 'projects'>('all')
const pickImportance = ref<Priority | 'all'>('all')
const pickUrgency = ref<Priority | 'all'>('all')
const pickTag = ref<string>('all')

function isPickable(todoId: string): boolean {
  return !multitask.assignedTaskIds.has(todoId) || todoId === props.card.taskId
}

const pickableTasks = computed(() =>
  todos.sortTasks(
    todos.todos
      .filter((todo) => !todo.done && isPickable(todo.id))
      .filter((todo) => pickImportance.value === 'all' || todo.importance === pickImportance.value)
      .filter((todo) => pickUrgency.value === 'all' || todo.urgency === pickUrgency.value)
      .filter((todo) => pickTag.value === 'all' || todo.tags.includes(pickTag.value)),
  ),
)

function openTaskModal() {
  pickTab.value = 'all'
  pickImportance.value = 'all'
  pickUrgency.value = 'all'
  pickTag.value = 'all'
  taskModalOpen.value = true
  multitask.cancelDissolve(props.card.id)
}

function closeTaskModal() {
  taskModalOpen.value = false
  multitask.scheduleDissolveIfEmpty(props.card.id)
}

function selectTask(id: string) {
  multitask.assignTask(props.card.id, id)
  taskModalOpen.value = false
}

const isDissolving = computed(() => props.card.taskId === null && !taskModalOpen.value)

// The picker is a full-viewport blocking overlay (consistent with every other modal
// in this app), which is fine for a single card but becomes a real problem in a list
// of independent rows: if it auto-opens while another row has a pending profitability
// check, it silently swallows clicks meant for that row's X/tick/double-tick buttons.
// Give the iteration check priority: don't auto-open into it, and close out of it if
// one starts while we're already open.
const anyOtherPendingIteration = computed(
  () =>
    clock.lastFocusEndAt !== null &&
    multitask.cards.some(
      (c) => c.id !== props.card.id && c.taskId !== null && c.lastAnsweredPhaseEndAt !== clock.lastFocusEndAt,
    ),
)

onMounted(() => {
  if (props.card.taskId !== null) return
  if (anyOtherPendingIteration.value) {
    // Don't force the modal open over a pending check elsewhere, but don't leave this
    // row on its dissolve countdown either — it would vanish before the user gets back
    // to it. It waits, un-opened, until they click "Select task" themselves.
    multitask.cancelDissolve(props.card.id)
    return
  }
  openTaskModal()
})

watch(
  () => clock.lastFocusEndAt,
  () => {
    if (taskModalOpen.value) closeTaskModal()
  },
)

// Clearing removes the row immediately (the outer list's leave transition animates
// it away). Finishing first plays a strike-through over the title, then removes the
// row the same way, so the two exits feel distinct without duplicating any fade logic.
const strikeActive = ref(false)
const FINISH_STRIKE_MS = 450

function onFinish() {
  if (!task.value || strikeActive.value) return
  strikeActive.value = true
  setTimeout(() => {
    multitask.finishCard(props.card.id)
  }, FINISH_STRIKE_MS)
}

function onClear() {
  multitask.clearCard(props.card.id)
}

const showIterationCheck = computed(
  () =>
    props.card.taskId !== null &&
    clock.lastFocusEndAt !== null &&
    props.card.lastAnsweredPhaseEndAt !== clock.lastFocusEndAt,
)

function answerIteration(marks: AccomplishmentMark[]) {
  if (clock.lastFocusEndAt === null) return
  multitask.recordAccomplishment(props.card.id, marks, clock.lastFocusEndAt)
}

function startTitleEdit(e: Event) {
  e.stopPropagation()
  if (!task.value || strikeActive.value) return
  editTitle.value = task.value.title
  titleEditing.value = true
  setTimeout(() => {
    document.querySelector<HTMLInputElement>('.mt-row__title-input')?.select()
  }, 0)
}

function cancelTitleEdit() {
  titleEditing.value = false
}

function commitTitleEdit() {
  const cur = task.value
  if (cur) {
    const trimmed = editTitle.value.trim()
    if (trimmed && trimmed !== cur.title) {
      todos.updateTodo(cur.id, { title: trimmed })
    }
  }
  titleEditing.value = false
}

function openDetail(e: Event) {
  e.stopPropagation()
  if (!task.value || strikeActive.value || titleEditing.value) return
  showDetail.value = true
}
</script>

<template>
  <div
    class="mt-row"
    :class="{ 'mt-row--dissolving': isDissolving, 'mt-row--finishing': strikeActive }"
    :style="{ borderLeftColor: borderColor }"
  >
    <template v-if="task">
      <div class="mt-row__main" @click="openDetail">
        <div class="mt-row__title-line">
          <TransitionGroup tag="span" name="mt-square" class="mt-row__squares">
            <button
              v-for="(mark, index) in card.accomplishments"
              :key="index"
              type="button"
              class="mt-row__square"
              :class="`mt-row__square--${mark}`"
              @click.stop="multitask.removeAccomplishment(card.id, index)"
            ></button>
          </TransitionGroup>
          <div class="mt-row__add-group" @click.stop>
            <button
              type="button"
              class="mt-row__add mt-row__add--green"
              :aria-label="t('multitask.addAccomplishmentGreen')"
              :title="t('multitask.addAccomplishmentGreen')"
              @click="multitask.addAccomplishment(card.id, 'green')"
            >+</button>
            <button
              type="button"
              class="mt-row__add mt-row__add--red"
              :aria-label="t('multitask.addAccomplishmentRed')"
              :title="t('multitask.addAccomplishmentRed')"
              @click="multitask.addAccomplishment(card.id, 'red')"
            >+</button>
          </div>
          <div class="mt-row__text">
            <span
              v-if="!titleEditing"
              class="mt-row__title"
              :class="{ 'mt-row__title--struck': strikeActive }"
              @click.stop="startTitleEdit"
            >{{ task.title }}</span>
            <input
              v-else
              v-model="editTitle"
              type="text"
              class="mt-row__title-input"
              @click.stop
              @keyup.enter="commitTitleEdit"
              @keyup.esc="cancelTitleEdit"
              @blur="commitTitleEdit"
            />
            <div
              v-if="project"
              class="mt-row__project"
              :title="milestone ? `${project.name} · ${milestone.name}` : project.name"
            >
              <span aria-hidden="true">{{ project.icon }}</span>
              {{ project.name }}<template v-if="milestone"> · {{ milestone.name }}</template>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-row__actions" @click.stop>
        <template v-if="showIterationCheck">
          <span class="mt-row__iteration-label">{{ t('multitask.iterationQuestionShort') }}</span>
          <button
            type="button"
            class="mt-row__iteration-btn mt-row__iteration-btn--miss"
            :aria-label="t('multitask.iterationMiss')"
            :title="t('multitask.iterationMiss')"
            @click="answerIteration(['red', 'red'])"
          >
            ✕
          </button>
          <button
            type="button"
            class="mt-row__iteration-btn mt-row__iteration-btn--hit"
            :aria-label="t('multitask.iterationHit')"
            :title="t('multitask.iterationHit')"
            @click="answerIteration(['green'])"
          >
            ✓
          </button>
          <button
            type="button"
            class="mt-row__iteration-btn mt-row__iteration-btn--double"
            :aria-label="t('multitask.iterationDoubleHit')"
            :title="t('multitask.iterationDoubleHit')"
            @click="answerIteration(['green', 'green'])"
          >
            ✓✓
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="mt-row__btn mt-row__btn--finish"
            :disabled="strikeActive"
            :aria-label="t('multitask.finish')"
            :title="t('multitask.finish')"
            @click="onFinish"
          >
            ✓
          </button>
          <button
            type="button"
            class="mt-row__btn mt-row__btn--clear"
            :aria-label="t('multitask.clear')"
            :title="t('multitask.clear')"
            @click="onClear"
          >
            ✕
          </button>
        </template>
      </div>
    </template>

    <template v-else>
      <button type="button" class="mt-row__select" @click="openTaskModal">
        <span aria-hidden="true">+</span>
        {{ t('clock.selectTask') }}
      </button>
    </template>

    <div v-if="taskModalOpen" class="mt-row__overlay" @click.self="closeTaskModal">
      <div class="mt-row__modal" role="dialog" aria-modal="true" :aria-label="t('clock.selectTask')">
        <div class="mt-row__modal-header">
          <h3>{{ t('clock.selectTask') }}</h3>
          <button type="button" class="mt-row__modal-close" :aria-label="t('todo.close')" @click="closeTaskModal">✕</button>
        </div>
        <div class="mt-row__modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="pickTab === 'all'"
            :class="{ active: pickTab === 'all' }"
            @click="pickTab = 'all'"
          >
            {{ t('todo.viewAll') }}
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="pickTab === 'projects'"
            :class="{ active: pickTab === 'projects' }"
            @click="pickTab = 'projects'"
          >
            {{ t('todo.viewProjects') }}
          </button>
        </div>

        <template v-if="pickTab === 'all'">
          <div class="mt-row__modal-filters">
            <label>
              {{ t('todo.importance') }}
              <select v-model="pickImportance">
                <option value="all">{{ t('todo.filterAll') }}</option>
                <option value="low">{{ t('todo.low') }}</option>
                <option value="medium">{{ t('todo.medium') }}</option>
                <option value="high">{{ t('todo.high') }}</option>
              </select>
            </label>
            <label>
              {{ t('todo.urgency') }}
              <select v-model="pickUrgency">
                <option value="all">{{ t('todo.filterAll') }}</option>
                <option value="low">{{ t('todo.low') }}</option>
                <option value="medium">{{ t('todo.medium') }}</option>
                <option value="high">{{ t('todo.high') }}</option>
              </select>
            </label>
            <label v-if="todos.allTags.length">
              {{ t('todo.tags') }}
              <select v-model="pickTag">
                <option value="all">{{ t('todo.filterAll') }}</option>
                <option v-for="tag in todos.allTags" :key="tag" :value="tag">{{ tag }}</option>
              </select>
            </label>
          </div>
          <p v-if="!pickableTasks.length" class="mt-row__modal-empty">{{ t('todo.empty') }}</p>
          <ul v-else class="mt-row__task-list">
            <li v-for="todo in pickableTasks" :key="todo.id">
              <button type="button" class="mt-row__task-list-item" @click="selectTask(todo.id)">
                <span class="mt-row__task-list-title">{{ todo.title }}</span>
                <span class="mt-row__task-list-badges">
                  <span class="badge" :class="`badge--${todo.importance}`">{{ t(`todo.${todo.importance}`) }}</span>
                  <span class="badge" :class="`badge--${todo.urgency}`">{{ t(`todo.${todo.urgency}`) }}</span>
                </span>
                <TaskProjectTag :todo="todo" />
              </button>
            </li>
          </ul>
        </template>
        <div v-else class="mt-row__modal-projects">
          <ProjectsPanel multitask-mode :is-task-pickable="isPickable" :on-pick-task="selectTask" />
        </div>
      </div>
    </div>

    <TaskDetailModal v-if="showDetail && task" :todo="task" @close="showDetail = false" />
  </div>
</template>

<style scoped>
.mt-row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 1rem;
  overflow: hidden;
}

.mt-row--dissolving {
  animation: mt-row-dissolve 5s ease-in forwards;
}

@keyframes mt-row-dissolve {
  0%,
  35% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0.15;
    transform: scale(0.97);
  }
}

.mt-row__main {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1 1 220px;
  min-width: 0;
}

.mt-row__title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  overflow: hidden;
  min-width: 0;
}

.mt-row__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  flex: 0 1 0;
  min-width: 0;
}

.mt-row__project {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  font-size: 0.65rem;
  line-height: 1.2;
  color: var(--color-text-muted);
}

.mt-row__title {
  position: relative;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex-shrink: 1;
}

.mt-row__title::after {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  height: 2px;
  width: 100%;
  background-color: currentColor;
  transform: scaleX(0);
  transform-origin: left;
}

.mt-row__title--struck::after {
  animation: mt-row-strike 0.4s ease forwards;
}

@keyframes mt-row-strike {
  to {
    transform: scaleX(1);
  }
}

.mt-row__squares {
  display: grid;
  grid-template-rows: repeat(3, 0.6rem);
  grid-auto-flow: column;
  grid-auto-columns: 0.6rem;
  gap: 0.12rem;
  flex-shrink: 0;
}

.mt-row__square {
  width: 0.6rem;
  height: 0.6rem;
  padding: 0;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  line-height: 0;
  background: transparent;
  transition: transform 0.15s, opacity 0.15s;
}

.mt-row__square:hover {
  transform: scale(0.8);
  opacity: 0.7;
}

.mt-row__square--green {
  background-color: var(--color-capacity-safe);
}

.mt-row__square--red {
  background-color: var(--color-capacity-critical);
}

.mt-row__add-group {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  flex-shrink: 0;
}

.mt-row__add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 0.6rem;
  height: 0.6rem;
  padding: 0;
  border-radius: 50%;
  font-size: 0.6rem;
  line-height: 1;
  cursor: pointer;
  background: none;
  transition: transform 0.15s, filter 0.15s;
}

.mt-row__add:hover {
  transform: scale(1.15);
  filter: brightness(1.15);
}

.mt-row__add--green {
  color: var(--color-capacity-safe);
  border: 1px solid var(--color-capacity-safe);
}

.mt-row__add--red {
  color: var(--color-capacity-critical);
  border: 1px solid var(--color-capacity-critical);
}

.mt-square-enter-active {
  animation: mt-square-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes mt-square-pop {
  0% {
    opacity: 0;
    transform: scale(0.2) rotate(-25deg);
  }
  60% {
    opacity: 1;
    transform: scale(1.25) rotate(6deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

.mt-row__actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.mt-row__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 50%;
  border: none;
  font-size: 0.95rem;
  line-height: 1;
}

.mt-row__btn--finish {
  background: var(--gradient-primary, var(--color-primary));
  color: var(--color-primary-contrast);
}

.mt-row__btn--finish:disabled {
  opacity: 0.5;
  cursor: default;
}

.mt-row__btn--clear {
  background-color: var(--color-surface-alt);
  color: var(--color-text-muted);
}

.mt-row__btn--clear:hover {
  color: var(--color-text);
}

.mt-row__iteration-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-right: 0.15rem;
  white-space: nowrap;
}

.mt-row__iteration-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2.1rem;
  height: 2.1rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: none;
  font-weight: 700;
  font-size: 0.85rem;
  transition: transform 0.15s, filter 0.15s;
}

.mt-row__iteration-btn:hover {
  filter: brightness(1.1);
  transform: scale(1.05);
}

.mt-row__iteration-btn--miss {
  color: var(--color-capacity-critical);
  border-color: var(--color-capacity-critical);
}

.mt-row__iteration-btn--hit,
.mt-row__iteration-btn--double {
  color: var(--color-capacity-safe);
  border-color: var(--color-capacity-safe);
}

.mt-row__select {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  color: var(--color-text-muted);
  padding: 0.4rem 0.8rem;
  width: 100%;
}

.mt-row__select:hover {
  background-color: var(--color-surface-alt);
  color: var(--color-text);
}

@media (max-width: 480px) {
  .mt-row__iteration-label {
    display: none;
  }
}

.mt-row__overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  padding: 1rem;
}

.mt-row__modal {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 100%;
  max-width: 560px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 0.75rem;
  text-align: left;
  overflow-y: auto;
}

.mt-row__modal-tabs {
  display: flex;
  gap: 0.5rem;
}

.mt-row__modal-tabs button {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  padding: 0.35rem 1rem;
}

.mt-row__modal-tabs button.active {
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border-color: var(--color-primary);
}

.mt-row__modal-projects {
  text-align: left;
}

.mt-row__modal-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.mt-row__modal-filters label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  flex: 1 1 100px;
}

.mt-row__modal-filters select {
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
}

.mt-row__modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mt-row__modal-header h3 {
  margin: 0;
}

.mt-row__modal-close {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  padding: 0.2rem 0.5rem;
}

.mt-row__modal-empty {
  color: var(--color-text-muted);
}

.mt-row__task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow-y: auto;
}

.mt-row__task-list-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  text-align: left;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  padding: 0.5rem 0.75rem;
}

.mt-row__task-list-title {
  overflow-wrap: break-word;
}

.mt-row__task-list-badges {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.mt-row__task-list-item .badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background-color: var(--color-surface-alt);
  color: var(--color-text-muted);
}

.mt-row__task-list-item .badge--low {
  background-color: var(--color-low);
  color: #fff;
}

.mt-row__task-list-item .badge--medium {
  background-color: var(--color-medium);
  color: #fff;
}

.mt-row__task-list-item .badge--high {
  background-color: var(--color-high);
  color: #fff;
}

.mt-row__task-list-item:hover {
  background-color: var(--color-surface-alt);
}
</style>
