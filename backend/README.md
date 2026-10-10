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
(comma-separated origin patterns; defaults to `http://localhost:4200` and `moz-extension://*`).
Schema is managed by Flyway (`src/main/resources/db/migration`).

## API

| Method | Path | |
|---|---|---|
| POST | `/api/auth/login` `{email}` | Creates the user if new, returns `{email, token}`. No confirmation, no secret yet. |
| GET | `/api/sync?since=<cursor>` | Rows changed after `cursor` (0 = all), tombstones included, plus `state` if changed. Returns the next `cursor`. |
| POST | `/api/sync` | Upserts `{projects, milestones, todos, state}`. Last-write-wins on each row's `updatedAt`. Returns `{cursor}`. |
| GET | `/actuator/health` | Health check. |

Everything except login and health needs `Authorization: Bearer <token>`.

- Ids are client-generated. Deleting = pushing the row with `deleted: true` (a tombstone only needs `id`, `updatedAt` and the primitive fields zeroed; content is not required).
- First login merge: push local data, then pull. Equal ids are resolved by `updatedAt`.
- `state` holds `settings`, `dailyPlan`, `multitask` (free-form JSON), `currentTaskId`, `hasCustomOrder`.
- Fields are required in the JSON (including `done`, `deleted`, `updatedAt`); a missing one is a 400.

## Known gaps

- Anyone who knows an email can sign in as that user (recovery key planned). No rate limiting on login.
- Sequence-based cursors can, in theory, skip a row whose transaction commits after a later one; a periodic full
  pull (`since=0`) repairs it.
- No automated tests yet.

## Railway

Two services plus Postgres; only the frontend has a public domain.

- **Postgres**: Railway database plugin.
- **backend** (root directory `/backend`, no public domain): variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
  `PGPASSWORD` as references to the database service (`${{Postgres.PGHOST}}` …), `PORT=8080`,
  `CORS_ALLOWED_ORIGINS=moz-extension://*`. Healthcheck path `/actuator/health`. The Dockerfile binds `::` because
  the private network is IPv6.
- **frontend** (root directory `/`, root `Dockerfile`): generate a domain and set the healthcheck path `/healthz`.
  `BACKEND_ORIGIN` defaults to `http://productivist-backend.railway.internal:8080`; set it if the backend service
  has another name or port. nginx proxies `/api/` there and rate-limits it.
- Thunderbird add-on: `API_URL=https://<frontend-domain> npm run build:tb`. Its requests carry a `moz-extension://`
  origin, which is why the backend's CORS list keeps that entry.
