-- Fitness director: the Sportask catalog overlay (docs/sportask/DIRECTOR.md).
-- An overlay is one JSON document layered over the built-in catalog by the clients. Like the other Sportask JSON the database
-- checks shape only (an object); vocabulary (exercise ids, parameters) is free, so new content needs no migration.

-- Published versions: append-only. The head is the highest version; there is no pointer to drift.
CREATE TABLE fitness_catalog_versions (
    version      INTEGER     PRIMARY KEY CHECK (version >= 1),
    document     JSONB       NOT NULL CHECK (jsonb_typeof(document) = 'object'),
    note         TEXT        NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    kind         TEXT        NOT NULL CHECK (kind IN ('publish', 'rollback')),
    rollback_of  INTEGER,
    -- ON DELETE SET NULL plus the denormalised email: the audit trail survives the director's account being deleted.
    author_id    BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    author_email TEXT        NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The one shared draft (a team edits one catalog). `revision` is the optimistic-concurrency counter of PUT /draft.
CREATE TABLE fitness_catalog_draft (
    id               SMALLINT    PRIMARY KEY CHECK (id = 1),
    document         JSONB       NOT NULL CHECK (jsonb_typeof(document) = 'object'),
    revision         BIGINT      NOT NULL DEFAULT 0,
    base_version     INTEGER     NOT NULL DEFAULT 0,
    updated_by_email TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO fitness_catalog_draft (id, document) VALUES (1, '{"schema": 1}');
