-- Sportask: one row per training block (a break's plan + results) and the user's free-training templates.
-- Same conventions as the other synced tables (client ids, last-write-wins on updated_at, tombstones, seq cursor).
-- Vocabulary (goal, program, exercise, template ids) is free text on purpose: new content needs no migration.
CREATE TABLE sport_blocks (
    user_id        BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id             TEXT    NOT NULL,
    started_at     BIGINT  NOT NULL,
    date           TEXT    NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
    origin         TEXT    NOT NULL CHECK (origin ~ '^[A-Za-z0-9_.-]{1,64}$'),
    goal_id        TEXT    CHECK (goal_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
    program_id     TEXT    CHECK (program_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
    program_week   INTEGER CHECK (program_week BETWEEN 1 AND 520),
    template_id    TEXT    CHECK (length(template_id) <= 64),
    kind           TEXT    NOT NULL CHECK (kind ~ '^[A-Za-z0-9_.-]{1,64}$'),
    assessment_id  TEXT    CHECK (assessment_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
    block_seconds  INTEGER NOT NULL CHECK (block_seconds BETWEEN 1 AND 7200),
    prep_seconds   INTEGER NOT NULL CHECK (prep_seconds BETWEEN 0 AND 120),
    steps          JSONB   NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 120),
    results        JSONB   NOT NULL CHECK (jsonb_typeof(results) = 'array' AND jsonb_array_length(results) <= 120),
    status         TEXT    NOT NULL CHECK (status IN ('done', 'partial', 'skipped')),
    rpe            INTEGER CHECK (rpe BETWEEN 1 AND 10),
    feedback       TEXT    CHECK (feedback ~ '^[A-Za-z0-9_.-]{1,32}$'),
    catalog_version INTEGER NOT NULL CHECK (catalog_version >= 0),
    created_at     BIGINT  NOT NULL,
    updated_at     BIGINT  NOT NULL,
    deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    seq            BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX sport_blocks_seq_idx ON sport_blocks (user_id, seq);

CREATE TABLE sport_templates (
    user_id      BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id           TEXT    NOT NULL,
    name         TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    slots        JSONB   NOT NULL CHECK (jsonb_typeof(slots) = 'array' AND jsonb_array_length(slots) BETWEEN 1 AND 40),
    format       TEXT    NOT NULL CHECK (format ~ '^[A-Za-z0-9_.-]{1,32}$'),
    work_seconds INTEGER CHECK (work_seconds BETWEEN 5 AND 600),
    rest_seconds INTEGER CHECK (rest_seconds BETWEEN 0 AND 600),
    min_seconds  INTEGER CHECK (min_seconds BETWEEN 0 AND 7200),
    sort_order   DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at   BIGINT  NOT NULL,
    updated_at   BIGINT  NOT NULL,
    deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    seq          BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX sport_templates_seq_idx ON sport_templates (user_id, seq);
