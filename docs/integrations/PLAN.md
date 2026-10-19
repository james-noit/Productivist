# Git forge integration: GitHub, GitLab, Forgejo, Gitea

Import a repository as a **project**, its milestones as **milestones** and its issues as **tasks**, then refresh them
later without creating duplicates. This document is the implementation plan (for the implementing agent) and the
per-platform setup guide (for users and whoever runs a self-hosted forge).

Read `AGENTS.md` first: everything here follows its rules (zoneless + OnPush + signals, lazy chunks, terse eager
strings, optional wire fields emitted only when set, wrapper types in `SyncDtos`, no `window.confirm`, etc.).

---

## 1. Decisions (and why)

| Question | Decision |
| --- | --- |
| Who talks to the forge? | **The client**, directly with `fetch`. The app is local-first and works without the backend, in Thunderbird and on mobile; the backend only steps in as an optional relay (phase 3) for instances that refuse cross-origin requests. |
| Authentication | **Personal access tokens (PAT)**, read-only scopes, for all four platforms. It is the only method that works for any self-hosted instance (OAuth needs an app registered *on each instance*). OAuth for github.com / gitlab.com / codeberg.org is an optional later phase. |
| Where is the token stored? | Device-local `localStorage` key `productivist.forgeConnections`, **never synced, never exported**, never sent to our backend except through the phase-3 relay (in transit only, never stored or logged). |
| One adapter per platform? | Three adapters: `github`, `gitlab`, `gitea`. **Forgejo uses the Gitea adapter**: Forgejo is a Gitea fork and keeps the same `/api/v1` API (Codeberg runs Forgejo). The UI still offers "Forgejo" and "Codeberg" as choices (different labels, default hosts and token pages). |
| How are imported rows linked to the remote? | An optional `source` field on `Project`, `Milestone` and `Todo` (emitted on the wire only when set, like `recurrenceId`), synced, so a second device can refresh the same project if it has its own token for that host. |
| How are duplicates avoided? | **Deterministic ids** derived from the remote identity (same idea as recurrence occurrences `r-<series>-<date>`): two devices importing the same issue produce the same todo id and merge in sync. |
| Two-way sync? | Not in the first phases. Import + refresh is read-only. Write-back (close/reopen the issue when the task is completed) is phase 5, opt-in per project. |
| Webhooks? | No. The backend has no public domain and the app is local-first. Refresh is on demand plus a light poll while a linked project is open. |

### CORS, measured on 2026-10-19

`curl -H 'Origin: https://example.com'` (and a preflight asking for `Authorization`) against the public instances:

| Instance | `Access-Control-Allow-Origin` | Methods allowed | Pagination headers exposed |
| --- | --- | --- | --- |
| api.github.com | `*` | GET, POST, PATCH, PUT, DELETE | `Link`, `ETag`, `X-RateLimit-*` |
| gitlab.com `/api/v4` | `*` | all | `Link`, `X-Next-Page`, `X-Total`, `X-Total-Pages`, `ETag` |
| codeberg.org (Forgejo) | `*` | **GET only** | **none** |
| gitea.com | `*` | **GET only** | **none** |
| Self-hosted Gitea / Forgejo | **off by default** (`[cors] ENABLED = false`) | — | — |

Consequences the code must respect:

- GitHub and GitLab (cloud and, by default, self-managed GitLab) work from the browser, the Thunderbird tab and the
  mobile WebView with plain `fetch`.
- For Gitea/Forgejo **do not rely on `Link` or `X-Total-Count`**: they are not readable cross-origin. Paginate with
  `page` + `limit` and stop when a page returns fewer than `limit` items.
- Writes (phase 5) to Codeberg/gitea.com are blocked by CORS (GET only): they need the relay or the native transport.
- Self-hosted Gitea/Forgejo need either the admin to enable CORS (section 9) or another transport (phase 3).
- A CORS failure surfaces as a `TypeError` from `fetch` with no status. Report it as `'cors'` (with the help text from
  section 9), not as "wrong token".

---

## 2. Data model

### 2.1 `src/types/forge.ts` (new, framework-free)

