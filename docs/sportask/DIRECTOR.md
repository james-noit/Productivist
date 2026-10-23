# Fitness director: authoring Sportask content without a release

Today every piece of Sportask content (exercises, ladders, programs, templates, cadences, texts) is TypeScript in
`src/lib/sportask/` and ships in the lazy bundle. Changing a dose or fixing a cue means a developer, a build and an app
release (Thunderbird add-on, two stores). This document designs a **Fitness director** role and a **catalog overlay**: the
director edits the content in the app, publishes a version, and every client picks it up the next time Sportask loads.

Read `AGENTS.md` (Backend, Sportask, performance and lazy rules) first. Everything here follows it.

---

## 1. What a fitness planner needs

Thinking as a coach or programmer who owns the content (not the code), in the order they would reach for it:

1. **An exercise library they can author.** Name and coaching cues in each language, the movement pattern and body zones,
   the metric (reps or seconds), a default dose and timing (seconds per rep), the level (1 to 5), the equipment it needs,
   whether it is loadable, impact (none, low, high), whether it is on the floor, a MET value for the calorie estimate, and
   a picture (here: one of the existing pictograms, with a live preview). They must be able to **duplicate** a built-in
   into a variant, **override** a built-in (fix its cue, change its dose) and **retire** one without breaking history.
2. **Progressions (ladders).** The order of difficulty for each movement pattern, with alternatives of similar difficulty on
   each rung. This is the heart of a strength program: what comes after the knee push-up.
3. **Programs and phases.** Weeks, days a week, phases (weeks 1 to 2: technique, 3 to 4: more volume), the generator
   parameters of each phase (hold seconds, rep ranges, sets a day, rest, tempo, allowed levels), assessment weeks and the
   assessments they use, and a note that the user sees for each phase.
4. **Assessments.** What is tested, how it is explained, how long it lasts, which exercise performs it.
5. **Templates for free training.** Slots (a fixed exercise with a dose, or "any push exercise at most level 2"), format
   (sequence, intervals, EMOM), work and rest seconds, the minimum block length.
6. **Timings.** Cadences (focus, break, long break, exercise every N breaks) and the work and rest numbers above.
7. **Safety rails.** Hard limits on what can be entered (a 600-second hold is refused), consistency lints (a jumping
   pictogram on an exercise marked *no impact*, a floor pictogram on one marked *not floor*, a high-impact exercise at
   level 1), the rule that warm-ups only use levels 1 and 2 (so a pattern needs a gentle option), and the fact that the
   existing user constraints (*low impact*, *no floor*) are always honoured by the generator.
8. **See what a user would get before publishing.** A preview that runs the real generator with the draft: pick a goal,
   program, week, level, block length, equipment and constraints, and read the resulting block, then roll again. Plus an
   automatic sweep (every goal, phase, length, equipment set and constraint set) that fails when a block would be empty,
   would use an exercise the user cannot do, or would not fit the break.
9. **Validation before publishing.** One list of errors (block publishing) and warnings (do not), each pointing at the thing.
10. **Drafts versus published, versions and rollback.** Work for days on a draft nobody sees; publish a numbered version
    with a note; see the history; go back to an earlier version in one step.
11. **i18n.** Every visible text in English and Spanish; publishing is refused with a missing one.
12. **Audit.** Who published what and when, with a note, and a readable change list between two versions.

Out of scope, said plainly: **drawing new pictograms** (the director chooses one of the existing figures; a new figure
is code in `pictogram-paths.ts`), new goals, generators, progression models, metrics and skins (code), uploading photos or
videos, translators' workflows, staged roll-outs, scheduled publishing and approval by a second person.

---

## 2. Architecture

### 2.1 The role

Assigned **like the admin, from backend configuration**, never from a column: `FITNESS_DIRECTOR_EMAILS` (property
`app.fitness.director-emails`), a comma-separated list of account emails (lower-cased, blank means nobody). `BearerTokenFilter`
grants `ROLE_FITNESS_DIRECTOR` to a token whose account email is in the list, and the **admin is always a director too**
(`ROLE_ADMIN` implies the other authority). `SecurityConfig` guards `/api/fitness/**` with `hasRole("FITNESS_DIRECTOR")`.
A list (not one address) because content is usually owned by a small team, unlike the admin who is one person. As with
`ADMIN_EMAIL`: register the account first, signup is open.

*Why not a role column?* The admin precedent: no schema state to get wrong, no way to escalate through the API, revocation
is a config change and a redeploy. The cost (a redeploy to add a director) is acceptable for a handful of people.

### 2.2 Content as data: a versioned catalog overlay

The built-in registries stay exactly as they are: they are the **base**, always present, offline, and the fallback for
anything that fails. A **catalog overlay** is one JSON document layered over them at runtime:

