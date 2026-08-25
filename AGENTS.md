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
- **Services** (`src/services/`, `@Injectable({ providedIn: 'root' })`, one per former Pinia store): `settings.service.ts` (theme, language, durations), `todos.service.ts` (todo CRUD, filters, import/export), `clock.service.ts` (timer state, bell sounds), `view.service.ts` (active view), `projects.service.ts` (project tree), `multitask.service.ts` (task drawer/multitask). All persisted state uses `localStorageSignal` (`src/core/local-storage-signal.ts`) writing to `productivist.*` localStorage keys.
- **Components:** `src/app/components/<kebab-name>/<kebab-name>.component.{ts,html,css}`, one directory per component, standalone, leaf-first dependency order.
- **i18n:** `@ngx-translate/core`, translations registered synchronously in `AppComponent`'s constructor via `setTranslation()` (no HTTP loader — locale JSON is bundled). Messages in `src/i18n/locales/{en,es}.json`. Default/fallback: `en`. Use the `translate` pipe in templates (`{{ 'key' | translate }}`) or inject `TranslateService` and call `.instant(key)` for non-template usage (e.g. inside `window.confirm`).
- **Types:** `src/types/todo.ts`, `multitask.ts`, `eisenhower.ts`, `project.ts` (framework-agnostic, unchanged from the Vue version)

## TS constraints (from `tsconfig.json`)

- `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature` — all enabled
- No `erasableSyntaxOnly` (requires TS 5.8+; this repo pins `~5.7.2` for Angular 19 compatibility) — avoid constructor parameter properties anyway (use `inject()` instead of constructor DI) to keep the option easy to re-enable later
- Angular strict template checking is on (`strictTemplates`, `strictInjectionParameters`, `strictInputAccessModifiers`)

## Design tokens

CSS custom properties in `src/style.css` (unchanged from the Vue version). Four themes: light (`:root`, default), dark (`[data-theme='dark']`, Dracula), japanese (`[data-theme='japanese']`), nordic (`[data-theme='nordic']`). Toggle via `data-theme` attribute on `<html>`, set by an `effect()` in `AppComponent`.

## Conventions

- Services expose state as `signal`/`computed`, not plain properties — always call as a function in templates/TS (`todos.filteredTodos()`, not `todos.filteredTodos`)
- All state mutations are immutable (`.set()`/`.update()` with spread/map, never mutate objects inside a signal's array in place) so change detection picks them up
- Use `inject()` for dependency injection, not constructor parameter properties
- Components use kebab-case class names with `__` modifier syntax (BEM-like): e.g., `main-view__clock`
- Todo `order` field controls display ordering; `reorderTodoBefore` recomputes order values for the affected slice
- Angular's new control-flow syntax (`@if`/`@for`/`@else if`) is used throughout instead of `*ngIf`/`*ngFor`
