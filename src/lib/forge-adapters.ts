import { apiBase } from './forge-map';
import { transportFor, type TransportResponse } from './forge-transport';
import { ForgeError } from '../types/forge';
import type { ForgeConnection, ForgeKind, RemoteIssue, RemoteMilestone, RemoteRepo } from '../types/forge';

/**
 * One adapter per forge API (GitHub, GitLab, Gitea/Forgejo), normalising each response into the shapes of
 * `types/forge.ts`. Plain `fetch`, sequential, with hard caps. Lazy: only the Forge services import it.
 */

export const MAX_ISSUES = 2000;
export const MAX_PAGES = 50;
const REQUEST_TIMEOUT_MS = 15_000;
const GITHUB_PAGE = 100;
const GITLAB_PAGE = 100;
const GITLAB_REPO_PAGE = 30;
const GITEA_PAGE = 50;

export interface IssueQuery {
  /** ISO timestamp: only issues updated since. */
  since?: string;
  state: 'open' | 'all';
  /** Username of the assignee to filter by. */
  assignee?: string;
  /** Called after each page with the number of issues collected so far. */
  onProgress?: (count: number) => void;
}

export interface ForgeAdapter {
  whoAmI(c: ForgeConnection): Promise<{ username: string }>;
  listRepos(c: ForgeConnection, query: string, page: number): Promise<{ repos: RemoteRepo[]; more: boolean }>;
  getRepo(c: ForgeConnection, repoId: string): Promise<RemoteRepo>;
  listMilestones(c: ForgeConnection, repo: RemoteRepo): Promise<RemoteMilestone[]>;
  listIssues(c: ForgeConnection, repo: RemoteRepo, q: IssueQuery): Promise<{ issues: RemoteIssue[]; truncated: boolean }>;
}

// ---- Transport ------------------------------------------------------------------------------------------------

function authHeaders(c: Pick<ForgeConnection, 'kind' | 'token'>): Record<string, string> {
  // An empty token sends no Authorization header at all: public repositories can be read anonymously.
  switch (c.kind) {
    case 'github':
      return {
        ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}),
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
    case 'gitlab':
      return c.token ? { Authorization: `Bearer ${c.token}` } : {};
    case 'gitea':
      return { ...(c.token ? { Authorization: `token ${c.token}` } : {}), Accept: 'application/json' };
  }
}

function retryAtOf(headers: TransportResponse['headers']): number | undefined {
  const after = Number(headers.get('Retry-After'));
  if (Number.isFinite(after) && after > 0) return Date.now() + after * 1000;
  const reset = Number(headers.get('X-RateLimit-Reset'));
  return Number.isFinite(reset) && reset > 0 ? reset * 1000 : undefined;
}

/** Maps a failed response to the error the UI explains (section 3.1 of docs/integrations/PLAN.md). */
function errorFor(status: number, headers: TransportResponse['headers']): ForgeError {
  if (status === 401) return new ForgeError('auth');
  if (status === 429 || (status === 403 && (headers.get('X-RateLimit-Remaining') === '0' || headers.has('Retry-After')))) {
    return new ForgeError('rateLimited', retryAtOf(headers));
  }
  if (status === 403 || status === 404) return new ForgeError('notFound');
  return new ForgeError('server');
}

interface Fetched {
  data: unknown;
  headers: TransportResponse['headers'];
}

async function getJson(c: ForgeConnection, url: string): Promise<Fetched> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: TransportResponse;
    try {
      response = await transportFor(c)({ url, method: 'GET', headers: authHeaders(c), signal: controller.signal });
    } catch (error) {
      if (error instanceof ForgeError) throw error;
      // A blocked cross-origin request surfaces as a bare TypeError with no status.
      throw new ForgeError(controller.signal.aborted || navigator.onLine === false ? 'network' : 'cors');
    }
    if (!response.ok) throw errorFor(response.status, response.headers);
    try {
      return { data: await response.json(), headers: response.headers };
    } catch {
      throw new ForgeError(controller.signal.aborted ? 'network' : 'server');
    }
  } finally {
    clearTimeout(timer);
  }
}

