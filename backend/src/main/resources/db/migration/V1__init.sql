CREATE SEQUENCE sync_seq;

CREATE TABLE users (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email      TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the SHA-256 of a token is stored. One user may hold several (one per device).
CREATE TABLE auth_tokens (
    token_hash TEXT        PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id);

-- Synced tables. Ids are client-generated, so they are only unique per user.
-- updated_at: client edit time (epoch ms), decides last-write-wins.
-- seq:        server-assigned, monotonic; clients pull with "seq > cursor".
-- deleted:    tombstone, so deletions reach the other devices.
-- References between rows (project_id, milestone_id) are deliberately not foreign keys:
-- a batch may carry a child before its parent, and tombstoned parents must not block children.

CREATE TABLE projects (
    user_id     BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id          TEXT    NOT NULL,
    icon        TEXT    NOT NULL DEFAULT '',
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    notes       TEXT    NOT NULL DEFAULT '',
    sort_order  DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at  BIGINT  NOT NULL,
    updated_at  BIGINT  NOT NULL,
    deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    seq         BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX projects_seq_idx ON projects (user_id, seq);

CREATE TABLE milestones (
    user_id    BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id         TEXT    NOT NULL,
    project_id TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    sort_order DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at BIGINT  NOT NULL,
    updated_at BIGINT  NOT NULL,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    seq        BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX milestones_seq_idx ON milestones (user_id, seq);

CREATE TABLE todos (
    user_id                   BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id                        TEXT    NOT NULL,
    title                     TEXT    NOT NULL,
    description               TEXT,
    importance                TEXT    NOT NULL CHECK (importance IN ('low', 'medium', 'high')),
    urgency                   TEXT    NOT NULL CHECK (urgency IN ('low', 'medium', 'high')),
    tags                      TEXT[]  NOT NULL DEFAULT '{}',
    done                      BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order                DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at                BIGINT  NOT NULL,
    completed_at              BIGINT,
    project_id                TEXT,
    milestone_id              TEXT,
    pomodoros_for_termination INTEGER,
    updated_at                BIGINT  NOT NULL,
    deleted                   BOOLEAN NOT NULL DEFAULT FALSE,
    seq                       BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX todos_seq_idx ON todos (user_id, seq);

-- One row per user: settings, daily planner and multitask state are small and rewritten whole.
CREATE TABLE user_state (
    user_id          BIGINT  PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    settings         JSONB   NOT NULL DEFAULT '{}',
    daily_plan       JSONB   NOT NULL DEFAULT '{}',
    multitask        JSONB   NOT NULL DEFAULT '{}',
    current_task_id  TEXT,
    has_custom_order BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at       BIGINT  NOT NULL,
    seq              BIGINT  NOT NULL DEFAULT nextval('sync_seq')
);