```
{ schema: 1,
  exercises:   [{ id, ...fields }],   // a built-in id = a patch of those fields; an `fd-` id = a new exercise (all fields)
  ladders:     [{ id, rungs }],       // built-in ladders only: replaces the rungs
  assessments: [{ id, name?, instructions?, seconds?, exerciseIds?, maxRung? }],   // patches
  equipment:   [{ id, name?, icon?, details? }],
  goals:       [{ id, name?, description?, programs?: [{ id, ...fields, phases? }] }],  // programs: patch or new `fd-` program
  templates:   [{ id, nameText?, slots?, format?, workSeconds?, restSeconds?, minSeconds? }],
  cadences:    [{ id, name?, focusSeconds?, breakSeconds?, longBreak?, exerciseEvery? }] }
```

Rules the merge and the validator enforce:

- **Ids are never renamed or deleted.** A built-in id can be patched; a new id must be `fd-` + letters, digits, `_.-` (so it
  can never collide with a built-in or with a user template, and is recognisable in the data). An exercise is *retired*
  (`retired: true`), not removed: stored blocks and templates keep resolving it. The validator also refuses a draft that drops
  an id the currently **published** version has (continuity), with a one-click fix that puts it back (an exercise retired).
- A patch only carries the fields that differ from the base, so a later built-in improvement still reaches fields the
  director did not touch. The editor shows the full item and computes the patch (`patchFromFull`).
- Phase parameters keep the shape of the base phase (same keys, same types), with numeric limits per key (section 5).
- The **server stores shape and size, never vocabulary** (like `sport_blocks`): an object, `schema` an integer, every other
  key an array of objects whose `id` matches the id pattern, bounded depth, entry count and text size (256 KB).

