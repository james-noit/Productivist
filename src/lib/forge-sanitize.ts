import type { ForgeKind, ProjectSource } from '../types/forge';

/**
 * Validation of the `source` of rows read from an import file (untrusted: a bad one would be rejected by the backend and
 * wedge sync). Loaded with a dynamic `import()` by the app menu's import, so it stays out of the initial bundle.
 */

const KINDS: readonly ForgeKind[] = ['github', 'gitlab', 'gitea'];
const MAX_HOST = 300;
const MAX_URL = 500;
const MAX_REPO_PATH = 300;
const MAX_REPO_ID = 64;
const MAX_STAMP = 40;

const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const isHttpUrl = (value: unknown, max: number): value is string => isText(value, max) && /^https?:\/\/\S+$/i.test(value);

/** A well-formed source with defaults filled in, or undefined. */
export function sanitizeSource(value: unknown): ProjectSource | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const x = value as Record<string, unknown>;
  if (!KINDS.includes(x['kind'] as ForgeKind)) return undefined;
  if (!isHttpUrl(x['host'], MAX_HOST) || !isHttpUrl(x['url'], MAX_URL)) return undefined;
  if (!isText(x['repoId'], MAX_REPO_ID)) return undefined;
  const path = x['repoPath'];
  if (path !== undefined && !(typeof path === 'string' && path.length <= MAX_REPO_PATH)) return undefined;
  const n = x['number'];
  if (n !== undefined && !(typeof n === 'number' && Number.isInteger(n) && n > 0)) return undefined;
  const stamp = x['remoteUpdatedAt'];
  if (stamp !== undefined && !(typeof stamp === 'string' && stamp.length <= MAX_STAMP)) return undefined;
  // Built in the order `canonicalSource` (sync-engine.ts) uses, so a sanitised row hashes like one made by this app. It does
  // not import it: a lazy file reaching into the sync engine would split that eager module into a chunk of its own.
  const source: ProjectSource = {
    kind: x['kind'] as ForgeKind,
    host: x['host'],
    repoId: x['repoId'],
    repoPath: path ?? '',
    ...(n !== undefined ? { number: n } : {}),
    url: x['url'],
    ...(stamp !== undefined && stamp !== '' ? { remoteUpdatedAt: stamp } : {}),
    ...(x['remoteState'] === 'open' || x['remoteState'] === 'closed' ? { remoteState: x['remoteState'] } : {}),
  };
  const options = x['options'];
  if (options && typeof options === 'object') {
    const o = options as Record<string, unknown>;
    const last = o['lastSyncedAt'];
    source.options = {
      includeClosed: o['includeClosed'] === true,
      onlyAssignedToMe: o['onlyAssignedToMe'] === true,
      // The two switches that default to on read as on when absent.
      importMilestones: o['importMilestones'] !== false,
      labelsAsTags: o['labelsAsTags'] !== false,
      ...(typeof last === 'number' && Number.isFinite(last) && last >= 0 ? { lastSyncedAt: last } : {}),
    };
  }
  return source;
}

/** Drops `source` from a row unless it is valid; returns the row itself when it has none. */
export function withSanitizedSource<T extends { source?: unknown }>(row: T): T {
  if (row.source === undefined) return row;
  const clean = sanitizeSource(row.source);
  if (clean) return { ...row, source: clean };
  const { source: _dropped, ...rest } = row;
  return rest as T;
}

/** `withSanitizedSource` over a list from an import file; anything that is not a list of objects is returned unchanged. */
export function sanitizeSources<T>(rows: T): T {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => (row && typeof row === 'object' ? withSanitizedSource(row) : row)) as T;
}