```ts
export type ForgeKind = 'github' | 'gitlab' | 'gitea';          // gitea covers Forgejo and Codeberg
export type ForgeFlavor = 'github' | 'gitlab' | 'gitea' | 'forgejo' | 'codeberg'; // UI label only

/** Device-local. Holds the secret: never synced, never exported. */
export interface ForgeConnection {
  id: string;            // createId()
  kind: ForgeKind;
  flavor: ForgeFlavor;
  /** Web base URL without trailing slash, e.g. https://github.com, https://gitlab.example.org, https://codeberg.org */
  baseUrl: string;
  token: string;
  /** Filled by "Test connection". */
  username?: string;
  createdAt: number;
}

/** Synced, on Project / Milestone / Todo. No secret in here. */
export interface ExternalRef {
  kind: ForgeKind;
  /** Normalised web base URL (same rule as ForgeConnection.baseUrl): the key that finds a connection on any device. */
  host: string;
  /** Stable remote repository id (GitHub/Gitea numeric id, GitLab project id) as a string. */
  repoId: string;
  /** 'owner/name' (GitLab: path_with_namespace), for display and URLs; may change on rename, repoId does not. */
  repoPath: string;
  /** Issue number (GitHub/Gitea `number`, GitLab `iid`) or milestone id; absent on a project. */
  number?: number;
  /** Web URL of the remote item ("Open in GitHub"). */
  url: string;
  /** Remote `updated_at` and state when last imported, to tell remote changes from local ones. */
  remoteUpdatedAt?: string;
  remoteState?: 'open' | 'closed';
}

/** Only on a Project's source: the import options and the refresh cursor. */
export interface RepoSourceOptions {
  includeClosed: boolean;      // default false: only open issues on first import
  onlyAssignedToMe: boolean;   // default false
  importMilestones: boolean;   // default true
  labelsAsTags: boolean;       // default true
  /** Epoch ms of the last successful refresh; becomes the `since` / `updated_after` filter. */
  lastSyncedAt?: number;
}
```

Add `source?: ExternalRef & { options?: RepoSourceOptions }` to `Project`, `source?: ExternalRef` to `Milestone` and
`Todo` (`src/types/project.ts`, `src/types/todo.ts`).

### 2.2 Deterministic ids

In `lib/forge-map.ts`: `forgeId(parts: string[]) = 'fg-' + hashString(parts.join('|'))` using `hashString` from
`lib/sync-engine.ts` (53 bits, already in the initial bundle).

- project: `forgeId([kind, host, repoId])`
- milestone: `forgeId([kind, host, repoId, 'm', milestoneId])`
- todo: `forgeId([kind, host, repoId, 'i', number])`

Ids stay well under the backend's 64-character limit.

### 2.3 Field mapping (pure functions in `lib/forge-map.ts`)

| Productivist | GitHub | GitLab | Gitea / Forgejo |
| --- | --- | --- | --- |
| Project.name | `name` | `name` | `name` |
| Project.description | `description ?? ''` | `description ?? ''` | `description` |
| Project.icon | `'code'` (existing icon name) | `'code'` | `'code'` |
| Milestone.name | `title` | `title` | `title` |
| Milestone.startDate | — | `start_date` (already `YYYY-MM-DD`) | — |
| Milestone.dueDate | `due_on` (timestamp) | `due_date` (`YYYY-MM-DD`) | `due_on` (timestamp) |
| Todo.title | `title` | `title` | `title` |
| Todo.description | `body` (cut to 100 000 chars) | `description` | `body` |
| Todo.tags | `labels[].name` | `labels` (strings) | `labels[].name` |
| Todo.done / completedAt | `state === 'closed'` / `closed_at` | `state === 'closed'` / `closed_at` | `state === 'closed'` / `closed_at` |
| Todo.createdAt | `created_at` | `created_at` | `created_at` |
| Todo.milestoneId | `milestone.number` → id | `milestone.id` → id | `milestone.id` → id |
| Todo.dueDate | — | `due_date` | `due_date` (timestamp) |
| skip | items with a `pull_request` key | — (MRs are a separate endpoint) | request `type=issues` |

Rules:

- Timestamps become local days with `toIso(new Date(ts))` from `lib/dates.ts`; plain `YYYY-MM-DD` strings are kept
  as they are (`isIsoDate`). Run `sanitizeDates` on every built row. Never `new Date('YYYY-MM-DD')`.
- `importance`/`urgency`: default `'medium'`/`'medium'`, then a small label heuristic (`priorityFromLabels`):
  labels such as `priority::high`, `priority: high`, `P0`/`P1`, `critical`, `urgent` → urgency high;
  `P3`, `low`, `priority::low` → low; `important` → importance high. Case-insensitive, table-driven, easy to extend.
- `status`: `inProgress` for labels like `in progress`, `doing`, `workflow::in dev`; `review` for `review`,
  `needs review`. Otherwise absent.
- Labels used for priority/status are still kept as tags (when `labelsAsTags`).
- Never set `recurrenceId`, `pomodorosForTermination` or `startDate` from the remote.

### 2.4 Refresh / merge rules (pure `mergeIssue(local | undefined, remote, opts)`)

Remote-owned fields: `title`, `description`, `tags` (when `labelsAsTags`), `milestoneId`, `dueDate`, `done`,
`completedAt`. Local-only fields, **never overwritten**: `importance`, `urgency`, `status`, `order`, `startDate`,
`pomodorosForTermination`, `projectId` (a task the user moved to another project stays there).