Why an overlay and not "the whole catalog in the database"? The built-ins carry functions (generators, progression, `adapt`)
that cannot be data, the app must work with no backend at all, and patching keeps the diff reviewable ("what did the director
change") instead of a 4,000-line document.

### 2.3 Storage and endpoints (Flyway `V9__fitness_catalog.sql`)

| Table | Holds |
|---|---|
| `fitness_catalog_versions` | `version` (1, 2, ... monotonic, the primary key), `document` JSONB, `note`, `kind` (`publish` or `rollback`), `author_id` (FK, `ON DELETE SET NULL`), `author_email` (denormalised, so the audit survives an account deletion), `published_at` |
| `fitness_catalog_draft` | one row (`id = 1`): `document` JSONB, `revision` (a counter for optimistic concurrency), `base_version`, `updated_by_email`, `updated_at` |

One shared draft (a team edits one catalog), guarded by `revision`: a `PUT` carries the revision it read and gets **409** if
someone saved in between. The published head is the highest `version`; there is no separate pointer to drift.

| Method | Path | |
|---|---|---|
| GET | `/api/fitness/me` | Director or admin: `{email, admin}`. 403 for everyone else; the frontend uses it like `/api/admin/me`. |
| GET | `/api/fitness/draft` | `{document, revision, baseVersion, updatedBy, updatedAt}` (an empty overlay at revision 0 if never saved). |
| PUT | `/api/fitness/draft` `{document, expectedRevision}` | Validates shape and size, saves, returns the new revision. 409 on a stale revision, 400 on a bad shape. |
| POST | `/api/fitness/publish` `{note, expectedRevision}` | Snapshots the current draft as version N+1 (transaction + advisory lock). 409 if the draft moved since the director validated it. |
| GET | `/api/fitness/versions` | Newest first: version, note, kind, author, date, size. |
| GET | `/api/fitness/versions/{n}` | One version with its document (for the diff and for restoring). |
| POST | `/api/fitness/versions/{n}/restore` | Copies version n **into the draft** (not published). The editor then applies the continuity fix and the director publishes it as a *rollback* (kind recorded, note defaulting to "Rollback to vN"). |
| GET | **`/api/sport-catalog`** | **Public, no token.** `{version, publishedAt, document}` (version 0 and an empty document before the first publish). `ETag: "v<N>"`, `Cache-Control: no-cache`, honours `If-None-Match` with 304. |

**Why the read endpoint is public.** The content is not personal, the app is local-first and sync is optional, a signed-out
user (and every Thunderbird or mobile install, which call `API_URL`) must get the same training content, and requiring a
token would tie content to accounts for no benefit. It sends nothing about the user (no token, no cookies), is cheap
(one row, 304 on a revalidation) and sits behind the same nginx rate limit as the rest of `/api/`. The write side is all
behind the role. CORS gains `PUT`, `If-None-Match` (request) and `ETag` (exposed).

**Rollback = restore into the draft, then publish.** Never an in-place switch of a pointer: every state clients have ever
seen stays addressable as a version, and publishing always goes through the same validation.

**Audit.** Each version carries author, time, kind and note; the Versions panel diffs any version against the current one
(ids added, changed, removed per section). Publish, restore and role failures are also logged like the admin's actions.

### 2.4 The client

All of it is lazy (`lib/sportask/overlay/*` is under the existing directory walk of `NEVER_INITIAL_UI`).

- **Layerable registries.** `createRegistry` gains `base` (the built-in items), `replace(items)` and a `revision`
  counter; the code that already reads `CATALOG.exercises.all`, `GOALS.get(...)` etc. keeps working and sees the layered
  content. `ladderIndex`'s cache is keyed by the ladders' revision.
- **Consuming.** `overlay/store.ts`: the published overlay is cached device-locally in `productivist.sportCatalog`
  (`{version, etag, document}`; never in the sync blob, never exported). `ensureOverlay()` applies the cache **synchronously**
  and is called by `loadSportaskTexts` (every lazy Sportask component holds its first render on it) and by `makePending`
  (the one place a plan is made); then, if the backend exists (`syncEnabled`), it revalidates in the background with
  `If-None-Match`, and a newer version is cached and applied. With no backend, sync disabled, offline or any failure,
  nothing changes: the built-ins. Whatever is fetched passes `sanitizeOverlay` and the structural half of `validateOverlay`;
  a document with errors is ignored whole.
- **Effective catalog version.** Blocks store `catalogVersion`. It becomes `CATALOG_VERSION + overlay version` (monotonic:
  either part only goes up, and a rollback is a new, higher version), so a row says which content produced it.
- **Stored history stays valid.** A block stores its steps (exercise ids, seconds, doses), so history renders the same
  whatever the content is later; unknown ids fall back to the id. **Progression replay is different:** it reads ladders and
  exercises to rebuild a user's level, so editing a ladder's rungs or an exercise's `level`/`dose` changes what replay says
  from then on (a user may move a rung). That is inherent to deriving state from history; the editor says so next to every
  ladder edit, and the version bump makes it traceable.
- **Registry application is a mutation of module state** (`registry.replace`): a screen already on display shows the new
  content the next time it computes (a block generated after the update uses it immediately, because generation reads the
  registries at call time). We do not make every component reactive to the overlay.
- **Preview and validation are pure and never touch the registries**: `GenerationContext` gains optional `goals` and
  `templates` registries (the catalog was already injectable), and `contentFor(overlay)` builds a complete layered set of
  fresh registries. The same function powers the live application, the preview and the checks.

### 2.5 Validation, in one place

`validateOverlay(overlay, { published?, deep })` is pure and shared by the editor (before Save/Publish), the consumer (the
structural half, before applying) and `scripts/sportask-check.ts`:

- *Structure:* ids well-formed and unique; every reference resolves (equipment, ladders, exercises in rungs, assessments,
  exercises in template slots and assessments); every text has English and Spanish and is within length.
- *Ranges:* doses, MET, level, seconds per rep, cadence values, phase parameters (hard limits per key).
- *Consistency / safety:* pictogram versus impact and floor flags, a ladder rung's exercises share the ladder's pattern, program
  weeks are fully covered by ordered phases, assessment weeks are inside the program, a mobility exercise has no impact.
- *Continuity:* nothing the published version has is missing.
- *Deep (publish only):* the **generation sweep** (`smoke.ts`): for every goal x program phase x block length x equipment set x
  constraint set, and every template, `generate` on the layered content must not return an empty plan, must use only
  exercises available in that context, and must fit the break. A fall-back to the mobility block is reported as a warning.

### 2.6 The editor (view `fitness`, lazy)

Shown only while `AccountService.isFitnessDirector()` (from `/api/fitness/me`); a menu entry and a new `@defer` branch in
`AppComponent`, like the admin's. A status bar (Saved / Unsaved changes / Saved, not published), **Save draft**, **Publish**,
and tabs: **Exercises** (list, search, filters, create/override/duplicate/retire, full form, live pictogram), **Ladders**,
**Programs** (phases and parameters), **Templates**, **Timings** (cadences), **Assessments**, **Equipment**, **Preview**,
**Checks** (validation list) and **Versions** (history, diff, restore, rollback). The draft is the signal `overlay`; the
last saved copy is the baseline; `dirty` is a comparison; leaving with unsaved edits asks through a `.confirm-bar`.

---

## 3. Phasing

**Implemented now (a working vertical slice, end to end):** the role and `FITNESS_DIRECTOR_EMAILS`; V9; the draft, publish,
versions, restore and public read endpoints with shape/size validation, ETag and audit fields; the admin stats show the
catalog version; the frontend role probe, menu entry and lazy view; the layerable registries, the overlay types, sanitiser,
merge, validator, generation sweep, diff, cache and background fetch; the editors for exercises (full), ladders, programs and
phases, templates, cadences, assessments and equipment; the live preview; the checks list; versions with diff, restore and
rollback; the self-check section; backend unit tests.

**Later:** retiring things other than exercises (templates, programs, cadences are only patched now); new goals, assessments
and ladders (they need code: a generator, a metric, a pattern); JSON export/import of the overlay and of one exercise;
a side-by-side "published versus draft" preview; reactive refresh of screens when a newer overlay arrives while they are open;
a changelog written by the director per section; a second person's approval before publishing; staged or scheduled publishing;
per-language translation status; media (photos, short videos) with a storage capability; new pictograms (needs the pictogram
authoring tool, owned elsewhere).

---

## 4. Status (what was built, deviations, limits)

### Built

- **Backend** (`backend/`): `V9__fitness_catalog.sql`; `FITNESS_DIRECTOR_EMAILS` and `BearerTokenFilter` (admin implies director);
  `SecurityConfig` (`/api/fitness/**`, public `GET /api/sport-catalog`, CORS `PUT`, `If-None-Match`, exposed `ETag`);
  `fitness/FitnessCatalogValidator` (shape and size only), `FitnessCatalogService`, `FitnessController`, `SportCatalogController`;
  `catalogVersion` in the admin stats; `backend/README.md`; unit tests (validator, role mapping, ETag matching). Verified by hand
  against a local Postgres 17 with real tokens for an admin, a director and an ordinary user (403 and 401 included).
- **Library** (`src/lib/sportask/overlay/`, lazy): `types`, `sanitize-overlay`, `merge` (`contentFor`), `validate` (+ `smoke`, the
  generation sweep), `preview`, `edit`, `program-edit`, `apply`, `version`, `store` (device cache, `If-None-Match` revalidation).
  `registry.ts` gained `base`, `replace` and `revision`; `GenerationContext` gained optional `goals` and `templates`;
  `progression.ts`'s ladder index is keyed on the registry revision; `assessmentMetric` reads its name live; `blockRow` stores
  `effectiveCatalogVersion()`; `loadSportaskTexts` and `makePending` call `ensureOverlay()`.
- **Frontend**: `AccountService.isFitnessDirector`, the `fitness` view (menu entry, `@defer` branch), `FitnessEditorState`,
  `FitnessService`, and the tabs `fitness-exercises`, `-ladders`, `-programs`, `-templates`, `-timings`, `-assessments`,
  `-equipment`, `-preview`, `-checks`, `-versions`, `fitness-text-pair`; strings in `i18n/fitness-texts.ts` (lazy) plus
  `menu.fitness`.
- **Self-check**: section 14 of `scripts/sportask-check.ts` (registries, merge, sanitiser, every validation rule, continuity, the edit
  helpers, preview and sweep, string parity, and the consumer applying and restoring the live registries).

### Deviations from section 2

- `PUT /api/fitness/draft` needed `PUT` in the CORS methods and in `core/api.ts`'s method union (two one-word changes).
- A publish that changes nothing answers **422** (not 409, which means "the draft moved").
- **Rollback is two steps by design**: `POST .../restore` copies a version into the draft, the client puts back whatever `fd-`
  item the published head has and that version lacks (`keepPublished`, exercises as retired), the director publishes it as a
  rollback (`rollbackOf` is recorded). There is no `rollback` endpoint.
- Only **exercises** can be retired. Templates, programs, cadences and equipment that were published can be edited but not deleted
  (the continuity rule), and cannot be hidden yet.
- Assessments and ladders can be **edited only** (a new assessment needs a metric, a new ladder a generator that reads it).
- The effective catalog version is `CATALOG_VERSION + overlay version`.

### Known limits

- The registries are module state: a screen already on display keeps what it computed until it computes again; generation reads the
  registries at call time, so the next block already uses a newer overlay. Nothing is reactive to an overlay that arrives mid-session.
- The first block of a **first-ever** visit may be generated before the first fetch answers (no cache yet): built-ins, as before.
- Editing a ladder or an exercise's level or dose changes what progression replay derives for existing users (the editor says so).
- Drafts are saved explicitly (no autosave); a reload loses unsaved edits (the Save button and the status line say when there are some).
- A published document that a hand-made request made invalid is ignored whole by every client; the director's editor shows the same
  errors and blocks publishing until they are fixed, but the server itself does not check vocabulary.
- Every signed-in user's client now also asks `/api/fitness/me` (403 for ordinary users), like `/api/admin/me`.
