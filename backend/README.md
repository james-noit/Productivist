# Productivist backend

Spring Boot 4 / Java 21 / PostgreSQL sync service. The Angular app works fully offline in localStorage;
logging in only adds synchronisation.

## Run locally

```
docker run -d --name pv-pg -e POSTGRES_USER=productivist -e POSTGRES_PASSWORD=productivist \
  -e POSTGRES_DB=productivist -p 5432:5432 postgres:17
cd backend && mvn spring-boot:run
```

Connection comes from `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (the variables Railway's
Postgres plugin provides), defaulting to the container above. Other settings: `PORT`, `SERVER_ADDRESS`, `CORS_ALLOWED_ORIGINS`
(comma-separated origin patterns; defaults to `http://localhost:4200`, `moz-extension://*`, `https://localhost` and
`capacitor://localhost`: the last two are the Android and iOS apps' WebViews, see `docs/mobile/`).
Schema is managed by Flyway (`src/main/resources/db/migration`).

## API

| Method | Path | |
|---|---|---|
| POST | `/api/auth/signup` `{email, password}` | Creates the account (password 8+ characters, at most 72 bytes) and returns `{email, token}`. 409 if the email is taken. No email confirmation. |
| POST | `/api/auth/login` `{email, password}` | Returns `{email, token}`; 401 for any wrong email or password. |
| DELETE | `/api/account` `{password}` | Deletes the caller's own account and every synced row under it (projects, tasks, Flow data, recurrences, Sportask blocks and templates, settings), and with it every session, so all devices are signed out. 204 on success; 400 for a missing password; 403 for a wrong one (not 401, which clients read as an expired session); 409 for the admin account. |
| GET | `/api/sync?since=<cursor>` | Rows changed after `cursor` (0 = all), tombstones included, plus `state` if changed. Returns the next `cursor`. |
| POST | `/api/sync` | Upserts `{projects, milestones, todos, objectives, flowLinks, flowLayouts, recurrences, sportBlocks, sportTemplates, state}` (the Flow, recurrence and Sportask lists are optional, so older clients keep working; a todo may carry `recurrenceId`; a project, milestone or todo imported from a Git forge may carry `source`, see below). Last-write-wins on each row's `updatedAt`. Returns `{cursor}`. |
| POST | `/api/forge/relay` `{url, method?, headers?}` | Signed-in users only. Fetches one Git forge API URL on the caller's behalf, for Gitea/Forgejo servers whose CORS settings block the browser, and answers `{status, headers, body}` with the forge's own status inside (see *Forge relay* below). The relay's own refusals are plain HTTP errors: 400 (target not allowed), 413 (response over 5 MB), 429 (busy), 502/504 (upstream failed or timed out). |
| GET | `/api/admin/me` | Admin only (403 for everyone else): `{email}`. The frontend uses it to decide whether to show the admin view. |
| GET | `/api/admin/stats` | Admin only: account, session, task, project, objective, recurring-series and Sportask-block totals. |
| GET | `/api/admin/users?query=&page=&size=` | Admin only: accounts newest first, filtered by email substring, with their task/project/session counts (never their content). |
| PATCH | `/api/admin/users/{id}` `{email?, password?}` | Admin only: change the email and/or set a password (which also closes the user's sessions). 409 if the email is taken. |
| DELETE | `/api/admin/users/{id}/sessions` | Admin only: sign the user out everywhere. |
| DELETE | `/api/admin/users/{id}` | Admin only: delete the account and everything synced under it. |
| GET | `/actuator/health` | Health check. |

Everything except login and health needs `Authorization: Bearer <token>`.

### Admin

There is a single admin, identified by email: set `ADMIN_EMAIL` to the address of an account (blank, the default, disables
`/api/admin/**`). Whoever holds a token for that account gets `ROLE_ADMIN`; there is no role column. **Register that account
yourself before setting the variable**: signup is open, so whoever registers the address first owns it. The admin cannot change or
delete their own account through these endpoints, and admin actions are logged (not stored).

- Ids are client-generated. Deleting = pushing the row with `deleted: true` (a tombstone only needs `id`, `updatedAt` and the primitive fields zeroed; content is not required).
- First login merge: push local data, then pull. Equal ids are resolved by `updatedAt`.
- `state` holds `settings`, `dailyPlan`, `multitask` (free-form JSON), `currentTaskId`, `hasCustomOrder`. The user's Sportask settings travel inside `settings.sportask`, only once the user has changed them (the backend does not look inside).
- Fields are required in the JSON (including `done`, `deleted`, `updatedAt`); a missing one is a 400.

## Known gaps

- No email confirmation, so anyone can register an address they do not own, and there is no password reset yet. Login and signup are rate-limited by the frontend's nginx only, not by the backend itself.
- Accounts created before passwords existed have no password: the first `signup` with that email claims it (and sets the password); until then it cannot be logged into.
- Sequence-based cursors can, in theory, skip a row whose transaction commits after a later one; a periodic full
  pull (`since=0`) repairs it.
- No automated tests yet.

## Railway

Two services plus Postgres; only the frontend has a public domain.

- **Postgres**: Railway database plugin.
- **backend** (root directory `/backend`, no public domain): variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
  `PGPASSWORD` as references to the database service (`${{Postgres.PGHOST}}` …), `PORT=8080`,
  `CORS_ALLOWED_ORIGINS=moz-extension://*,https://localhost,capacitor://localhost`. Healthcheck path `/actuator/health`. The Dockerfile binds `::` because
  the private network is IPv6.
- **frontend** (root directory `/`, root `Dockerfile`): generate a domain and set the healthcheck path `/healthz`.
  `BACKEND_ORIGIN` defaults to `http://productivist-backend.railway.internal:8080`; set it if the backend service
  has another name or port. nginx proxies `/api/` there and rate-limits it.
- Thunderbird add-on: `API_URL=https://<frontend-domain> npm run build:tb`. Its requests carry a `moz-extension://`
  origin, which is why the backend's CORS list keeps that entry.
- Android and iOS apps (Capacitor): `API_URL=https://<frontend-domain> npm run build:mobile`. The WebView's origin
  is `https://localhost` on Android and `capacitor://localhost` on iOS, so both must be in `CORS_ALLOWED_ORIGINS`.
  The default in `application.yml` already has them, but a `CORS_ALLOWED_ORIGINS` variable set on Railway replaces
  the default: add them there too, or the apps' requests are rejected.

### Sportask (`sport_blocks`, `sport_templates`)

Training in the Pomodoro breaks (`docs/sportask/PLAN.md`). Two synced tables (`V8__sportask.sql`; same conventions as the others:
client ids, last-write-wins on `updated_at`, tombstones, `seq` cursor), carried by the optional `sportBlocks` and
`sportTemplates` lists of push and pull. A client without Sportask simply omits them.

- **`sport_blocks`**: one row per break with exercise (`SyncDtos.SportBlockDto`): `startedAt`, `date` (`YYYY-MM-DD`), `origin`, `kind`,
  `blockSeconds` (1..7200), `prepSeconds` (0..120), `steps`, `results`, `status` (`done|partial|skipped`), `catalogVersion`, and
  optionally `goalId`, `programId`, `programWeek` (1..520), `templateId`, `assessmentId`, `rpe` (1..10), `feedback`. The client emits an
  optional only when it is set; every optional is a wrapper type (`Integer`, `String`), never a primitive, because Jackson 3 rejects an
  absent primitive record component and with it the whole push. Blocks are about 0.5 kB each and are never pruned.
- **`sport_templates`**: the user's own free-training templates (`SportTemplateDto`): `name` (1..200), `slots`, `format`, optional
  `workSeconds` (5..600), `restSeconds` (0..600), `minSeconds` (0..7200), `order`. Built-in templates live in the client.
- **The vocabulary is free text on purpose.** Goal, program, kind, origin, assessment, exercise, pattern and template ids only have to
  match `^[A-Za-z0-9_.-]{1,64}$` (`templateId`: up to 64 characters), so adding a goal or an exercise never needs a migration. Only `status`
  is an enumeration, because it is structural.
- **JSON columns.** `steps` and `results` (JSONB arrays, at most 120 elements) and `slots` (1..40) are validated by `SyncService`, shape
  and size, not vocabulary. A step needs `exerciseId` (string, up to 64), `workSeconds` and `restSeconds` (integers 0..3600) and may
  carry `target` (`reps` 1..1000 and/or `seconds` 1..3600), `side` (`left|right`), `loadKg` (0..500) and `round` (1..100). A result needs
  `stepIndex` (integer 0..119) and a boolean `done`, and may carry `value` (-1000..100000) and `loadKg` (0..500). A slot needs an
  `exerciseId` or a `pattern` (strings up to 64) and may carry `dose`, `tag`, `zone` and `maxLevel` (1..5). Each column is capped at
  32 kB of JSON text. An invalid row answers 400 and rolls back the push, like every other invalid row here (the client sanitises what it
  sends, so this only guards hand-made requests). Postgres JSONB reorders object keys, so the client rebuilds each element in a fixed key
  order before hashing (`canonicalSteps`, `canonicalResults`, `canonicalSlots` in `sync-engine.ts`).
- Body weight (used for the calorie estimate) is health data: it stays on the device and is neither synced nor exported.

### Forge import (`source`)

Projects, milestones and todos imported from GitHub, GitLab or Gitea/Forgejo carry an optional `source` object
(`V7__forge_source.sql`: a nullable `JSONB` column on each table; `SyncDtos.SourceDto`): `kind` (`github|gitlab|gitea`),
`host`, `repoId`, `repoPath`, `url`, and optionally `number`, `remoteUpdatedAt`, `remoteState` (`open|closed`) and, on a
project, `options` (`includeClosed`, `onlyAssignedToMe`, `importMilestones`, `labelsAsTags`, `lastSyncedAt`). The client
sends it only when set. Every component is a wrapper type (`Boolean`, `Integer`, `Long`), never a primitive: Jackson 3
rejects an absent primitive record component, which would reject the whole push. `kind`, `host`, `repoId` and `url` are
required when a source is present. It never holds a secret: the personal access token used to import stays on the device
and is not synced, exported or sent to this backend.

### Forge relay (`POST /api/forge/relay`)

An optional transport of the Git forge import (`docs/integrations/PLAN.md`, phase 3). A self-hosted Gitea or Forgejo has CORS
off by default, so the browser cannot call it; a signed-in user can ask this endpoint to make the (read-only, `GET`) request
instead. **The user's personal access token passes through the backend in transit**, in the `Authorization` header: it is
not stored, not logged and not written anywhere, and nothing about a request or its answer is logged. The client offers the
relay only while sync is enabled and the user is signed in, after the direct request failed with a CORS error, and says that
the token passes through the server.

Because it makes requests to addresses the user types, it is built not to be an open proxy or a way into the server's network
(`ForgeRelayGuard`, `PinnedHttpClient`):

- `https` only, no credentials or fragment in the URL; `GET` only; the path must be `/api/v1/`, `/api/v3/` or `/api/v4/` (Gitea and
  Forgejo, GitHub Enterprise, GitLab) or anything on `api.github.com`; dot segments (also percent-encoded) are refused.
- The host name is resolved and **every** address it resolves to must be public: loopback, `0.0.0.0/8`, private (RFC 1918),
  link-local (cloud metadata `169.254.169.254` included), carrier-grade NAT `100.64.0.0/10`, multicast, reserved, benchmarking and
  documentation ranges, and for IPv6 `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`, plus IPv4 addresses embedded
  in v4-mapped, v4-compatible, 6to4 and NAT64 forms. The connection then goes to **the address that was checked** (not a second
  lookup), with the original name for SNI and certificate verification, so DNS rebinding cannot swap the destination.
- Redirects are not followed, 10 s overall timeout, 5 MB response cap, at most 16 relays at once.
- Only `Authorization`, `Accept`, `If-None-Match` and `Content-Type` are forwarded (values with control characters are refused);
  only pagination, caching and rate-limit headers (`Link`, `ETag`, `X-Next-Page`, `X-Total*`, `X-RateLimit-*`, `Retry-After`,
  `Content-Type`) come back.
- nginx gives it its own `limit_req` zone (`forge`: 5 requests/s per client address, burst 20; `deploy/nginx.conf.template`).

`FORGE_RELAY_UNSAFE_DEV_ALLOW_HTTP_AND_PRIVATE=true` lifts the scheme and address rules so the relay can be tried against a forge
on `localhost` (for example a local Forgejo in Docker). **Development only, never set it in production**; it is off by default and
the backend logs a warning at startup when it is on.
