export type ForgeKind = 'github' | 'gitlab' | 'gitea'; // gitea covers Forgejo and Codeberg
/**
 * How requests reach the forge. `direct` is plain `fetch` (the browser's CORS rules apply); the others are for servers that
 * refuse cross-origin requests: `extension` (Thunderbird, a granted host permission makes `fetch` exempt from CORS), `native`
 * (the mobile apps' HTTP plugin) and `relay` (the Productivist backend, signed-in users only).
 */
export type TransportId = 'direct' | 'extension' | 'native' | 'relay';
export type ForgeFlavor = 'github' | 'gitlab' | 'gitea' | 'forgejo' | 'codeberg'; // UI label only

/** Device-local. Holds the secret: never synced, never exported. */
export interface ForgeConnection {
  id: string;
  kind: ForgeKind;
  flavor: ForgeFlavor;
  /** Web base URL without trailing slash, e.g. https://github.com, https://gitlab.example.org, https://codeberg.org */
  baseUrl: string;
  token: string;
  /** Filled by "Test and save". */
  username?: string;
  /** Chosen after a CORS failure and remembered here (device-local); absent means `direct`. */
  transport?: TransportId;
  createdAt: number;
}

/** Synced, on Project / Milestone / Todo. No secret in here. */
export interface ExternalRef {
  kind: ForgeKind;
  /** Normalised web base URL (same rule as ForgeConnection.baseUrl): the key that finds a connection on any device. */
  host: string;
  /** Stable remote repository id (GitHub/Gitea numeric id, GitLab project id) as a string. */
  repoId: string;
  /** 'owner/name' (GitLab: path_with_namespace), for display and URLs; may change on rename, repoId does not. */
  repoPath: string;
  /** Issue number (GitHub/Gitea `number`, GitLab `iid`) or milestone id; absent on a project. */
  number?: number;
  /** Web URL of the remote item ("Open on GitHub"). */
  url: string;
  /** Remote `updated_at` and state when last imported, to tell remote changes from local ones. */
  remoteUpdatedAt?: string;
  remoteState?: 'open' | 'closed';
}

/** Only on a Project's source: the import options and the refresh cursor. */
export interface RepoSourceOptions {
  includeClosed: boolean;
  onlyAssignedToMe: boolean;
  importMilestones: boolean;
  labelsAsTags: boolean;
  /** Epoch ms of the last successful refresh; becomes the `since` / `updated_after` filter. */
  lastSyncedAt?: number;
}

export type ProjectSource = ExternalRef & { options?: RepoSourceOptions };

export const DEFAULT_REPO_OPTIONS: RepoSourceOptions = {
  includeClosed: false,
  onlyAssignedToMe: false,
  importMilestones: true,
  labelsAsTags: true,
};

// ---- Normalised remote shapes (what the adapters return, platform-independent) ---------------------------------

export interface RemoteRepo {
  id: string;
  /** 'owner/name' */
  path: string;
  name: string;
  owner: string;
  description: string;
  url: string;
  private: boolean;
  openIssues?: number;
}

export interface RemoteMilestone {
  id: number;
  title: string;
  /** 'YYYY-MM-DD' or a timestamp, as the platform gives it. */
  startDate?: string;
  dueDate?: string;
  url: string;
  /** Remote `updated_at`, the version stamp used to tell a remote edit from a local one. */
  updatedAt?: string;
}

export interface RemoteIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  /** Remote milestone id (matches RemoteMilestone.id). */
  milestoneId?: number;
  /** 'YYYY-MM-DD' or a timestamp. */
  dueDate?: string;
}

export type ForgeErrorKind = 'cors' | 'auth' | 'notFound' | 'rateLimited' | 'network' | 'server' | 'relay';

export class ForgeError extends Error {
  readonly kind: ForgeErrorKind;
  /** Epoch ms after which a rate-limited request may be retried, when the forge said so. */
  readonly retryAt?: number;

  constructor(kind: ForgeErrorKind, retryAt?: number) {
    super(kind);
    this.kind = kind;
    this.retryAt = retryAt;
  }
}
