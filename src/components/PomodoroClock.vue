<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore, MIN_DURATION_SECONDS, MAX_FOCUS_SECONDS, MAX_BREAK_SECONDS } from '../stores/settings'
import { useTodosStore } from '../stores/todos'
import { useClockStore } from '../stores/clock'
import ClockSettings from './ClockSettings.vue'
import BoxClock from './BoxClock.vue'
import TaskDetailModal from './TaskDetailModal.vue'

const { t } = useI18n()
const settings = useSettingsStore()
const todos = useTodosStore()
const clock = useClockStore()

const progress = computed(() =>
  clock.totalSeconds === 0 ? 0 : 1 - clock.remainingSeconds / clock.totalSeconds,
)

const radius = 90
const circumference = 2 * Math.PI * radius
const dashOffset = computed(() => circumference * (1 - progress.value))

const formattedTime = computed(() => {
  const minutes = Math.floor(clock.remainingSeconds / 60)
  const seconds = clock.remainingSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const currentDurationSeconds = computed(() => (clock.mode === 'focus' ? settings.focusSeconds : settings.breakSeconds))
const maxDurationSeconds = computed(() => (clock.mode === 'focus' ? MAX_FOCUS_SECONDS : MAX_BREAK_SECONDS))
const canDecreaseDuration = computed(() => !clock.running && currentDurationSeconds.value > MIN_DURATION_SECONDS)
const canIncreaseDuration = computed(() => !clock.running && currentDurationSeconds.value < maxDurationSeconds.value)

const taskModalOpen = ref(false)

const showDetail = ref(false)
const titleEditing = ref(false)
const editTitle = ref('')

function startTitleEdit() {
  if (!todos.currentTask) return
  editTitle.value = todos.currentTask.title
  titleEditing.value = true
  setTimeout(() => {
    document.querySelector<HTMLInputElement>('.clock__task-title-input')?.select()
  }, 0)
}

function cancelTitleEdit() {
  titleEditing.value = false
}

function commitTitleEdit() {
  const cur = todos.currentTask
  if (cur) {
    const trimmed = editTitle.value.trim()
    if (trimmed && trimmed !== cur.title) {
      todos.updateTodo(cur.id, { title: trimmed })
    }
  }
  titleEditing.value = false
}

function openDetail() {
  showDetail.value = true
}

function openTaskModal() {
  taskModalOpen.value = true
}

function selectTask(id: string) {
  todos.setCurrentTask(id)
  taskModalOpen.value = false
}

function finishTask() {
  if (!todos.currentTask) return
  todos.toggleDone(todos.currentTask.id)
  taskModalOpen.value = true
}

onMounted(() => {
  clock.ensureNotificationPermission()
})
</script>

<template>
  <section class="clock">
    <div class="clock__area clock__area--clock">
      <div class="clock__modes">
        <button type="button" :class="{ active: clock.mode === 'focus' }" @click="clock.setMode('focus')">
          {{ t('clock.focus') }}
        </button>
        <button type="button" :class="{ active: clock.mode === 'break' }" @click="clock.setMode('break')">
          {{ t('clock.break') }}
        </button>
        <ClockSettings />
      </div>

      <div class="clock__main">
        <div class="clock__dial" :class="{ 'clock__dial--boxes': settings.clockStyle === 'boxes' }">
          <template v-if="settings.clockStyle === 'boxes'">
            <BoxClock />
          </template>
          <template v-else>
            <svg viewBox="0 0 200 200" width="240" height="240">
              <circle cx="100" cy="100" :r="radius" class="clock__track" fill="none" stroke-width="10" />
              <circle
                cx="100"
                cy="100"
                :r="radius"
                class="clock__progress"
                fill="none"
                stroke-width="10"
                stroke-linecap="round"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="dashOffset"
                transform="rotate(-90 100 100)"
              />
            </svg>
          </template>
        </div>

        <div class="clock__time-row">
          <div class="clock__stepper" role="group" :aria-label="t('clock.adjustDuration')">
            <button
              type="button"
              class="clock__stepper-btn"
              :disabled="!canDecreaseDuration"
              :aria-label="t('clock.decreaseLarge')"
              :title="t('clock.decreaseLarge')"
              @click="clock.adjustDuration(-300)"
            >
              -5′
            </button>
            <button
              type="button"
              class="clock__stepper-btn"
              :disabled="!canDecreaseDuration"
              :aria-label="t('clock.decreaseSmall')"
              :title="t('clock.decreaseSmall')"
              @click="clock.adjustDuration(-30)"
            >
              -30″
            </button>
          </div>

          <span class="clock__time">{{ formattedTime }}</span>

          <div class="clock__stepper" role="group" :aria-label="t('clock.adjustDuration')">
            <button
              type="button"
              class="clock__stepper-btn"
              :disabled="!canIncreaseDuration"
              :aria-label="t('clock.increaseSmall')"
              :title="t('clock.increaseSmall')"
              @click="clock.adjustDuration(30)"
            >
              +30″
            </button>
            <button
              type="button"
              class="clock__stepper-btn"
              :disabled="!canIncreaseDuration"
              :aria-label="t('clock.increaseLarge')"
              :title="t('clock.increaseLarge')"
              @click="clock.adjustDuration(300)"
            >
              +5′
            </button>
          </div>
        </div>
      </div>

      <div class="clock__controls">
        <button
          type="button"
          v-if="!clock.running"
          class="clock__icon-button"
          :aria-label="t('clock.start')"
          :title="t('clock.start')"
          @click="clock.start()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button
          type="button"
          v-else
          class="clock__icon-button"
          :aria-label="t('clock.pause')"
          :title="t('clock.pause')"
          @click="clock.pause()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z" />
          </svg>
        </button>
        <button
          type="button"
          class="clock__icon-button clock__icon-button--secondary"
          :aria-label="t('clock.reset')"
          :title="t('clock.reset')"
          @click="clock.reset()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 5V2L7 7l5 5V8c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="clock__area clock__area--task">
      <div class="clock__task" :class="{ 'clock__task--empty': !todos.currentTask }">
        <template v-if="todos.currentTask">
          <div class="clock__task-info" @click="openDetail">
            <span class="clock__task-label">{{ t('clock.currentTask') }}</span>
            <span
              v-if="!titleEditing"
              class="clock__task-title"
              @click.stop="startTitleEdit"
            >{{ todos.currentTask.title }}</span>
            <input
              v-else
              v-model="editTitle"
              type="text"
              class="clock__task-title-input"
              @click.stop
              @keyup.enter="commitTitleEdit"
              @keyup.esc="cancelTitleEdit"
              @blur="commitTitleEdit"
            />
          </div>
          <div class="clock__task-actions" @click.stop>
            <button type="button" class="clock__task-finish" @click="finishTask">{{ t('clock.finished') }}</button>
            <button type="button" class="clock__task-change" @click="openTaskModal">{{ t('clock.changeTask') }}</button>
          </div>
        </template>
        <template v-else>
          <button type="button" class="clock__task-select" @click="openTaskModal">{{ t('clock.selectTask') }}</button>
        </template>
      </div>
    </div>

    <div v-if="taskModalOpen" class="clock__overlay" @click.self="taskModalOpen = false">
      <div class="clock__modal" role="dialog" aria-modal="true" :aria-label="t('clock.selectTask')">
        <div class="clock__modal-header">
          <h3>{{ t('clock.selectTask') }}</h3>
          <button type="button" class="clock__modal-close" :aria-label="t('todo.close')" @click="taskModalOpen = false">✕</button>
        </div>
        <p v-if="!todos.filteredTodos.length" class="clock__modal-empty">{{ t('todo.empty') }}</p>
        <ul v-else class="clock__task-list">
          <li v-for="todo in todos.filteredTodos" :key="todo.id">
            <button type="button" class="clock__task-list-item" @click="selectTask(todo.id)">{{ todo.title }}</button>
          </li>
        </ul>
      </div>
    </div>

    <div v-if="clock.sessionModalOpen" class="clock__overlay">
      <div class="clock__modal" role="dialog" aria-modal="true" :aria-label="t('clock.timeUp')">
        <h3>{{ clock.mode === 'break' ? t('clock.timeUpFocusTitle') : t('clock.timeUpBreakTitle') }}</h3>
        <p>{{ clock.mode === 'break' ? t('clock.startBreakPrompt') : t('clock.startFocusPrompt') }}</p>
        <div class="clock__modal-actions">
          <button type="button" @click="clock.startNextSession()">{{ t('clock.startNow') }}</button>
          <button type="button" class="clock__modal-secondary" @click="clock.dismissSessionModal()">{{ t('clock.later') }}</button>
        </div>
      </div>
    </div>

    <TaskDetailModal v-if="showDetail && todos.currentTask" :todo="todos.currentTask" @close="showDetail = false" />
  </section>
</template>

<style scoped>
.clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.5rem 1rem;
}

.clock__modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
}

