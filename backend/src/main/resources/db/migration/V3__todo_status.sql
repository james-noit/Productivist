-- Kanban workflow column. Null means "todo"; completion stays in the existing `done` flag.
ALTER TABLE todos ADD COLUMN status TEXT CHECK (status IN ('todo', 'inProgress', 'review'));
