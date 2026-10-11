-- Recurring tasks: a series (task template + rule) and the link from each occurrence (an ordinary todo) back to it.
-- Same conventions as the other synced tables (client ids, last-write-wins on updated_at, tombstones, seq cursor)
-- and, like them, no foreign keys between rows.

CREATE TABLE recurrences (
    user_id       BIGINT  NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id            TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    description   TEXT,
    importance    TEXT    NOT NULL CHECK (importance IN ('low', 'medium', 'high')),
    urgency       TEXT    NOT NULL CHECK (urgency IN ('low', 'medium', 'high')),
    tags          TEXT[]  NOT NULL DEFAULT '{}',
    project_id    TEXT,
    milestone_id  TEXT,
    pomodoros_for_termination INTEGER,
    every         INTEGER NOT NULL CHECK (every BETWEEN 1 AND 365),
    unit          TEXT    NOT NULL CHECK (unit IN ('day', 'week', 'month', 'year')),
    -- Weekly series only: ISO weekdays (1 = Monday ... 7 = Sunday). Null means the start date's weekday.
    weekdays      JSONB   CHECK (weekdays IS NULL OR CASE WHEN jsonb_typeof(weekdays) = 'array'
                      THEN jsonb_array_length(weekdays) BETWEEN 1 AND 7 AND weekdays <@ '[1, 2, 3, 4, 5, 6, 7]'::jsonb
                      ELSE FALSE END),
    mode          TEXT    NOT NULL CHECK (mode IN ('schedule', 'afterCompletion')),
    -- Local calendar days like todos.due_date.
    start_date    TEXT    NOT NULL CHECK (start_date ~ '^\d{4}-\d{2}-\d{2}$'),
    end_date      TEXT    CHECK (end_date ~ '^\d{4}-\d{2}-\d{2}$'),
    paused        BOOLEAN NOT NULL DEFAULT FALSE,
    last_date     TEXT    CHECK (last_date ~ '^\d{4}-\d{2}-\d{2}$'),
    sort_order    DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at    BIGINT  NOT NULL,
    updated_at    BIGINT  NOT NULL,
    deleted       BOOLEAN NOT NULL DEFAULT FALSE,
    seq           BIGINT  NOT NULL DEFAULT nextval('sync_seq'),
    PRIMARY KEY (user_id, id)
);
CREATE INDEX recurrences_seq_idx ON recurrences (user_id, seq);

-- The series an occurrence belongs to; null for ordinary tasks.
ALTER TABLE todos ADD COLUMN recurrence_id TEXT;