.clock__modes button {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  border-radius: 999px;
  padding: 0.3rem 1rem;
}

.clock__modes button.active {
  background: var(--gradient-primary, var(--color-primary));
  color: var(--color-primary-contrast);
  border-color: var(--color-primary);
}

.clock__area {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: 1.1rem;
}

.clock__main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

.clock__time-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.clock__stepper {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.clock__stepper-btn {
  min-width: 2.5rem;
  height: 2.5rem;
  padding: 0 0.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}

.clock__stepper-btn:hover:not(:disabled) {
  background-color: var(--color-surface-alt);
  border-color: var(--color-primary);
  color: var(--color-text);
}

.clock__stepper-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.clock__dial {
  display: flex;
  align-items: center;
  justify-content: center;
}

.clock__track {
  stroke: var(--color-surface-alt);
}

.clock__progress {
  stroke: var(--color-primary);
  transition: stroke-dashoffset 0.3s linear;
}

.clock__time {
  font-size: 2.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.clock__task {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
  width: 100%;
}

.clock__task-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.clock__task-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.clock__task-title {
  font-size: 1rem;
  font-weight: 600;
}

.clock__task-title-input {
  font-size: 1rem;
  font-weight: 600;
  background-color: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font-family: inherit;
}

.clock__task-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.clock__task-finish {
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
}

.clock__task-change,
.clock__task-select {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  border-radius: 6px;
  padding: 0.4rem 1rem;
}

.clock__controls {
  display: flex;
  gap: 0.75rem;
}

.clock__icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  background: var(--gradient-primary, var(--color-primary));
  color: var(--color-primary-contrast);
  border: none;
  border-radius: 50%;
}

.clock__icon-button:hover {
  filter: brightness(0.95);
}

.clock__icon-button--secondary {
  background: var(--color-surface-alt);
  color: var(--color-text);
}

.clock__area--task {
  border-top: 1px solid var(--color-border);
  padding-top: 1rem;
}

@media (max-width: 480px) {
  .clock__main {
    gap: 0.35rem;
  }

  .clock__stepper-btn {
    min-width: 2.1rem;
    height: 2.1rem;
    padding: 0 0.3rem;
    font-size: 0.6rem;
  }
}

@media (max-width: 799px) {
  .clock {
    padding: 1rem 0.75rem;
    gap: 0.6rem;
  }

  .clock__area {
    gap: 0.6rem;
  }

  .clock__area--task {
    padding-top: 0.6rem;
  }

  .clock__dial svg {
    width: 120px;
    height: 120px;
  }

  .clock__time {
    font-size: 1.4rem;
  }

  .clock__dial--boxes {
    max-width: 80vw;
    overflow-x: auto;
  }

  .clock__task {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    text-align: left;
    gap: 0.75rem;
  }

  .clock__task--empty {
    justify-content: center;
  }

  .clock__task-info {
    text-align: left;
  }

  .clock__task-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.clock__overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  padding: 1rem;
}

.clock__modal {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  gap: 0.75rem;
  text-align: center;
}

.clock__modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
}

.clock__modal-header h3 {
  margin: 0;
}

.clock__modal-close {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  padding: 0.2rem 0.5rem;
}

.clock__modal-empty {
  color: var(--color-text-muted);
}

.clock__task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow-y: auto;
  text-align: left;
}

.clock__task-list-item {
  width: 100%;
  text-align: left;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  padding: 0.5rem 0.75rem;
}

.clock__task-list-item:hover {
  background-color: var(--color-surface-alt);
}

.clock__modal-actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
}

.clock__modal-actions button {
  background-color: var(--color-primary);
  color: var(--color-primary-contrast);
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
}

.clock__modal-secondary {
  background-color: var(--color-surface-alt) !important;
  color: var(--color-text) !important;
}
</style>
