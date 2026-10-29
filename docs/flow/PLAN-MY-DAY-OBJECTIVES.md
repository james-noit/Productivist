# Plan my day: work on current objectives

Goal: Plan my day gives access to the project objectives (the Flow `Objective`s) and guides the user
from the top tier down to one specific task:

    long-term objective → medium-term objective → short-term objective → milestone / task → today

Naming: the Flow `Objective` is called a **project objective** in the UI. The wizard's free-text
`DailyObjective` stays **today's objective**. Both are "objectives" in the code, so the texts
must say which one they mean.

## Model

- `DailyObjective` (in `services/daily-plan.service.ts`) gains an optional `flowObjectiveId?: string`:
  the project objective (normally short term) this daily objective works towards. It travels inside
  the sync blob's `dailyPlan.objectives` (already `isArray`) and in `committedObjectives`. It is optional,
  so older clients ignore it. A dangling id (deleted objective) is ignored everywhere: always look it up
  in `FlowService.objectives()`, never trust the id.
- The step-1 draft list `objectivesList` changes from `string[]` to `DraftObjective[]`
  (`{ text: string; flowObjectiveId?: string; taskIds?: string[] }`). `taskIds` are tasks the user
  picked in the tree, to be planned under this objective as soon as planning starts.
- `updateObjectives(drafts)` / `startPlanning(drafts)` take `DraftObjective[]`. An objective keeps its
  id when both its text and its `flowObjectiveId` are unchanged (same matching rule as now). In
  `startPlanning`, for each objective with a `flowObjectiveId` whose project still exists:
  `assignProjectToObjective(projectId, id)`; for each picked task that still exists and is open:
  `assignProjectToObjective(task.projectId ?? UNASSIGNED_GROUP_ID, id)` and `assignTask(task, id)`
  (skip tasks that are already planned).
- `goBackToObjectives` rebuilds the drafts from `objectives()` including `flowObjectiveId`
  (the picked `taskIds` are already planned by then, so they are not rebuilt).
- `DailyPlanService` is in the initial bundle: keep these changes small and keep every tree/graph
  calculation out of it.

## Pure lib: `src/lib/plan-flow-tree.ts` (lazy, framework-free)

`buildObjectiveTree(input)` with the projects (display order), objectives, links, milestones and
todos, and returns one section per project that has at least one **active** objective:

- Roots: active long-term objectives; then active medium-term objectives that feed no shown long-term one;
  then active short-term objectives that feed no shown medium/long one. So nothing is lost when a user
  only uses some horizons.
- Children of an objective: the active objectives of a shorter horizon that link to it (`FlowLink`
  `fromKind: 'objective'`).
- Under a **short-term** objective (and under any objective, for work linked directly to it): the open work
  that feeds it: milestones linked to it (with their open tasks, in `order`) and tasks linked directly.
  Show at most 5 tasks per node, plus a "+N more" count.
- Precedence at every level: `targetDate` ascending (none last), then `order`, then title. Projects
  keep `ProjectsService.sortedProjects()` order, but a project whose nearest short-term target date
  is earliest comes first (projects without dates keep their order after).
- Progress per objective: reuse `buildFlowGraph(...).progress` (one graph per project).
- The "next short-term objective" of a task (the first short-term objective its chain reaches, by the same
  precedence) is a helper `shortObjectiveOfTask(graph, taskId)`, using `chainOf`.
- Add it to `NEVER_INITIAL_UI` in `scripts/check-lazy-chunks.mjs`.

Add cases to a small self-check if it is cheap. The repo has no test framework. Otherwise verify
the tree by hand in the browser.

## Step 1 (Objectives): "Work on current objectives"

A new lazy component `plan-flow-objectives` (rendered by `daily-backlog-view` inside `@defer (on immediate)`
in the `prompt` stage, between the input form and the existing suggestions `<details>`):

- A `<details>` with the summary "Work on current objectives". It is open by default when at least one
  active project objective exists and no daily objective has been typed yet. It is not rendered at all
  when no project has an active objective.
- An indented tree (`role="tree"` is overkill. Use nested `<ul>` with real buttons, like the Flow
  Outline), per project (project icon + name as a heading), each objective row showing a horizon pill
  (`--color-horizon-short/medium/long`), the title, the target date (`Intl.DateTimeFormat` in a computed)
  and "done/total". Long and medium rows can be expanded and collapsed (open by default down to the
  first short-term level), and short-term rows show their work.
