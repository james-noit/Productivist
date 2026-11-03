# All tasks tab (Tasks and projects page)

A third tab on the Tasks and projects page that lists every task, whatever its project (Inbox included), with three
densities and the same filters as the Projects tab.

## Where it lives

- `ViewService.ProjectsTab` becomes `'projects' | 'tasks' | 'matrix'`. Tab order: **Projects | All tasks | Eisenhower Matrix**.
  `projectsTab` is a stored value, so add a validated reader (`activeProjectsTab` computed: unknown -> `'projects'`)
  and use it everywhere the tab is read (`projects-view`, `projects-context-menu`'s `tab` input).
- `projects-view`: `TABS` gets `'tasks'`, a third `.tabs__tab` (`data-tab="tasks"`, `projects.tabTasks`), and an
  `@else if` branch that renders the new `all-tasks-view` inside `@defer (on immediate)` with the same
  `@placeholder` as the Matrix, so it is its own lazy chunk. The FAB, the context menu (create menu on this tab: no row
  carries `data-project-id`) and the dialogs keep working unchanged.
- New component `src/app/components/all-tasks-view/` (standalone, OnPush, signals only). Add it to
  `NEVER_INITIAL_UI` in `scripts/check-lazy-chunks.mjs`.

## State (shared vs. own)

`ProjectsPageState` already holds the search `query`, `quadrants` and `due`. The All tasks tab **shares** those (one
search box and one set of priority/due filters across both tabs, as the user asked for "the filters we see in the
project tab"). It adds, persisted and device-local (never synced, not in `buildState`):

- `taskDensity`: `'compact' | 'extended' | 'minimal'` (`productivist.allTasksDensity`, default `compact`, validated
  through `activeTaskDensity`).
- `taskSort`: `'priority' | 'due' | 'project' | 'title' | 'created' | 'manual'` (`productivist.allTasksSort`, default
  `priority`, validated through `activeTaskSort`). `manual` = `TodosService.sortTasks` order; `priority` =
  `comparePriority` then due date; `due` = due date (none last) then priority; `project` = grouped by project in
  `projects.sortedProjects()` order with Inbox first, `sortTasks` inside; `title` = `localeCompare` with the app
  language; `created` = newest first (by `createdAt` if present on `Todo`, else keep the incoming order reversed —
  check the type).
- `taskProjects`: `readonly string[]` (empty = all; `UNASSIGNED` id `'__inbox'` = no project). Not persisted.
- Done tasks: reuse `ViewService.showDoneTasks` (already the shared "show done" switch of Kanban/List/Calendar).
- `taskFilterCount` computed for the badge: quadrants + due + project filters + (showDone ? 1 : 0).

`taskMatches(todo, query, due, quadrants, today)` from `lib/project-cards.ts` is the predicate; also match the project
name (accent-insensitive) in the search like the dashboard does.

## Toolbar (same look as the dashboard)

Search input (bound to `state.query`), *Filters* `.btn--secondary` with the count badge (`aria-haspopup="dialog"`,
`aria-expanded`), and a `.segmented` density switch, icon-only with `aria-label`/`title`: Minimal (`minus`),
Compact (`list`), Extended (`grid` or another existing `ui-icon`). Under it, only while something is on: removable
`.filter-chip`s (each quadrant, the due filter, each project, "Done tasks shown"), a muted "Sorted by …" when the sort
is not the default, and *Clear all*. A muted count line: "N tasks".

## Filters drawer

Reuse `projects-filter-drawer` with a new input `mode: 'projects' | 'tasks'` (default `'projects'`) rather than a
second drawer:

- Priority and Due sections unchanged (shared state).
- *Project* section (tasks mode only): Inbox + each project as multi-select `.filter-chip`s (`aria-pressed`) with
  their open-task counts.
- *Sort* radios: the project sorts in projects mode, the task sorts in tasks mode.
- *Show*: Inbox switch in projects mode; *Show done tasks* switch in tasks mode.
- Footer *Clear all* clears what applies to the mode; *Show N results* counts tasks in tasks mode.

## Rows (three densities)

One `<ul role="list">`, rows built from one `rows` computed (title, project name + icon, milestone name, formatted due
date with `dueState`, overdue flag, recurrence, done) — no method calls from the template.

- **Minimal**: round check, title, project name as a small muted label at the right. ~36px.
- **Compact** (default): check, title, `task-badges`, `repeat-mark`, project chip (icon + name, or "Inbox"), due chip
  (overdue in `--color-high`), status (In progress / Review) as a small badge, ⋯ `kebab-menu` (*Open*, *Move to
  project…* second page, *Delete* with inline `.confirm-bar`). ~44px, single line, ellipsis.
- **Extended**: compact line plus a second line: first line of the description (clamped), tags (`[showTags]`),
  milestone, start → due, pomodoros, `objective-chip` (via `objectivesServing` from `lib/flow-graph.ts`, one computed
  map).

Check -> `TodosService.toggleDone`; title (a real button) -> `task-detail-modal` hosted by the tab (`detailId`
signal); clicking the project label -> `ViewService.openProject(id)`. With sort = project, show a group heading per
project (icon, name, count). Render at most 200 rows, then a *Show more (N)* button (adds 200).

Empty states: no tasks at all ("No tasks yet" + *New task* calling `state.openNewTask`); nothing matches ("No tasks
match" + *Clear filters* = `clearSearchAndFilters` + project filter).

Below 600px: the density switch stays, project/due chips wrap under the title in compact, the kebab stays.

## i18n

Terse keys under `projects.tasks.*` plus `projects.tabTasks`, in both `src/i18n/locales/en.json` and `es.json`. Reuse
existing keys (`projects.filters.*`, `todo.*`, `kanban.*` status labels) wherever they exist. Watch the initial
budget (en.json is eager): expected cost well under 1 kB.

## Docs

Update `AGENTS.md` (Lazy loading, Tasks and projects page, the lazy-chunk list) with the new tab, its state keys and
the drawer `mode`.

## Verify

`npm run build`, `npm run check:lazy`, then the tab in the browser (three densities, filters, sort, done switch,
detail modal, dark theme, 375px).
