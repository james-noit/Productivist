<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTodosStore } from '../stores/todos'
import { useSettingsStore } from '../stores/settings'
import { useMultitaskStore } from '../stores/multitask'
import { useViewStore, type AppView } from '../stores/view'
import { useProjectsStore } from '../stores/projects'
import LanguageSelector from './LanguageSelector.vue'
import ThemeToggle from './ThemeToggle.vue'

const RESET_PHRASE = 'confirm reset'

const { t } = useI18n()
const todos = useTodosStore()
const settings = useSettingsStore()
const multitask = useMultitaskStore()
const view = useViewStore()
const projects = useProjectsStore()

const open = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const isDev = import.meta.env.DEV

const resetModalOpen = ref(false)
const resetConfirmText = ref('')
const resetConfirmValid = computed(() => resetConfirmText.value.trim().toLowerCase() === RESET_PHRASE)

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function goToView(next: AppView) {
  view.setView(next)
  close()
}

function exportTodo() {
  const data = {
    version: 2,
    todos: todos.todos,
    projects: projects.projects,
    milestones: projects.milestones,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'todo.productivist.json'
  link.click()
  URL.revokeObjectURL(url)
  close()
}

function importTodo() {
  fileInput.value?.click()
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  close()
  if (!file) return
  const text = await file.text()
  try {
    const parsed = JSON.parse(text)
    todos.importTodos({ version: 1, todos: parsed.todos ?? [] })
    projects.importProjects({ projects: parsed.projects ?? [], milestones: parsed.milestones ?? [] })
  } catch (error) {
    console.error('Failed to import to-do file', error)
  }
}

function openResetModal() {
  close()
  resetConfirmText.value = ''
  resetModalOpen.value = true
}

function cancelReset() {
  resetModalOpen.value = false
  resetConfirmText.value = ''
}

function confirmReset() {
  if (!resetConfirmValid.value) return
  todos.reset()
  settings.reset()
  multitask.reset()
  view.reset()
  projects.reset()
  resetModalOpen.value = false
  resetConfirmText.value = ''
}

async function seedMockData() {
  close()
  if (!isDev) return
  const { seedMockData: seed } = await import('../dev/mockData')
  seed()
}
</script>

<template>
  <div class="app-menu">
    <button
      class="app-menu__trigger"
      type="button"
      :aria-label="t('menu.open')"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
      </svg>
    </button>
    <div v-if="open" class="app-menu__panel" role="menu">
      <div class="app-menu__group">
        <span class="app-menu__group-label">{{ t('menu.views') }}</span>
        <button
          type="button"
          role="menuitem"
          class="app-menu__view"
          :class="{ 'app-menu__view--active': view.current === 'planning-lab' }"
          :aria-current="view.current === 'planning-lab'"
          @click="goToView('planning-lab')"
        >
          <svg class="app-menu__view-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M9 2h6M10 2v6.2L4.7 17a2 2 0 0 0 1.7 3h11.2a2 2 0 0 0 1.7-3L14 8.2V2"
            />
            <path
              fill="currentColor"
              opacity="0.55"
              d="M6.9 15h10.2l1.6 2.7a1 1 0 0 1-.86 1.3H6.16a1 1 0 0 1-.86-1.3z"
            />
            <circle cx="10" cy="12.5" r="0.8" fill="currentColor" />
            <circle cx="13.5" cy="14" r="0.6" fill="currentColor" />
          </svg>
          {{ t('menu.planningLab') }}
        </button>
        <button
          type="button"
          role="menuitem"
          class="app-menu__view"
          :class="{ 'app-menu__view--active': view.current === 'pomodoro' }"
          :aria-current="view.current === 'pomodoro'"
          @click="goToView('pomodoro')"
        >
          <svg class="app-menu__view-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ t('menu.pomodoro') }}
        </button>
        <button
          type="button"
          role="menuitem"
          class="app-menu__view"
          :class="{ 'app-menu__view--active': view.current === 'eisenhower' }"
          :aria-current="view.current === 'eisenhower'"
          @click="goToView('eisenhower')"
        >
          <svg class="app-menu__view-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor" />
            <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.55" />
            <rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.55" />
            <rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.3" />
          </svg>
          {{ t('menu.eisenhower') }}
        </button>
      </div>
      <div class="app-menu__group">
        <span class="app-menu__group-label">{{ t('menu.file') }}</span>
        <button type="button" role="menuitem" @click="exportTodo">{{ t('menu.exportTodo') }}</button>
        <button type="button" role="menuitem" @click="importTodo">{{ t('menu.importTodo') }}</button>
      </div>
      <div class="app-menu__group">
        <span class="app-menu__group-label">{{ t('menu.preferences') }}</span>
        <div class="app-menu__preference">
          <span>{{ t('language.label') }}</span>
          <LanguageSelector />
        </div>
        <div class="app-menu__preference">
          <span>{{ t('theme.label') }}</span>
          <ThemeToggle />
        </div>
        <button type="button" role="menuitem" class="app-menu__danger" @click="openResetModal">
          {{ t('menu.reset') }}
        </button>
      </div>
      <div v-if="isDev" class="app-menu__group">
        <span class="app-menu__group-label">{{ t('menu.developer') }}</span>
        <button type="button" role="menuitem" @click="seedMockData">{{ t('menu.seedMockData') }}</button>
      </div>
    </div>
    <input ref="fileInput" type="file" accept=".json,application/json" class="visually-hidden" @change="onFileSelected" />

    <div v-if="resetModalOpen" class="app-menu__reset-overlay" @click.self="cancelReset">
      <div class="app-menu__reset-modal" role="dialog" aria-modal="true" :aria-label="t('menu.reset')">
        <h3 class="app-menu__reset-title">{{ t('menu.reset') }}</h3>
        <p>{{ t('menu.resetWarning') }}</p>
        <p class="app-menu__reset-instruction">{{ t('menu.resetInstruction', { phrase: RESET_PHRASE }) }}</p>
        <input
          v-model="resetConfirmText"
          type="text"
          class="app-menu__reset-input"
          :placeholder="RESET_PHRASE"
          autocomplete="off"
          @keydown.enter="confirmReset"
        />
        <div class="app-menu__reset-actions">
          <button type="button" class="app-menu__reset-cancel" @click="cancelReset">{{ t('menu.cancel') }}</button>
          <button
            type="button"
            class="app-menu__reset-confirm"
            :disabled="!resetConfirmValid"
            @click="confirmReset"
          >
            {{ t('menu.reset') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-menu {
  position: relative;
}

.app-menu__trigger {
  background: none;
  border: none;
  color: var(--color-text);
  padding: 0.4rem;
  display: flex;
  align-items: center;
  border-radius: 4px;
}

.app-menu__trigger:hover {
  background-color: var(--color-surface-alt);
}

.app-menu__panel {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.25rem;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  min-width: 200px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.app-menu__group {
  display: flex;
  flex-direction: column;
  padding: 0.25rem 0;
}

.app-menu__group + .app-menu__group {
  border-top: 1px solid var(--color-border);
}

.app-menu__group-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--color-text-muted);
  padding: 0.25rem 1rem;
}

.app-menu__panel button {
  background: none;
  border: none;
  text-align: left;
  padding: 0.5rem 1rem;
  color: var(--color-text);
}

.app-menu__panel button:hover {
  background-color: var(--color-surface-alt);
}

.app-menu__view {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.app-menu__view-icon {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.app-menu__view--active {
  color: var(--color-primary);
  font-weight: 600;
}

.app-menu__view--active .app-menu__view-icon {
  color: var(--color-primary);
}

.app-menu__danger {
  color: var(--color-high);
}

.app-menu__preference {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
  color: var(--color-text);
}

.app-menu__reset-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  padding: 1rem;
}

.app-menu__reset-modal {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1.25rem;
}

.app-menu__reset-title {
  margin: 0;
  color: var(--color-high);
}

.app-menu__reset-modal p {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text);
}

.app-menu__reset-instruction {
  color: var(--color-text-muted) !important;
}

.app-menu__reset-input {
  background-color: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.5rem 0.6rem;
}

.app-menu__reset-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.app-menu__reset-actions button {
  padding: 0.5rem 1rem;
  border-radius: 6px;
}

.app-menu__reset-cancel {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.app-menu__reset-confirm {
  background-color: var(--color-high);
  border: none;
  color: #fff;
}

.app-menu__reset-confirm:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