function withParams(url: string, params: Record<string, string | number | undefined>): string {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') u.searchParams.set(key, String(value));
  return u.toString();
}

/** The `rel="next"` URL of a `Link` header, if it stays on the API's own origin (the token must not follow it elsewhere). */
function linkNext(headers: TransportResponse['headers'], base: string): string | null {
  const match = /<([^>]+)>;\s*rel="next"/.exec(headers.get('Link') ?? '');
  if (!match) return null;
  try {
    return new URL(match[1]).origin === new URL(base).origin ? match[1] : null;
  } catch {
    return null;
  }
}

const withPage = (url: string, page: number): string => withParams(url, { page });
const pageOf = (url: string): number => Number(new URL(url).searchParams.get('page')) || 1;

/**
 * Walks the pages of a list endpoint, one request at a time. `next` gets the URL just fetched, its headers and the
 * raw item count and returns the next URL (or null). Stops at the item and page caps and says so.
 */
async function collect<T>(
  c: ForgeConnection,
  first: string,
  pick: (data: unknown) => unknown[],
  map: (raw: unknown) => T | null,
  next: (url: string, headers: TransportResponse['headers'], count: number) => string | null,
  onProgress?: (count: number) => void,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let url: string | null = first;
  for (let pages = 0; url; pages++) {
    if (pages >= MAX_PAGES) return { items, truncated: true };
    const { data, headers } = await getJson(c, url);
    const raw = pick(data);
    for (const entry of raw) {
      const item = map(entry);
      if (item) items.push(item);
    }
    url = next(url, headers, raw.length);
    onProgress?.(items.length);
    if (items.length >= MAX_ISSUES) return { items: items.slice(0, MAX_ISSUES), truncated: url !== null || items.length > MAX_ISSUES };
  }
  return { items, truncated: false };
}

// ---- Shared pieces --------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === 'object' ? (value as Json) : {});
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const optText = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const labelNames = (labels: unknown): string[] =>
  arr(labels)
    .map((l) => (typeof l === 'string' ? l : text(obj(l)['name'])))
    .filter(Boolean);
const idOf = (value: unknown): string => (typeof value === 'number' || typeof value === 'string' ? String(value) : '');

/**
 * `owner/name`: the shape that is looked up directly instead of searched. Only GitLab has nested groups; a longer path
 * elsewhere would hit an unknown route, whose 404 carries no CORS headers and would read as a CORS failure.
 */
const isRepoPath = (query: string, nested = false): boolean =>
  (nested ? /^[\w.-]+(\/[\w.-]+)+$/ : /^[\w.-]+\/[\w.-]+$/).test(query.trim());

// ---- GitHub ---------------------------------------------------------------------------------------------------

export function mapGithubRepo(raw: unknown): RemoteRepo | null {
  const r = obj(raw);
  const id = idOf(r['id']);
  const path = text(r['full_name']);
  if (!id || !path) return null;
  return {
    id,
    path,
    name: text(r['name']) || path,
    owner: text(obj(r['owner'])['login']) || path.split('/')[0],
    description: text(r['description']),
    url: text(r['html_url']),
    private: r['private'] === true,
    // GitHub counts pull requests in this number.
    openIssues: typeof r['open_issues_count'] === 'number' ? r['open_issues_count'] : undefined,
  };
}

export function mapGithubIssue(raw: unknown): RemoteIssue | null {
  const i = obj(raw);
  if (i['pull_request'] || typeof i['number'] !== 'number') return null;
  const milestone = obj(i['milestone']);
  return {
    number: i['number'],
    title: text(i['title']),
    body: text(i['body']),
    state: i['state'] === 'closed' ? 'closed' : 'open',
    labels: labelNames(i['labels']),
    url: text(i['html_url']),
    createdAt: text(i['created_at']),
    updatedAt: text(i['updated_at']),
    closedAt: optText(i['closed_at']),
    milestoneId: typeof milestone['number'] === 'number' ? milestone['number'] : undefined,
  };
}