1. Not found locally and not seen before → create (only open issues on the first import unless `includeClosed`).
2. Found and `remote.updated_at === local.source.remoteUpdatedAt` → nothing changed remotely, leave it alone
   (the user's local edits win).
3. Found and the remote changed → overwrite the remote-owned fields, update `source.remoteUpdatedAt`/`remoteState`.
   `done` changes only if the remote **state** changed since the last import (`remoteState`), so completing a task
   locally is not undone by an unrelated remote edit such as a new label.
4. Deleted locally: refresh uses `since = lastSyncedAt`, so a deleted task only comes back if its issue changes
   remotely afterwards. Document this in the UI text ("Deleted tasks return only if the issue changes").
5. The issue disappeared remotely (deleted, transferred, made private): it simply stops being updated. No local
   deletion.
6. Write everything in **one write per store** (`TodosService.updateMany`/a new `upsertMany`, `ProjectsService`
   equivalents), never one write per issue. Then call `ProjectsService.sweepFlow()` only if milestones were removed
   (they are not, in these phases).

Add `TodosService.upsertMany(todos: Todo[])` and `ProjectsService.upsertProject` / `upsertMilestones` if no
equivalent exists: insert-or-replace by id, immutable updates, one `set`, `ProjectActivityService.touch` once per
project.

---

## 3. Phase 1: read-only import and refresh (GitHub, GitLab, Gitea/Forgejo with CORS) — DONE

### 3.1 Pure libraries (lazy; never imported by `AppComponent`, the header, the menu or root services)

- `src/lib/forge-map.ts` — `forgeId`, `normalizeBaseUrl` (lower-case scheme/host, strip trailing `/`, strip `/api/...`),
  `apiBase(conn)` (see table below), the mappers of 2.3 and `mergeIssue` of 2.4. No `fetch` here.
- `src/lib/forge-adapters.ts` — one adapter per `ForgeKind` implementing:

```ts
interface ForgeAdapter {
  whoAmI(c: ForgeConnection): Promise<{ username: string }>;
  listRepos(c: ForgeConnection, query: string, page: number): Promise<{ repos: RemoteRepo[]; more: boolean }>;
  getRepo(c: ForgeConnection, repoId: string): Promise<RemoteRepo>;
  listMilestones(c: ForgeConnection, repo: RemoteRepo): Promise<RemoteMilestone[]>;
  listIssues(c: ForgeConnection, repo: RemoteRepo, o: { since?: string; state: 'open' | 'all'; assignee?: string }): Promise<RemoteIssue[]>;
}
```

`RemoteRepo`, `RemoteMilestone`, `RemoteIssue` are the adapter's normalised shapes (already platform-independent), so
`forge-map.ts` maps one shape only.

| | GitHub | GitLab | Gitea / Forgejo |
| --- | --- | --- | --- |
| API base | `https://api.github.com`; GitHub Enterprise Server: `<host>/api/v3` | `<host>/api/v4` | `<host>/api/v1` |
| Auth header | `Authorization: Bearer <token>` + `Accept: application/vnd.github+json` + `X-GitHub-Api-Version: 2022-11-28` | `Authorization: Bearer <token>` | `Authorization: token <token>` |
| Who am I | `GET /user` | `GET /user` | `GET /user` |
| Repos | `GET /user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`; search: `GET /search/repositories?q=<q>+user:<login>` or filter the list client-side | `GET /projects?membership=true&simple=true&per_page=100&order_by=last_activity_at&search=<q>` | `GET /repos/search?q=<q>&limit=50&page=n` (returns `{ data: [...] }`) or `GET /user/repos?limit=50&page=n` |
| One repo | `GET /repositories/<id>` | `GET /projects/<id>` | `GET /repositories/<id>` |
| Milestones | `GET /repos/<o>/<r>/milestones?state=all&per_page=100` | `GET /projects/<id>/milestones?per_page=100` | `GET /repos/<o>/<r>/milestones?state=all&limit=50&page=n` |
| Issues | `GET /repos/<o>/<r>/issues?state=all&per_page=100&since=<iso>&assignee=<login>` (drop items with `pull_request`) | `GET /projects/<id>/issues?state=all|opened&per_page=100&updated_after=<iso>&assignee_username=<u>` | `GET /repos/<o>/<r>/issues?type=issues&state=all|open&limit=50&page=n&since=<iso>&assigned_by=<u>` |
| Pagination | `Link: rel="next"` (exposed) | `X-Next-Page` (exposed) | loop `page` until a page has < `limit` items (headers not exposed cross-origin) |
| Rate limit | 5 000 req/h; send `If-None-Match` with the stored `ETag` (a 304 costs nothing); on 403/429 read `Retry-After` / `X-RateLimit-Reset` | 2 000 req/min on gitlab.com; `Retry-After` on 429 | instance setting; back off on 429 |

Hard caps so one import cannot run away: at most 2 000 issues and 50 pages per refresh (then stop and say so), a
`AbortController` timeout of 15 s per request, sequential requests (no parallel fan-out).

Error type: `ForgeError { kind: 'cors' | 'auth' | 'notFound' | 'rateLimited' | 'network' | 'server'; retryAt?: number }`.
`401` → auth, `403` with `X-RateLimit-Remaining: 0` → rateLimited, other `403`/`404` → notFound (private repo or missing
scope), `TypeError` from fetch → `cors` if `navigator.onLine`, else `network`.

### 3.2 Services

- `src/services/forge-connections.service.ts` — `@Injectable({ providedIn: 'root' })` **but only injected from lazy
  components** (verify with `check:lazy`). Holds `localStorageSignal<ForgeConnection[]>('productivist.forgeConnections', [])`
  and `add`, `update`, `remove`, `forHost(kind, host)`. Not in `buildState`, not in export, not in `reset` of synced
  stores (a full Reset should still clear it: add it to whatever "Reset everything" calls).
- `src/services/forge-import.service.ts` — root, lazy-only as above. `importRepo(conn, repo, options)` and
  `refreshProject(projectId)`: fetch through the adapter, map, merge, one write per store, set
  `project.source.options.lastSyncedAt = startedAt` (the time the refresh *started*, so edits during it are caught next
  time), signals `busy: Signal<string | null>` (project id) and `lastError`. Also `refreshAll()` for linked projects
  that have a connection on this device.
- Auto refresh: while `project-detail-view` shows a linked project and the document is visible, refresh at most every
  10 minutes and on `visibilitychange` back to visible. No global timer in the initial bundle.

### 3.3 Sync, export, backend

Frontend (`lib/sync-engine.ts`): in `projectCodec`, `milestoneCodec`, `todoCodec` add
`...(x.source ? { source: canonicalSource(x.source) } : {})` and the reverse in `fromWire`. `canonicalSource` emits keys
in a fixed order and drops `undefined`s, so the hash is stable (like the sorted layout keys). Existing rows keep their
hashes because the key is absent.

Export/import (`app-menu`): rows already carry `source`; on import run `sanitizeSource` (drop it unless `kind` is one
of the three, `host`/`url` are `https?://` URLs under 300 chars, `repoId` non-empty, `number` a positive integer,
`remoteUpdatedAt` under 40 chars). No export version bump is required (the field is optional and old importers ignore
it); bump to `version: 6` only if the implementer prefers explicitness, accepting 2 to 6.

Backend:

- `V7__forge_source.sql`: `ALTER TABLE projects|milestones|todos ADD COLUMN source JSONB CHECK (source IS NULL OR jsonb_typeof(source) = 'object')`.
- `SyncDtos`: a `SourceDto` record with **wrapper types only** (`String kind` with `@Pattern("github|gitlab|gitea")`,
  `@Size(max = 300) String host`, `@Size(max = 64) String repoId`, `@Size(max = 300) String repoPath`,
  `Integer number`, `@Size(max = 500) String url`, `@Size(max = 40) String remoteUpdatedAt`,
  `@Pattern("open|closed") String remoteState`, and for projects a nested `SourceOptionsDto` with `Boolean`s and
  `Long lastSyncedAt`). Add `@Valid SourceDto source` (nullable) to `ProjectDto`, `MilestoneDto`, `TodoDto`.
  Remember the Jackson 3 rule: a primitive here would reject every push from a client that omits it.
- `SyncService.java`: read/write the column (serialise the DTO to JSON; on pull send `null` when absent, the client's
  `fromWire` treats `null` as unset).
- `backend/README.md`: document the field.

### 3.4 UI (all lazy)

1. **Configuration modal → new section "Integrations"** (`ConfigSection = 'general' | 'account' | 'integrations'`,
   always available, also without sync). Component `forge-connections-settings` (lazy, `@defer` inside the section):
   - list of connections: platform icon/label, host, `@username`, *Test*, *Remove* (inline `.confirm-bar`);
   - *Add connection* form: platform `.segmented` (GitHub, GitLab, Forgejo, Codeberg, Gitea), host field (prefilled:
     `https://github.com`, `https://gitlab.com`, `https://codeberg.org`, `https://gitea.com`; empty for Forgejo),
     token field (`type="password"`, `autocomplete="off"`), an *Create a token* link that opens the platform's token
     page with prefilled scopes (section 8), *Test and save* (calls `whoAmI`, saves only on success, shows the
     `ForgeError` explanation otherwise);
   - a short muted note: "The token stays on this device. Use a read-only token."
2. **Import** — `import-repo-modal` (lazy, rendered by `projects-view` like the New project dialog, `.modal-overlay` +
   `.modal-panel`): connection `.select` (or a link to Configuration → Integrations when there is none), repository
   search (debounced, `normalizeQuery` for client-side filtering), list of repos (name, owner, private badge, open
   issue count when the API gives it; an already-imported repo shows "Imported" and offers *Refresh* instead), the
   options of `RepoSourceOptions` as `.switch`es, *Import*. Progress text while running ("Importing 120 issues…"),
   result summary ("Created 1 project, 4 milestones, 118 tasks"), then *Open project*.
   Entry points: a new `fab-menu` item *Import from Git* (`FabItem` with a new `git` `ui-icon`, no shortcut letter or
   `I`), the create context menu of the Tasks and projects page, and an empty-state link.
3. **Linked project** — `project-detail-view` header: a `.btn--secondary.btn--sm` *Refresh* (`restart` icon, spinner
   state from `ForgeImportService.busy`, icon-only below 600px) and a muted "Synced 5 min ago · GitHub" with a link to
   the repo; when this device has no connection for the host: "Connect GitHub to refresh" → Configuration →
   Integrations with the host prefilled. `project-card`/`project-row`: a small forge mark next to the name.
4. **Task Details** — when `todo.source`: an "Open on GitHub ↗" link (set `href` from code in a lazy component, as the
   research tip does) and a muted "Imported from owner/repo#42". Fields stay editable; a hint under the title says
   remote edits may overwrite title/description on the next refresh.
5. **i18n** — `en.json` is eager: keep keys few and terse under one `forge.*` prefix, reuse existing ones (*Cancel*,
   *Remove*, *Refresh*…). Spanish in `es.json`. Measure the initial bundle before and after and record the delta in
   `AGENTS.md` like previous features.

### 3.5 Lazy-chunk check

Add to `NEVER_INITIAL_UI` in `scripts/check-lazy-chunks.mjs`: `forge-connections-settings`, `import-repo-modal`,
`lib/forge-map.ts`, `lib/forge-adapters.ts`, `ForgeConnectionsService`, `ForgeImportService` (and the relay/native
transport files of phase 3). Run `npm run check:lazy`.

### 3.6 Acceptance for phase 1

- Import a public GitHub repo with a fine-grained read-only token: project, milestones and open issues appear; PRs do not.
- Import the same repo again: "Imported" + *Refresh*, no duplicates. Close an issue on GitHub, *Refresh*: the task is done.
- Change a task's importance locally, edit the issue title remotely, *Refresh*: title updated, importance kept.
- GitLab.com project with milestones that have start/due dates: dates land on the milestones unchanged.
- Codeberg repo with > 50 issues: pagination without headers works.
- With sync on, a second browser profile with its own token refreshes the same project; no duplicate rows after sync.
- Thunderbird build (`npm run build:tb`, `tb:run`) imports from GitHub. Bundle budget and `check:lazy` pass.
- A wrong token shows "token rejected"; a self-hosted Gitea without CORS shows the CORS help (section 9), not "wrong token".

---

## 4. Phase 2: polish

- Label → priority/status mapping editable per project (stored in `source.options`, synced; keep the defaults table).
- "Only issues assigned to me" also on refresh; "Skip issues with label …".
- GitHub `ETag` cache per request URL in a device-local key so idle refreshes are free.
- Conflict hint: when a refresh overwrote a field the user had edited locally since the last refresh, list it in the
  result summary.

---

## 5. Phase 3: transports for instances without CORS — DONE

Introduce `ForgeTransport = (url: string, init: { headers: Record<string, string>; method: 'GET' | 'PATCH' | 'POST'; body?: string }) => Promise<Response-like>`
and pick it per connection: try `direct` first; on a `cors` error offer the next available one and remember the
choice on the connection (`transport?: 'direct' | 'extension' | 'native' | 'relay'`, device-local).

1. **Thunderbird (`extension`)** — extension pages with a host permission are exempt from CORS. Add
   `"optional_permissions": ["https://*/*", "http://*/*"]` to `extension/manifest.json` and, from the click handler of
   *Test and save*, call `browser.permissions.request({ origins: [new URL(baseUrl).origin + '/*'] })` (must run inside
   the user gesture). Then plain `fetch` works. Guard with `typeof browser !== 'undefined'`; update `tb:lint`.
2. **Mobile (`native`)** — `CapacitorHttp.request` from `@capacitor/core` bypasses the WebView's CORS. Per `AGENTS.md`
   only `src/core/native/` may import Capacitor: add `src/core/native/native-http.ts` exporting a `ForgeTransport`, reached
   by a dynamic `import()` from `forge-adapters.ts` behind `window.Capacitor?.isNativePlatform?.()`. Update the
   AGENTS.md rule and `NATIVE_ONLY` in `check-lazy-chunks.mjs` to allow exactly this second dynamic entry. Do **not**
   enable `CapacitorHttp` globally in `capacitor.config.ts` (it would patch every `fetch`, the sync included).
3. **Web with an account (`relay`)** — `POST /api/forge/relay` on the backend, signed-in users only, body
   `{ url, method, headers: { authorization }, body? }`, answering `{ status, headers: { link, etag, ... }, body }`.
   It must not become an open proxy or an SSRF hole:
   - `https` only (allow `http` only behind a dev flag); resolve the host and refuse loopback, private, link-local,
     CGNAT, multicast and metadata addresses (IPv4 and IPv6), and re-check after connecting (no DNS rebinding):
     use the resolved address for the connection with the original `Host`/SNI;
   - path must match `^/api/(v1|v3|v4)/` (or host `api.github.com`), methods `GET` (phase 5 adds `PATCH`/`POST` to issue
     paths only); no redirects followed; 10 s timeout; 5 MB response cap;
   - forward only `Authorization`, `Accept`, `If-None-Match`, `Content-Type`; never log headers or bodies;
   - its own nginx `limit_req` zone (e.g. 5 r/s per IP, burst 20) in `deploy/nginx.conf.template`;
   - document in `backend/README.md` that the token passes through the backend in transit.
   Show the relay option in the UI only when `syncEnabled` and signed in, with one line explaining it.

---

## 6. Phase 4 (optional): OAuth sign-in for the big hosted instances

PAT stays the universal method; OAuth is a convenience for github.com, gitlab.com and codeberg.org on the web build.

- **GitHub**: register an OAuth App (or a GitHub App with *Issues: read*) under the project's account; the token
  exchange needs the client secret, so it runs on the backend: `/api/forge/oauth/github/start` → GitHub authorize
  (with `state` + PKCE) → callback `https://<frontend-domain>/api/forge/oauth/github/callback` → backend exchanges the
  code and hands the token to the page once (e.g. via a short-lived one-time code the page redeems), never storing it.
  Secrets as Railway variables `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`.
- **GitLab.com**: an OAuth application marked *non-confidential*, scope `read_api`, authorization code + PKCE; can run
  in the browser without a secret if `/oauth/token` accepts the cross-origin request (verify; otherwise exchange on the
  backend as for GitHub). Self-managed GitLab: the user (or their admin) registers an application on their instance
  and pastes its client id.
- **Codeberg / Forgejo / Gitea**: OAuth2 applications are per instance (*Settings → Applications → OAuth2 Applications*,
  untick *Confidential client* for PKCE). Register one on codeberg.org; any other instance stays on PATs.
- Thunderbird would need `browser.identity.launchWebAuthFlow` (`identity` permission) and mobile a custom-scheme
  redirect handled by `@capacitor/app`'s `appUrlOpen` in `src/core/native/`: do those later or keep PATs there.
- OAuth tokens expire (GitLab: 2 h with a refresh token): store the refresh token device-local like the PAT and
  refresh before requests.

---

## 7. Phase 5 (optional): write-back

Opt-in per project (`source.options.writeBack`, needs write scopes: GitHub fine-grained *Issues: Read and write*,
GitLab `api`, Gitea/Forgejo `write:issue`):

- completing / reopening a linked task → close / reopen the issue (`PATCH /repos/<o>/<r>/issues/<n> {state}`,
  GitLab `PUT /projects/<id>/issues/<iid> {state_event: 'close'|'reopen'}`, Gitea `PATCH /repos/<o>/<r>/issues/<n> {state}`);
- a queue of pending remote writes (device-local), retried on the next refresh, so offline completion works;
- creating an issue from a task in a linked project: later, behind its own switch.

Codeberg/gitea.com allow only `GET` cross-origin: write-back there needs the relay or the native/extension transport.

---

## 8. Setting up each platform (user-facing; also goes into the in-app help text)

The token only needs **read access to issues and repository metadata**. Give it an expiry and the fewest repositories
possible. Productivist keeps it on this device only.

### GitHub (github.com and GitHub Enterprise Server)

1. *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.
2. Name it "Productivist", choose an expiration, pick the **Resource owner** (you or an organisation).
3. **Repository access**: *Only select repositories* (or *All repositories*).
4. **Permissions → Repository permissions → Issues: Read-only** (*Metadata: Read-only* is added automatically).
5. Generate, copy the token (`github_pat_…`) and paste it in *Configuration → Integrations → Add connection → GitHub*.

Notes: organisations can require approval of fine-grained tokens, and SAML-SSO organisations require authorising the
token for the org. A classic token works too (`public_repo` for public repos, `repo` for private ones, which is broader).
The app's *Create a token* link: `https://github.com/settings/personal-access-tokens/new?name=Productivist&description=Read+issues&expires_in=90&issues=read`
(GitHub documents pre-fill query parameters for fine-grained tokens; verify the parameter names against the live docs
when implementing, and fall back to `https://github.com/settings/tokens/new?scopes=repo&description=Productivist` for
classic tokens). GitHub Enterprise Server: host `https://github.example.com`; the API is `<host>/api/v3`.

### GitLab (gitlab.com and self-managed)

1. *Avatar → Edit profile → Access tokens → Add new token* (`<host>/-/user_settings/personal_access_tokens`).
2. Name "Productivist", expiry date, scope **`read_api`** (covers `/user`, projects, issues and milestones).
3. Create, copy (`glpat-…`), paste in *Add connection → GitLab* with the host (`https://gitlab.com` or your instance).

Pre-filled link: `<host>/-/user_settings/personal_access_tokens?name=Productivist&scopes=read_api`. Alternatives:
a *project* or *group access token* with `read_api` and role Reporter, to limit it to one project or group.
Self-managed GitLab answers cross-origin API requests by default, so nothing is needed on the server.

### Forgejo (including Codeberg)

1. *Settings → Applications → Generate new token* (`<host>/user/settings/applications`).
2. Name "Productivist", **Repository and organization access**: *All* (or *Public only*), permissions
   **issue: Read**, **repository: Read**, **user: Read** (needed for "Test connection" and "assigned to me").
3. Generate, copy, paste in *Add connection → Forgejo* (or *Codeberg*, host `https://codeberg.org`).

Codeberg already allows cross-origin `GET` requests. A self-hosted Forgejo needs CORS enabled (section 9) or one of
the phase-3 transports.

### Gitea (gitea.com and self-hosted)

Same as Forgejo: *Settings → Applications → Manage Access Tokens → Generate Token*, permissions **issue: Read**,
**repository: Read**, **user: Read** (Gitea 1.19+ has scoped tokens; older versions have unscoped tokens with full
access, so prefer upgrading). gitea.com allows cross-origin `GET`; self-hosted Gitea needs section 9.

---

## 9. For the admin of a self-hosted Gitea or Forgejo: enabling CORS

Without this the browser blocks the requests (the app reports a CORS error). In `app.ini` (Docker:
`GITEA__cors__ENABLED=true` etc.; Forgejo reads `FORGEJO__cors__…` as well as the `GITEA__` names):

```ini
[cors]
ENABLED = true
; The origins that may call the API. List them, or use * (the token is still required).
;   web app: https://<productivist-domain>
;   Android: https://localhost     iOS: capacitor://localhost
;   Thunderbird add-on: not needed once phase 3's host permission exists
ALLOW_DOMAIN = https://<productivist-domain>,https://localhost,capacitor://localhost
METHODS = GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS
HEADERS = Content-Type,User-Agent,Authorization
MAX_AGE = 10m
```

Restart the service and check it:

```bash
curl -s -o /dev/null -D - -X OPTIONS -H 'Origin: https://<productivist-domain>' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization' https://<forge-host>/api/v1/version
```

The answer must contain `access-control-allow-origin` and `access-control-allow-headers` with `Authorization`.
(The `[cors]` handler was rewritten in Gitea 1.22 / recent Forgejo; on older versions some options behave
differently, so check the configuration cheat sheet of the running version.) Self-managed GitLab needs nothing.

---

## 10. Order of work for the implementing agent

1. Types (`types/forge.ts`, `source` fields) + `lib/forge-map.ts` (ids, URL normalisation, mappers, merge).
2. Sync codecs + export sanitising + backend `V7`, `SourceDto`, `SyncService`, README. Verify an existing account's
   rows are **not** re-pushed after the upgrade (hashes unchanged).
3. `lib/forge-adapters.ts` (GitHub, GitLab, Gitea) with the error mapping and caps; try them from the browser console
   against public repos before any UI exists.
4. `ForgeConnectionsService`, `ForgeImportService`, `TodosService.upsertMany` and the project/milestone upserts.
5. Configuration → Integrations, then `import-repo-modal` and its entry points, then the project header refresh,
   card mark and Task Details link.
6. i18n (en + es), `check:lazy` list, bundle measurement, `AGENTS.md` section describing the feature (keep it in the
   style of the existing sections), version bump in `package.json`.
7. Phase 3 transports, then phases 4–5 only if asked.

There is no test framework: verify the pure mappers with a throwaway Node script in the scratchpad (feed it saved API
responses), and the UI in the dev server. For a local Gitea/Forgejo to test CORS and pagination:

```bash
docker run --rm -p 3000:3000 codeberg.org/forgejo/forgejo:11
```

---

## 11. Status

**Phases 1 and 3 are implemented** (0.22.0). Phases 2, 4 and 5 are not. Deviations from the text above:

- `listIssues` returns `{ issues, truncated }` (the 2 000 issue / 50 page cap is reported, and the refresh cursor does not advance when it hits it); the next refresh asks for issues changed since `lastSyncedAt` minus one minute (clock skew).
- `owner/name` typed in the import dialog is looked up directly; GitHub and Gitea accept exactly two segments (a deeper path 404s without CORS headers and would read as a CORS failure), GitLab accepts nested groups.
- An empty token sends no `Authorization` header (public repositories read anonymously). The UI still asks for a token.
- The forge strings (all but `forge.fab` and `config.integrations`) are a lazy chunk (`src/i18n/forge-texts.ts`, merged by `lib/forge-texts.ts`), not part of `en.json`; initial bundle +1.6 kB over 311.19 kB.
- Phase 3: the relay is `POST /api/forge/relay` (GET only for now), the transports live in `lib/forge-transport.ts`, the Thunderbird permission is requested from the click that picks the fallback (offered after a CORS error), the mobile transport is `core/native/native-http.ts`. `FORGE_RELAY_UNSAFE_DEV_ALLOW_HTTP_AND_PRIVATE` is a development-only switch.

**Verified automatically / locally** (no real token, no non-local accounts):

- Pure mappers, merge rules, pagination and error mapping with a throwaway Node script over stubbed responses; sync hashes of rows without `source` unchanged and `source` stable through Postgres null round trips.
- Public GitHub (`tj/commander.js`: milestones, closed/open, refresh without duplicates), Codeberg (`Codeberg/Community`, 433 issues = 9 headerless pages), GitLab.com (`libtiff/libtiff`, 101 issues over two pages).
- A local Forgejo 12 in Docker with a generated test user and token: 120 issues, 2 milestones, a label. With CORS off the app shows the CORS help (not "token rejected"); with `[cors]` on: import, pagination past 50, no duplicates on re-import, closing an issue + Refresh marks it done, a local importance edit survives a remote title edit.
- Local backend + Postgres, two browser origins signed in to the same test account: import in one, sync into the other, refresh there (through the relay) with one remote edit: 119 tasks on both, no duplicates, and only the edited task and the project row were pushed again.
- Relay: with CORS off, "Use the Productivist server" imports from the local Forgejo (dev flag on); with the dev flag **off** it answers 401 unauthenticated, and 400 for every private/loopback/link-local/CGNAT/multicast address (v4, v6, v4-mapped, NAT64, and names that resolve to them), `http`, credentials in the URL, non-allowlisted paths and dot segments, header injection and non-GET methods; real `https` GETs to codeberg.org and api.github.com (pinned connection, SNI) succeed. The relay is not offered when signed out.
- `npm run build`, `npm run check:lazy`, `npm run build:tb`, `npm run tb:lint`, `npm run build:mobile` (without `API_URL`; `cap sync` worked and the Android/iOS version numbers moved to 0.22.0), backend `mvn compile`, `nginx -t` on the rendered template.

**Not run here** (manual checklist):

1. **GitHub, real token**: create a fine-grained read-only token (Issues: Read) in *Configuration → Integrations → GitHub*, import a **private** repository: project, milestones and open issues appear, pull requests do not; *Refresh* after closing an issue and after editing a title.
2. **GitLab, real token** (`read_api`): import a project that has milestones with start and due dates; the dates must land unchanged. gitlab.com refuses anonymous milestone reads, so this was only covered by the pure tests.
3. **Codeberg/Gitea with a token** (issue + repository + user read): *Test and save* shows `@username`.
4. **Thunderbird** (`npm run build:tb`, `npm run tb:run`): import from GitHub works; for a self-hosted Gitea/Forgejo without CORS, *Allow access to this server* shows Thunderbird's permission prompt and the import then works. (`tb:lint` passes; the prompt itself was not exercised.)
5. **Android / iOS** (`npm run build:mobile` with `API_URL`, then Android Studio / Xcode): for a server without CORS, *Use this device's network stack* works (`CapacitorHttp`); cleartext `http://` hosts need the platform's cleartext setting. Check that the sync still goes through the WebView's normal `fetch`.
6. **Relay in production**: with a signed-in web session and a self-hosted Forgejo reachable over https from the server, *Use the Productivist server* imports; the backend must run **without** `FORGE_RELAY_UNSAFE_DEV_ALLOW_HTTP_AND_PRIVATE`. Check the nginx `forge` zone answers 429 under a burst.
7. A real SAML/organisation GitHub token (SSO authorisation) and rate-limit behaviour (`Retry-After`) were not exercised.
