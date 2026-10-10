# Productivist — Agent Instructions

## Commands

```
npm install
npm run dev       # ng serve (Angular CLI dev server, http://localhost:4200)
npm run build     # ng build (production, esbuild-based application builder)
npm run watch     # ng build --watch --configuration development
```

No test framework, no linter, no formatter configured.

## Thunderbird add-on

The built app also runs as a Thunderbird add-on (a WebExtension that opens `app/index.html` in a tab).

```
npm run build:tb   # production + `thunderbird` configuration, then assembles dist/thunderbird and dist/productivist.xpi
npm run tb:lint    # web-ext lint
npm run tb:run     # launches Thunderbird with the add-on loaded (needs Thunderbird installed)
```

- `extension/` holds `manifest.json` and `background.js`; `scripts/package-thunderbird.mjs` copies them next to the Angular build and syncs the manifest version with `package.json`.
- Extension pages run under a strict CSP: no inline `<script>`, no inline event handlers, no remote scripts. Keep `index.html` free of them (the theme pre-paint snippet lives in `public/theme-init.js`, the Cookie font is bundled from `src/fonts/`), and keep `inlineCritical: false` in the `thunderbird` build configuration.
- Manual install: Thunderbird → Tools → Developer Tools → Debug Add-ons → Load Temporary Add-on → pick `dist/thunderbird/manifest.json`.

## Backend

`backend/` is a separate Spring Boot 4 / Java 21 / Postgres sync service (Maven, plain `JdbcClient`, Flyway). The Angular app stays local-first; see `backend/README.md` for run instructions and the API. It is not part of the npm scripts.

The frontend side is optional and controlled by `syncEnabled` in `src/environments/environment*.ts` (false hides the account UI and disables sync). In production the app calls `/api/*` on its own origin: the root `Dockerfile` serves the build with nginx (`deploy/nginx.conf.template`), which proxies `/api/` to the backend's private Railway address and rate-limits it, so the backend has no public domain. The Thunderbird add-on is not served from that origin, so `npm run build:tb` takes `API_URL=https://<frontend-domain>` (written to the git-ignored `environment.thunderbird.ts` by `scripts/write-thunderbird-environment.mjs`; unset means sync disabled). `AccountService` holds the email + password login/signup; the header's `login-popover` is the entry point and the account block lives in the global Configuration modal (`config-modal`: language, theme, account; `account-settings` is its account block), opened from the menu's Configuration entry or the header chip through `ViewService.openConfiguration()`; `SyncService` (instantiated in `AppComponent`) diffs the todos/projects/milestones signals against per-row metadata in `productivist.sync` to find edits and deletions, so the stores themselves know nothing about syncing — the pure logic is in `src/lib/sync-engine.ts`. Settings, daily plan and multitask state travel as one blob (`buildState`/`applyState` in `sync.service.ts`); a new persisted setting only syncs if it is added there. Device-local UI state (view, active project, filters, timer, dismissed tips) is deliberately not synced. Row hashes are taken over `toWire` output, so a codec's `toWire` must only emit an optional new field (like `Todo.status`) when it is set: an always-present key (even `null`) changes every existing row's hash, re-stamps them all as edited and re-pushes them, which can clobber unpulled edits from other devices.

The admin panel is for the one account whose email equals the backend's `ADMIN_EMAIL` (no role column; `BearerTokenFilter` grants `ROLE_ADMIN`, `SecurityConfig` guards `/api/admin/**`, see `backend/README.md`). `AccountService.isAdmin` asks `/api/admin/me`; the menu entry and the `admin` view (`AdminViewComponent` + `AdminUserModalComponent`, state in `AdminService`) exist only while it is true. The admin API returns account metadata and counts, never task or project content.

## Architecture