function mapGithubMilestone(raw: unknown): RemoteMilestone | null {
  const m = obj(raw);
  if (typeof m['number'] !== 'number') return null;
  return {
    id: m['number'],
    title: text(m['title']),
    dueDate: optText(m['due_on']),
    url: text(m['html_url']),
    updatedAt: optText(m['updated_at']),
  };
}

const github: ForgeAdapter = {
  async whoAmI(c) {
    const { data } = await getJson(c, `${apiBase(c)}/user`);
    return { username: text(obj(data)['login']) };
  },
  async listRepos(c, query, page) {
    const base = apiBase(c);
    const q = query.trim();
    if (q && isRepoPath(q)) return lookup(c, `${base}/repos/${q}`, mapGithubRepo);
    const url = q
      ? withParams(`${base}/search/repositories`, { q: c.username ? `${q} user:${c.username}` : q, per_page: 30, page })
      : withParams(`${base}/user/repos`, { per_page: GITHUB_PAGE, sort: 'updated', affiliation: 'owner,collaborator,organization_member', page });
    const { data, headers } = await getJson(c, url);
    const raw = q ? arr(obj(data)['items']) : arr(data);
    return { repos: raw.map(mapGithubRepo).filter((r): r is RemoteRepo => r !== null), more: linkNext(headers, base) !== null };
  },
  async getRepo(c, repoId) {
    const repo = mapGithubRepo((await getJson(c, `${apiBase(c)}/repositories/${repoId}`)).data);
    if (!repo) throw new ForgeError('notFound');
    return repo;
  },
  async listMilestones(c, repo) {
    const base = apiBase(c);
    const first = withParams(`${base}/repos/${repo.path}/milestones`, { state: 'all', per_page: GITHUB_PAGE });
    return (await collect(c, first, arr, mapGithubMilestone, (_u, h) => linkNext(h, base))).items;
  },
  listIssues(c, repo, q) {
    const base = apiBase(c);
    const first = withParams(`${base}/repos/${repo.path}/issues`, {
      state: q.state,
      per_page: GITHUB_PAGE,
      since: q.since,
      assignee: q.assignee,
    });
    return collect(c, first, arr, mapGithubIssue, (_u, h) => linkNext(h, base), q.onProgress).then((r) => ({ issues: r.items, truncated: r.truncated }));
  },
};

// ---- GitLab ---------------------------------------------------------------------------------------------------

export function mapGitlabRepo(raw: unknown): RemoteRepo | null {
  const r = obj(raw);
  const id = idOf(r['id']);
  const path = text(r['path_with_namespace']);
  if (!id || !path) return null;
  return {
    id,
    path,
    name: text(r['name']) || path,
    owner: text(obj(r['namespace'])['full_path']) || path.split('/').slice(0, -1).join('/'),
    description: text(r['description']),
    url: text(r['web_url']),
    private: r['visibility'] !== undefined && r['visibility'] !== 'public',
    openIssues: typeof r['open_issues_count'] === 'number' ? r['open_issues_count'] : undefined,
  };
}

export function mapGitlabIssue(raw: unknown): RemoteIssue | null {
  const i = obj(raw);
  if (typeof i['iid'] !== 'number') return null;
  const milestone = obj(i['milestone']);
  return {
    number: i['iid'],
    title: text(i['title']),
    body: text(i['description']),
    state: i['state'] === 'closed' ? 'closed' : 'open',
    labels: labelNames(i['labels']),
    url: text(i['web_url']),
    createdAt: text(i['created_at']),
    updatedAt: text(i['updated_at']),
    closedAt: optText(i['closed_at']),
    milestoneId: typeof milestone['id'] === 'number' ? milestone['id'] : undefined,
    dueDate: optText(i['due_date']),
  };
}

