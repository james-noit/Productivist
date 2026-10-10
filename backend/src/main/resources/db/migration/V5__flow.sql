-- Flow view: objectives, the links that feed them and the hand-placed node positions. Same conventions as the
-- other synced tables (client ids, last-write-wins on updated_at, tombstones, seq cursor) and, like them, no
-- foreign keys between rows: a batch may carry a link before the objective it points at.

CREATE TABLE objectives (
    user_id     BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id          TEXT    NOT NULL,
    project_id  TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    description TEXT,
    horizon     TEXT    NOT NULL CHECK (horizon IN ('short', 'medium', 'long')),
    status      TEXT    NOT NULL CHECK (status IN ('active', 'achieved', 'dropped')),
    -- A local calendar day, like todos.due_date. Null means none.
    target_date TEXT    CHECK (target_date ~ '^\d{4}-\d{2}-\d{2}$'),
    sort_order  DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at  BIGINT  NOT NULL,
    updated_at  BIGINT  NOT NULL,
    deleted     BOOLEAN NOT NULL DEFAULT FALSE,
    seq         BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX objectives_seq_idx ON objectives (user_id, seq);

-- "from_id contributes to to_objective_id". from_id is a task, a milestone or an objective, depending on from_kind.
CREATE TABLE flow_links (
    user_id         BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id              TEXT    NOT NULL,
    project_id      TEXT    NOT NULL,
    from_kind       TEXT    NOT NULL CHECK (from_kind IN ('task', 'milestone', 'objective')),
    from_id         TEXT    NOT NULL,
    to_objective_id TEXT    NOT NULL,
    created_at      BIGINT  NOT NULL,
    updated_at      BIGINT  NOT NULL,
    deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    seq             BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX flow_links_seq_idx ON flow_links (user_id, seq);

-- One row per project (id = the project id): node positions ({"milestone:<id>": {"x": 0, "y": 0}, ...}) and the
-- keys of the collapsed cards. Kept apart from tasks and milestones so dragging a node never edits their rows.
CREATE TABLE flow_layouts (
    user_id    BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id         TEXT    NOT NULL,
    positions  JSONB   NOT NULL DEFAULT '{}',
    collapsed  JSONB   NOT NULL DEFAULT '[]',
    updated_at BIGINT  NOT NULL,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    seq        BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX flow_layouts_seq_idx ON flow_layouts (user_id, seq);
