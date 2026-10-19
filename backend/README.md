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
| DELETE | `/api/account` `{password}` | Deletes the caller's own account and every synced row under it (projects, tasks, Flow data, recurrences, settings), and with it every session, so all devices are signed out. 204 on success; 400 for a missing password; 403 for a wrong one (not 401, which clients read as an expired session); 409 for the admin account. |
| GET | `/api/sync?since=<cursor>` | Rows changed after `cursor` (0 = all), tombstones included, plus `state` if changed. Returns the next `cursor`. |
| POST | `/api/sync` | Upserts `{projects, milestones, todos, objectives, flowLinks, flowLayouts, recurrences, state}` (the Flow and recurrence lists are optional, so older clients keep working; a todo may carry `recurrenceId`). Last-write-wins on each row's `updatedAt`. Returns `{cursor}`. |
| GET | `/api/admin/me` | Admin only (403 for everyone else): `{email}`. The frontend uses it to decide whether to show the admin view. |
| GET | `/api/admin/stats` | Admin only: account, session, task and project totals. |
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
- `state` holds `settings`, `dailyPlan`, `multitask` (free-form JSON), `currentTaskId`, `hasCustomOrder`.
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