function mapGitlabMilestone(raw: unknown): RemoteMilestone | null {
  const m = obj(raw);
  if (typeof m['id'] !== 'number') return null;
  return {
    id: m['id'],
    title: text(m['title']),
    startDate: optText(m['start_date']),
    dueDate: optText(m['due_date']),
    url: text(m['web_url']),
    updatedAt: optText(m['updated_at']),
  };
}

/** GitLab says what the next page is in `X-Next-Page` (empty on the last one). */
function gitlabNext(pageSize: number): (url: string, headers: TransportResponse['headers'], count: number) => string | null {
  return (url, headers, count) => {
    const header = headers.get('X-Next-Page');
    if (header !== null) return header ? withPage(url, Number(header)) : null;
    return count >= pageSize ? withPage(url, pageOf(url) + 1) : null;
  };
}

const gitlab: ForgeAdapter = {
  async whoAmI(c) {
    const { data } = await getJson(c, `${apiBase(c)}/user`);
    return { username: text(obj(data)['username']) };
  },
  async listRepos(c, query, page) {
    const base = apiBase(c);
    const q = query.trim();
    if (q && isRepoPath(q, true)) return lookup(c, `${base}/projects/${encodeURIComponent(q)}`, mapGitlabRepo);
    const url = withParams(`${base}/projects`, {
      membership: 'true',
      per_page: GITLAB_REPO_PAGE,
      order_by: 'last_activity_at',
      search: q,
      page,
    });
    const { data, headers } = await getJson(c, url);
    const repos = arr(data).map(mapGitlabRepo).filter((r): r is RemoteRepo => r !== null);
    return { repos, more: (headers.get('X-Next-Page') ?? '') !== '' };
  },
  async getRepo(c, repoId) {
    const repo = mapGitlabRepo((await getJson(c, `${apiBase(c)}/projects/${repoId}`)).data);
    if (!repo) throw new ForgeError('notFound');
    return repo;
  },
  async listMilestones(c, repo) {
    const first = withParams(`${apiBase(c)}/projects/${repo.id}/milestones`, { per_page: GITLAB_PAGE, include_ancestors: 'true' });
    return (await collect(c, first, arr, mapGitlabMilestone, gitlabNext(GITLAB_PAGE))).items;
  },
  listIssues(c, repo, q) {
    const first = withParams(`${apiBase(c)}/projects/${repo.id}/issues`, {
      state: q.state === 'open' ? 'opened' : 'all',
      per_page: GITLAB_PAGE,
      updated_after: q.since,
      assignee_username: q.assignee,
    });
    return collect(c, first, arr, mapGitlabIssue, gitlabNext(GITLAB_PAGE), q.onProgress).then((r) => ({ issues: r.items, truncated: r.truncated }));
  },
};

// ---- Gitea / Forgejo ------------------------------------------------------------------------------------------

export function mapGiteaRepo(raw: unknown): RemoteRepo | null {
  const r = obj(raw);
  const id = idOf(r['id']);
  const path = text(r['full_name']);
  if (!id || !path) return null;
  const owner = obj(r['owner']);
  return {
    id,
    path,
    name: text(r['name']) || path,
    owner: text(owner['login']) || text(owner['username']) || path.split('/')[0],
    description: text(r['description']),
    url: text(r['html_url']),
    private: r['private'] === true,
    openIssues: typeof r['open_issues_count'] === 'number' ? r['open_issues_count'] : undefined,
  };
}

