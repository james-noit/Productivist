import { Injectable, inject, signal } from '@angular/core';
import { adapterFor } from '../lib/forge-adapters';
import { planImport, projectIdOf, repoRefOf, upsertMilestones, upsertProject, upsertTodos, type ImportSummary, type RepoRef } from '../lib/forge-map';
import { ForgeError } from '../types/forge';
import type { ForgeConnection, RemoteRepo, RepoSourceOptions } from '../types/forge';
import type { Project } from '../types/project';
import { ForgeConnectionsService } from './forge-connections.service';
import { ProjectsService } from './projects.service';
import { TodosService } from './todos.service';

export interface ImportResult {
  projectId: string;
  summary: ImportSummary;
  /** The 2 000 issue / 50 page cap stopped the import: there is more on the forge. */
  truncated: boolean;
}

export interface ImportProgress {
  stage: 'repo' | 'milestones' | 'issues';
  count: number;
}

/** Idle refreshes of a linked project open on screen are at most this often. */
const AUTO_REFRESH_MS = 10 * 60_000;
/** The next refresh asks for issues changed since a minute before the last one started, so clock skew loses nothing. */
const SKEW_MS = 60_000;

/**
 * Reads a repository from a Git forge and writes it as a project, milestones and tasks (read-only: nothing is sent
 * back). Every write is one `upsert` per store; the merge rules are in `lib/forge-map.ts`. Only injected from lazy
 * components, so the adapters and mappers stay out of the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class ForgeImportService {
  private readonly connections = inject(ForgeConnectionsService);
  private readonly projects = inject(ProjectsService);
  private readonly todos = inject(TodosService);

  /** Id of the project being imported or refreshed. One at a time. */
  readonly busy = signal<string | null>(null);
  readonly progress = signal<ImportProgress | null>(null);
  readonly lastError = signal<{ projectId: string; error: ForgeError } | null>(null);

  private readonly lastAttempt = new Map<string, number>();

  /** The device's connection for a linked project, if it has one. */
  connectionFor(project: Project): ForgeConnection | undefined {
    const source = project.source;
    return source ? this.connections.forHost(source.kind, source.host) : undefined;
  }

  importRepo(conn: ForgeConnection, repo: RemoteRepo, options: RepoSourceOptions): Promise<ImportResult | null> {
    const ref = repoRefOf(conn, repo);
    return this.run(conn, repo, ref, options, this.projects.projects().find((p) => p.id === projectIdOf(ref)));
  }

  async refreshProject(projectId: string): Promise<ImportResult | null> {
    const project = this.projects.projects().find((p) => p.id === projectId);
    const source = project?.source;
    if (!project || !source?.options) return null;
    const conn = this.connectionFor(project);
    if (!conn) return null;
    if (this.busy()) return null;
    // The repository is fetched again so a rename or a move updates the stored path and URL.
    this.busy.set(projectId);
    this.lastError.set(null);
    let repo: RemoteRepo;
    try {
      repo = await adapterFor(conn.kind).getRepo(conn, source.repoId);
    } catch (error) {
      this.fail(projectId, error);
      this.busy.set(null);
      return null;
    }
    this.busy.set(null);
    return this.run(conn, repo, { kind: source.kind, host: source.host, repoId: source.repoId, repoPath: repo.path, url: repo.url }, source.options, project);
  }

  /** Refreshes every linked project this device has a connection for, one after the other. */
  async refreshAll(): Promise<void> {
    for (const project of this.projects.projects()) {
      if (project.source?.options && this.connectionFor(project)) await this.refreshProject(project.id);
    }
  }

  /** The refresh of a linked project that is open on screen: at most every 10 minutes, only while the page is visible. */
  autoRefresh(projectId: string): void {
    if (document.visibilityState !== 'visible' || this.busy()) return;
    // The last successful refresh counts too, which another device may have made.
    const lastSync = this.projects.projects().find((p) => p.id === projectId)?.source?.options?.lastSyncedAt ?? 0;
    if (Date.now() - Math.max(lastSync, this.lastAttempt.get(projectId) ?? 0) < AUTO_REFRESH_MS) return;
    void this.refreshProject(projectId);
  }

  private async run(
    conn: ForgeConnection,
    repo: RemoteRepo,
    ref: RepoRef,
    options: RepoSourceOptions,
    localProject: Project | undefined,
  ): Promise<ImportResult | null> {
    const projectId = projectIdOf(ref);
    if (this.busy()) return null;
    this.busy.set(projectId);
    this.lastError.set(null);
    this.lastAttempt.set(projectId, Date.now());
    const startedAt = Date.now();
    const previous = localProject?.source?.options?.lastSyncedAt;
    try {
      const adapter = adapterFor(conn.kind);
      this.progress.set({ stage: 'milestones', count: 0 });
      const remoteMilestones = options.importMilestones ? await adapter.listMilestones(conn, repo) : [];
      this.progress.set({ stage: 'issues', count: 0 });
      let assignee: string | undefined;
      if (options.onlyAssignedToMe) assignee = conn.username || (await adapter.whoAmI(conn)).username;
      const { issues, truncated } = await adapter.listIssues(conn, repo, {
        state: previous || options.includeClosed ? 'all' : 'open',
        since: previous ? new Date(previous - SKEW_MS).toISOString() : undefined,
        assignee,
        onProgress: (count) => this.progress.set({ stage: 'issues', count }),
      });
      const same = (s: { kind: string; host: string; repoId: string } | undefined) =>
        s?.kind === ref.kind && s.host === ref.host && s.repoId === ref.repoId;
      const plan = planImport({
        repoRef: ref,
        repo,
        options,
        startedAt,
        localProject,
        localMilestones: this.projects.milestones().filter((m) => same(m.source)),
        localTodos: this.todos.todos().filter((t) => same(t.source)),
        remoteMilestones,
        remoteIssues: issues,
      });
      // With more issues on the forge than the cap, the cursor stays where it was: the next refresh looks again.
      const project: Project = truncated
        ? { ...plan.project, source: { ...plan.project.source!, options: { ...plan.project.source!.options!, lastSyncedAt: previous } } }
        : plan.project;
      // One write per store; the project goes first so no row ever points at a project that is not there yet.
      this.projects.projects.update((list) => upsertProject(list, project));
      if (plan.milestones.length) this.projects.milestones.update((list) => upsertMilestones(list, plan.milestones));
      if (plan.todos.length) this.todos.todos.update((list) => upsertTodos(list, plan.todos));
      return { projectId, summary: plan.summary, truncated };
    } catch (error) {
      this.fail(projectId, error);
      return null;
    } finally {
      this.busy.set(null);
      this.progress.set(null);
    }
  }

  private fail(projectId: string, error: unknown): void {
    this.lastError.set({ projectId, error: error instanceof ForgeError ? error : new ForgeError('network') });
  }
}
