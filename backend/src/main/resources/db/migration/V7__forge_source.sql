-- Rows imported from a Git forge (GitHub, GitLab, Gitea/Forgejo) remember where they came from: an optional JSON
-- object (kind, host, repoId, repoPath, number, url, remoteUpdatedAt, remoteState and, on a project, import options).
-- It never holds a secret; the access token stays on the device. Shape and sizes are validated by SyncDtos.SourceDto.
ALTER TABLE projects   ADD COLUMN source JSONB CHECK (source IS NULL OR jsonb_typeof(source) = 'object');
ALTER TABLE milestones ADD COLUMN source JSONB CHECK (source IS NULL OR jsonb_typeof(source) = 'object');
ALTER TABLE todos      ADD COLUMN source JSONB CHECK (source IS NULL OR jsonb_typeof(source) = 'object');
