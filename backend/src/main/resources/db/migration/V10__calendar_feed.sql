-- Calendar subscription: one secret feed URL per user (GET /api/calendar/ics/<token>.ics, public), which Google Calendar,
-- Outlook and Proton Calendar poll on their own schedule. The token is stored as is (unlike auth_tokens, which only keep a
-- hash) so the user can copy the URL again later: it is read-only, it only exposes what the todos table already holds,
-- and regenerating it (a new row value) or deleting the row revokes it.
CREATE TABLE calendar_feeds (
    user_id         BIGINT      PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    token           TEXT        NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{43}$'),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_fetched_at TIMESTAMPTZ
);