export function mapGiteaIssue(raw: unknown): RemoteIssue | null {
  const i = obj(raw);
  if (i['pull_request'] || typeof i['number'] !== 'number') return null;
  const milestone = obj(i['milestone']);
  return {
    number: i['number'],
    title: text(i['title']),
    body: text(i['body']),
    state: i['state'] === 'closed' ? 'closed' : 'open',
    labels: labelNames(i['labels']),
    url: text(i['html_url']),
    createdAt: text(i['created_at']),
    updatedAt: text(i['updated_at']),
    closedAt: optText(i['closed_at']),
    milestoneId: typeof milestone['id'] === 'number' ? milestone['id'] : undefined,
    dueDate: optText(i['due_date']),
  };
}

function mapGiteaMilestone(repoUrl: string): (raw: unknown) => RemoteMilestone | null {
  return (raw) => {
    const m = obj(raw);
    if (typeof m['id'] !== 'number') return null;
    return {
      id: m['id'],
      title: text(m['title']),
      dueDate: optText(m['due_on']),
      url: `${repoUrl}/milestone/${m['id']}`,
      updatedAt: optText(m['updated_at']),
    };
  };
}

/** Gitea and Forgejo do not expose pagination headers cross-origin: a page shorter than the limit is the last one. */
const giteaNext = (url: string, _headers: TransportResponse['headers'], count: number): string | null =>
  count >= GITEA_PAGE ? withPage(url, pageOf(url) + 1) : null;

const gitea: ForgeAdapter = {
  async whoAmI(c) {
    const { data } = await getJson(c, `${apiBase(c)}/user`);
    const user = obj(data);
    return { username: text(user['login']) || text(user['username']) };
  },
  async listRepos(c, query, page) {
    const base = apiBase(c);
    const q = query.trim();
    if (q && isRepoPath(q)) return lookup(c, `${base}/repos/${q}`, mapGiteaRepo);
    const url = q
      ? withParams(`${base}/repos/search`, { q, limit: GITEA_PAGE, page })
      : withParams(`${base}/user/repos`, { limit: GITEA_PAGE, page });
    const { data } = await getJson(c, url);
    const raw = q ? arr(obj(data)['data']) : arr(data);
    return { repos: raw.map(mapGiteaRepo).filter((r): r is RemoteRepo => r !== null), more: raw.length >= GITEA_PAGE };
  },
  async getRepo(c, repoId) {
    const repo = mapGiteaRepo((await getJson(c, `${apiBase(c)}/repositories/${repoId}`)).data);
    if (!repo) throw new ForgeError('notFound');
    return repo;
  },
  async listMilestones(c, repo) {
    const first = withParams(`${apiBase(c)}/repos/${repo.path}/milestones`, { state: 'all', limit: GITEA_PAGE, page: 1 });
    return (await collect(c, first, arr, mapGiteaMilestone(repo.url), giteaNext)).items;
  },
  listIssues(c, repo, q) {
    const first = withParams(`${apiBase(c)}/repos/${repo.path}/issues`, {
      type: 'issues',
      state: q.state === 'open' ? 'open' : 'all',
      limit: GITEA_PAGE,
      page: 1,
      since: q.since,
      assigned_by: q.assignee,
    });
    return collect(c, first, arr, mapGiteaIssue, giteaNext, q.onProgress).then((r) => ({ issues: r.items, truncated: r.truncated }));
  },
};

/** A repository asked for by its `owner/name`: one request, nothing found is an empty list rather than an error. */
async function lookup(
  c: ForgeConnection,
  url: string,
  map: (raw: unknown) => RemoteRepo | null,
): Promise<{ repos: RemoteRepo[]; more: boolean }> {
  try {
    const repo = map((await getJson(c, url)).data);
    return { repos: repo ? [repo] : [], more: false };
  } catch (error) {
    if (error instanceof ForgeError && error.kind === 'notFound') return { repos: [], more: false };
    throw error;
  }
}

const ADAPTERS: Record<ForgeKind, ForgeAdapter> = { github, gitlab, gitea };

export const adapterFor = (kind: ForgeKind): ForgeAdapter => ADAPTERS[kind];
