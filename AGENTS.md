# Productivist — Agent Instructions

## Commands

```
npm install
npm run dev       # ng serve (Angular CLI dev server, http://localhost:4200)
npm run build     # ng build (production, esbuild-based application builder)
npm run watch     # ng build --watch --configuration development
```

No test framework, no linter, no formatter configured.

## Architecture

- **Entry:** `src/main.ts` → `src/app/app.component.ts` (`AppComponent`, standalone, bootstrapped via `bootstrapApplication`)
- **Framework:** Angular 19 (standalone components, signals) + Angular CLI (esbuild `application` builder) + TypeScript + `@ngx-translate/core`
- **Change detection:** zoneless (`provideExperimentalZonelessChangeDetection`, no zone.js polyfill). Every component is `ChangeDetectionStrategy.OnPush` and every piece of state is a signal — new components must follow both, or they will not update.
- **Lazy loading:** `app.component.html` wraps each view in `@defer (on immediate)`, so each is its own chunk. Adding a view means adding a `@defer` branch, not just an import.
- **Services** (`src/services/`, `@Injectable({ providedIn: 'root' })`, one per former Pinia store): `settings.service.ts` (theme, language, durations), `todos.service.ts` (todo CRUD, filters, import/export), `clock.service.ts` (timer state, bell sounds), `view.service.ts` (active view), `projects.service.ts` (project tree), `multitask.service.ts` (task drawer/multitask). All persisted state uses `localStorageSignal` (`src/core/local-storage-signal.ts`) writing to `productivist.*` localStorage keys; it skips writes that would not change the stored value and coalesces bursts into one write per key per microtask.
- **Components:** `src/app/components/<kebab-name>/<kebab-name>.component.{ts,html,css}`, one directory per component, standalone, leaf-first dependency order.
- **i18n:** `@ngx-translate/core`. English is registered synchronously in `AppComponent`'s constructor via `setTranslation()`; every other locale is dynamically imported the first time it is selected. Messages in `src/i18n/locales/{en,es}.json`. Default/fallback: `en`. Use the `translate` pipe in templates (`{{ 'key' | translate }}`) or inject `TranslateService` and call `.instant(key)` for non-template usage (e.g. inside `window.confirm`).
- **Types:** `src/types/todo.ts`, `multitask.ts`, `eisenhower.ts`, `project.ts` (framework-agnostic, unchanged from the Vue version)

## TS constraints (from `tsconfig.json`)

- `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature` — all enabled
- No `erasableSyntaxOnly` (requires TS 5.8+; this repo pins `~5.7.2` for Angular 19 compatibility) — avoid constructor parameter properties anyway (use `inject()` instead of constructor DI) to keep the option easy to re-enable later
- Angular strict template checking is on (`strictTemplates`, `strictInjectionParameters`, `strictInputAccessModifiers`)

## Shared building blocks

Reach for these before writing new markup — each exists because the same thing had been copy-pasted across many components:

- `task-badges` — a task's importance/urgency chips, `[showTags]` to append its tags
- `inline-task-editor` — the compact edit-in-place form (title, priorities, tags)
- `priority-select` — the low/medium/high dropdown
- `project-milestone-picker` — the project + milestone selects with their inline "new project"/"new milestone" forms
- `.badge*`, `.modal-overlay` and `.modal-panel` in `src/style.css` — modals compose the last two and set only their deltas through `--modal-max-width`, `--modal-max-height`, `--modal-radius`, `--modal-padding`, `--modal-gap` and `--modal-z`
- `lib/eisenhower.ts` — the one `QUADRANTS` table (keys, css keys, label keys and the importance/urgency a quadrant implies), plus `classify`, `comparePriority`, `countByQuadrant`
- `ClockService` — owns `formattedTime`, `maxDurationSeconds` and the `canDecrease/IncreaseDuration` guards, not the views

`task-badges` and `priority-select` are `:host { display: contents }` so their elements stay direct children of the caller's flex container.

## Performance constraints

- Never call a method that builds an array or a Map from a template binding; expose a `computed` (often a `Map` keyed by id) and look it up. See `tasksByMilestone` in `project-tree-item` or `boxes` in `box-clock`.
- The production `initial` budget is 450 kB. Adding an eager import to `AppComponent` pulls a whole view back into the initial bundle.

## Design tokens

CSS custom properties in `src/style.css` (unchanged from the Vue version). Four themes: light (`:root`, default), dark (`[data-theme='dark']`, Dracula), japanese (`[data-theme='japanese']`), nordic (`[data-theme='nordic']`). Toggle via `data-theme` attribute on `<html>`, set by an `effect()` in `AppComponent`.

## Conventions

- Services expose state as `signal`/`computed`, not plain properties — always call as a function in templates/TS (`todos.filteredTodos()`, not `todos.filteredTodos`)
- All state mutations are immutable (`.set()`/`.update()` with spread/map, never mutate objects inside a signal's array in place) so change detection picks them up
- Use `inject()` for dependency injection, not constructor parameter properties
- Components use kebab-case class names with `__` modifier syntax (BEM-like): e.g., `main-view__clock`
- Todo `order` field controls display ordering; `reorderTodoBefore` recomputes order values for the affected slice
- Angular's new control-flow syntax (`@if`/`@for`/`@else if`) is used throughout instead of `*ngIf`/`*ngFor`
