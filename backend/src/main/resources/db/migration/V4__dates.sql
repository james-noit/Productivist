-- Local calendar days as 'YYYY-MM-DD' text (not timestamps: a due date is a day, not an instant, and must not shift
-- with the device's timezone). Null means no date.
ALTER TABLE todos
    ADD COLUMN start_date TEXT CHECK (start_date ~ '^\d{4}-\d{2}-\d{2}$'),
    ADD COLUMN due_date TEXT CHECK (due_date ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE milestones
    ADD COLUMN start_date TEXT CHECK (start_date ~ '^\d{4}-\d{2}-\d{2}$'),
    ADD COLUMN due_date TEXT CHECK (due_date ~ '^\d{4}-\d{2}-\d{2}$');