- **Entry:** `src/main.ts` → `src/app/app.component.ts` (`AppComponent`, standalone, bootstrapped via `bootstrapApplication`)
- **Framework:** Angular 19 (standalone components, signals) + Angular CLI (esbuild `application` builder) + TypeScript + `@ngx-translate/core`
- **Change detection:** zoneless (`provideExperimentalZonelessChangeDetection`, no zone.js polyfill). Every component is `ChangeDetectionStrategy.OnPush` and every piece of state is a signal — new components must follow both, or they will not update.
- **Lazy loading:** `app.component.html` wraps each view in `@defer (on immediate)`, so each is its own chunk. Adding a view means adding a `@defer` branch, not just an import. Three more surfaces are deferred the same way: the Matrix tab of `projects-view` (the `eisenhower-view`), and the global Plan-my-day modal (`planning-lab-modal`, wrapping the `daily-backlog-view` wizard), which `AppComponent` renders outside the view chain whenever `ViewService.planningOpen` is true, and the Configuration modal, rendered the same way from `ViewService.configOpen`. The views are `pomodoro`, `projects` (labelled "Tasks and projects"; Projects | Matrix tabs, with the former General backlog folded into `projects-panel` behind its opt-in `withBacklog` input), `project` and `admin`. `project` is the detail view of one project (`project-detail-view`, reached by the opt-in `manageable` Manage project button of `project-tree-item`): `ViewService.activeProjectId` and `projectPresentation` (both persisted) pick what it shows (`overview`, `kanban`, `list`, `matrix`, `roadmap`, `calendar`; an unknown stored value falls back to `kanban`, validated in `view.service.ts`), it falls back to `projects` when the project no longer exists, and each presentation is deferred inside it, so each is its own chunk: `project-overview` (stat tiles, per-milestone progress, hand-written SVG burn-up from `lib/burnup.ts`, priority and age breakdowns), `kanban-board` (cards: `kanban-card`), `project-task-list` (sortable, inline-editable table with bulk actions) and `eisenhower-view` with its `projectId` input set (the Matrix, limited to the project), `project-roadmap` (milestone bars from start to due, filled by progress, expandable to dated tasks, dragging a bar shifts its dates by whole days; one computed lays everything out in pixels, `ZOOM` weeks 28 / months 8 / quarters 3 px per day) and `project-calendar` (month/week grid by `dueDate`; native drag & drop onto a day plus a ⋯ date field on each chip for keyboard and touch; an Unscheduled panel for open tasks without a due date). The Roadmap and the Overview's milestone rows share `milestone-dates-modal` (name, start, due; swaps a backwards range). `ViewService.showDoneTasks` (device-local, default false) hides completed tasks in Kanban, List and Calendar alike (the Done column keeps its drop target and a "N done · Show" placeholder), and `ViewService.kanbanMilestoneFilter` is the board's per-project milestone filter, shared so the Overview can open the board already filtered (`openKanbanForMilestone`). A new presentation is a `PRESENTATIONS` entry plus a `@case` in `project-detail-view`; legacy stored `planning-lab`/`eisenhower` values are migrated in `view.service.ts`.
- **Services** (`src/services/`, `@Injectable({ providedIn: 'root' })`, one per former Pinia store): `settings.service.ts` (theme, language, durations), `todos.service.ts` (todo CRUD, filters, import/export), `clock.service.ts` (timer state, bell sounds), `view.service.ts` (active view, `projectsTab`, `planningOpen`, `focusQuadrant`, clock-settings panel and `configOpen`/`configSection` state; device-local, not synced), `projects.service.ts` (project tree), `multitask.service.ts` (task drawer/multitask). All persisted state uses `localStorageSignal` (`src/core/local-storage-signal.ts`) writing to `productivist.*` localStorage keys; it skips writes that would not change the stored value and coalesces bursts into one write per key per microtask.
- **Components:** `src/app/components/<kebab-name>/<kebab-name>.component.{ts,html,css}`, one directory per component, standalone, leaf-first dependency order.
- **i18n:** `@ngx-translate/core`. English is registered synchronously in `AppComponent`'s constructor via `setTranslation()`; every other locale is dynamically imported the first time it is selected. Messages in `src/i18n/locales/{en,es}.json`. Default/fallback: `en`. Use the `translate` pipe in templates (`{{ 'key' | translate }}`) or inject `TranslateService` and call `.instant(key)` for non-template usage (e.g. inside `window.confirm`).
- **Task status:** `Todo.status` (`'todo' | 'inProgress' | 'review'`, absent = todo) is the Kanban workflow column; `done` stays the single source of truth for completion and the board's Done column is derived (`columnOf` in `lib/kanban.ts`). Toggling `done` elsewhere leaves `status` alone; `TodosService.moveOnBoard` is the one place that changes both together.
- **Dates:** `Todo` and `Milestone` have optional `startDate`/`dueDate`, plain local-calendar `'YYYY-MM-DD'` strings (never `Date` or epoch ms: a due date is a day, not an instant). Parse with `parseIso` in `lib/dates.ts` (local midnight), never `new Date('2026-10-10')` (UTC); format with `Intl.DateTimeFormat(settings.language(), …)` in a `computed`, not `DatePipe` (no Angular locale data is registered). `lib/dates.ts` also has `todayIso`, `toIso`, `isIsoDate`, `addDays`, `diffDays`, `startOfWeek` (Monday), `startOfMonth`, `monthGrid`, `dueState`, `orderedDates` (swaps start > due) and `sanitizeDates`. The sync codecs emit each date only when set (like `status`) and the backend stores them as `TEXT` with a `YYYY-MM-DD` CHECK (`V4__dates.sql`). Export files are `version: 3` (2 and 3 import the same way); import runs `sanitizeDates` over todos and milestones so a hand-edited file cannot wedge sync.
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
- `lib/eisenhower.ts` — the one `QUADRANTS` table (keys, css keys, label keys and the importance/urgency a quadrant implies), plus `classify`, `comparePriority`, `countByQuadrant`, `compareByUrgency`
- `lib/kanban.ts` — the one `BOARD_COLUMNS` table, `columnOf` (todo → board column) and `reorderSlice` (re-orders one column slice reusing its own `order` values, so other todos keep theirs)
- Toolbar controls in `src/style.css`, used by every project presentation so a mode, a filter, a toggle and an action look different: `.segmented` + `.segmented__option` (pick a mode; on = `aria-pressed="true"`, prefixed by a `.control-label`), `.filter-chip` (narrow what shows; on = `aria-pressed="true"`), `.switch` (a `<button role="switch" aria-checked>` with a `.switch__track` span, then the label) and `.button-ghost` (do something)
- `lib/dates.ts` and `lib/burnup.ts` — see Dates above (the Roadmap/Calendar-only `endOfMonth`, `isoWeek` and `capitalizeFirst` live in `lib/calendar-dates.ts`, so they stay out of the initial bundle)
- `milestone-dates-modal` — the one editor for a milestone's name and start/due dates; open it from anywhere with an `@if` and the milestone
- `TodosService.updateMany`/`removeMany` — one write for a bulk change; `updateMany({ done })` stamps or clears `completedAt` like `toggleDone`
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