- Actions:
  - On a **short-term** objective (and on a medium or long one with no shorter children): *Work on this
    today* (`target` icon). It adds `{ text: objective.title, flowObjectiveId }` to `objectivesList`.
    If it is already in the list, the button becomes a pressed "Added" that removes it again.
  - On a **task** row: *Plan this task* (`plus` icon). If the task's short-term objective is not in the
    list yet, it adds it with this task in `taskIds`. Otherwise it appends the task to that draft's
    `taskIds` (toggle). This takes the user straight from the top tier to a specific task.
- Step 1's chips show linked drafts with a `target` icon, the project objective's horizon colour and
  "· N tasks" when tasks are picked.
- Outputs only: the component emits `addObjective(draft)` / `toggleTask(...)`, or writes
  `DailyPlanService.objectivesList` directly (the list already lives in the service, so writing
  directly is fine and simpler).

## Step 3 (Tasks): connect daily ↔ short-term objective

In `plan-objectives-step`:

- A card of a **linked** daily objective shows a muted breadcrumb under its title:
  `target` icon "Short term title ← Medium title ← Long title" (the first chain upwards by precedence),
  with "Change" / "Unlink" in its ⋯ menu (or as a small button).
- A card of an **unlinked** daily objective shows *Connect to a project objective* (a small `.select`
  of the active short-term objectives of the projects linked to that card in step 2. If there are none,
  the select lists every active short-term objective, grouped by project). Choosing one sets
  `flowObjectiveId` (new `DailyPlanService.linkFlowObjective(dailyId, flowObjectiveId | null)`)
  and links its project to the card.
- When linked, *Suggested* puts the open tasks that feed that short-term objective first, then the
  current suggestions.
- New tasks typed in a linked card (`submitNew`) are also linked with `FlowService.link({ kind: 'task', id }, flowObjectiveId)`
  when the task's project is the objective's project (links never cross projects). Ignore a refusal.
- Planned rows that do not yet feed the linked short-term objective (same project) show a quiet link
  action ("Link to <objective>", in the row's kebab and context menu) that calls `FlowService.link`.
  Rows that feed it show a small `target` mark.
- The cards' data stays in the one `cards` computed. The graph is built once per project involved, not per row.

## Strings

`en.json` is bundled eagerly, so keep keys terse and few (under `planningLab.flow.*`):
`title` ("Work on current objectives"), `workToday` ("Work on this today"), `added` ("Added"),
`planTask` ("Plan this task"), `more` ("+{{n}} more"), `connect` ("Connect to a project objective"),
`linkTask` ("Link to “{{title}}”"), `unlink` ("Unlink"), `none` ("No project objective"),
`short`/`medium`/`long` reuse the existing Flow horizon keys if they exist. Spanish too.

## Out of scope

- No backend change (the blob carries the new optional field).
- Achieving a project objective stays manual (Flow).
- The Pomodoro objective line keeps showing the daily objective text.

## Checks

- `npm run build` with no new warnings. Note the initial bundle size in AGENTS.md's budget
  paragraph (before/after).
- `npm run check:lazy` passes, with the new lib and component in `NEVER_INITIAL_UI`.
- `npm run check:sportask` still passes (sync-engine untouched, but cheap).
- Update AGENTS.md (Plan my day modal section) to describe the feature.

## Status

Built: everything in the plan.

- `lib/plan-flow-tree.ts` (`buildObjectiveTree`, `chainUp`, `shortObjectiveOfTask`, `taskIdsFeeding`, `compareObjectives`), lazy; added to `NEVER_INITIAL_UI` with the new `plan-flow-objectives` component.
- `DailyObjective.flowObjectiveId`, `DraftObjective`, `updateObjectives`/`startPlanning` on drafts, `linkFlowObjective`; the sync blob carries the field unchanged (`objectives`/`committedObjectives` are passed through as arrays).
- Step 1: `plan-flow-objectives`, chips with horizon mark and task count. Step 3: breadcrumb, Unlink, Connect select, suggestions led by feeding tasks, `submitNew` linking, feed mark and "Link to ..." in the kebab and context menu.
- Strings: `planningLab.flow.*` (en, es); horizon names reuse `flow.horizons.*`.

Deviations:
- Linking the projects of the drafts and planning the picked tasks happen in `daily-backlog-view.chooseFromProjects` right after `startPlanning`, not inside `DailyPlanService`, so the eager service does not inject the todo/project stores.
- Everything in the tree is expanded by default (long, medium and short rows alike); the 5-task cap keeps it short. Task rows toggle "Plan this task" / "Added" (second click removes the pick).
- Added the string `feeds` besides the ones listed; the chips reuse `planningLab.count.one/other` for "N tasks".
- No self-check cases added; the tree was checked with a throwaway script (roots, children, 5-task cap, `chainUp`, `shortObjectiveOfTask`).

Not verified: the UI in a browser (no dev server was started).
