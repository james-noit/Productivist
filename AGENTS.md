# Productivist — Agent Instructions

## Commands

```
npm install
npm run dev       # Vite dev server
npm run build     # vue-tsc -b && vite build (strict TS)
npm run preview   # vite preview
```

No test framework, no linter, no formatter configured.

## Architecture

- **Entry:** `src/main.ts` → `src/App.vue`
- **Framework:** Vue 3 (composition API, `<script setup>`) + Vite + TypeScript + Pinia + vue-i18n
- **Stores:** `settings.ts` (theme, language, durations), `todos.ts` (todo CRUD, filters, import/export), `clock.ts` (timer state), `view.ts` (active view), `projects.ts` (project tree), `multitask.ts` (task drawer/multitask). All use `useLocalStorage` composable (`src/composables/`) writing to `productivist.*` keys.
- **i18n:** Composition mode (`legacy: false`). Messages in `src/i18n/locales/{en,es}.json`. Default: `en`, fallback: `en`.
- **Types:** `src/types/todo.ts`, `multitask.ts`, `eisenhower.ts`, `project.ts`

## TS constraints (from `tsconfig.app.json`)

- `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch` — all enabled
- Inherits from `@vue/tsconfig/tsconfig.dom.json`

## Design tokens

CSS custom properties in `src/style.css`. Two themes: light (`--color-bg: #fff8f0`) and dark (`[data-theme='dark']`, Solarized Dark). Toggle via `data-theme` attribute on `<html>`.

## Conventions

- Pinia stores use function composition API (`defineStore('name', () => { ... })`), not options API
- Components use kebab-case class names with `__` modifier syntax (BEM-like): e.g., `main-view__clock`
- Todo `order` field controls display ordering; `moveTodo` swaps order values between adjacent items
