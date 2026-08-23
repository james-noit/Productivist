<script setup lang="ts">
import AppMenu from './AppMenu.vue'
import MultitaskToggle from './MultitaskToggle.vue'
import { useViewStore } from '../stores/view'

const appVersion = __APP_VERSION__
const view = useViewStore()
</script>

<template>
  <header class="app-header">
    <div class="app-header__start">
      <AppMenu />
    </div>
    <div class="app-header__title">
      <span class="app-header__name">Productivist</span>
      <span class="app-header__version">v{{ appVersion }}</span>
    </div>
    <div class="app-header__end">
      <div class="app-header__support">
        <span class="app-header__support-text">Enjoying it?</span>
        <a
          href="https://www.buymeacoffee.com/jamesnoitt"
          target="_blank"
          rel="noopener noreferrer"
          class="app-header__coffee-link"
        >
          <img
            src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=jamesnoitt&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff"
            alt="Buy me a coffee"
            class="app-header__coffee-img"
          />
        </a>
      </div>
      <MultitaskToggle v-if="view.current === 'pomodoro'" />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.app-header__start,
.app-header__end {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.app-header__end {
  justify-content: flex-end;
  margin-left: auto;
}

@media (min-width: 480px) {
  .app-header {
    padding: 0.5rem 1rem;
  }
}

.app-header__title {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  white-space: nowrap;
}

.app-header__name {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, var(--color-primary), var(--color-high));
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  color: var(--color-primary);
  transition: background 0.2s;
}

.app-header__version {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.app-header__support {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.app-header__support-text {
  font-family: 'Cookie', cursive;
  font-size: 1.35rem;
  line-height: 1;
  color: var(--color-primary);
  white-space: nowrap;
}

.app-header__coffee-link {
  display: flex;
  align-items: center;
}

.app-header__coffee-img {
  display: block;
  height: 2.15rem;
  width: auto;
  border-radius: 4px;
}
</style>
