import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { adapterFor } from '../../../lib/forge-adapters';
import { flavorOf } from '../../../lib/forge-flavors';
import { projectIdOf, repoRefOf } from '../../../lib/forge-map';
import { trapTab } from '../../../lib/focus-trap';
import { loadForgeTexts } from '../../../lib/forge-texts';
import { normalizeQuery } from '../../../lib/search';
import { ForgeConnectionsService } from '../../../services/forge-connections.service';
import { ForgeImportService, type ImportResult } from '../../../services/forge-import.service';
import { ProjectsService } from '../../../services/projects.service';
import { ViewService } from '../../../services/view.service';
import { DEFAULT_REPO_OPTIONS, ForgeError, type RemoteRepo, type RepoSourceOptions, type TransportId } from '../../../types/forge';
import { ForgeErrorComponent } from '../forge-error/forge-error.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const SEARCH_DELAY_MS = 300;

/**
 * "Import from Git": pick a connection, search or browse its repositories, choose what to bring in and import it as a
 * project with its milestones and issues. A repository that is already a project offers Refresh instead. Lazy
 * (rendered by `projects-view` inside `@defer`), so the adapters and mappers load only when this opens.
 */
@Component({
  selector: 'app-import-repo-modal',
  standalone: true,
  imports: [TranslatePipe, UiIconComponent, ForgeErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './import-repo-modal.component.html',
  styleUrl: './import-repo-modal.component.css',
})
export class ImportRepoModalComponent {
  private readonly store = inject(ForgeConnectionsService);
  private readonly projects = inject(ProjectsService);
  private readonly view = inject(ViewService);
  private readonly injector = inject(Injector);
  protected readonly importer = inject(ForgeImportService);

  readonly close = output<void>();
  /** The strings are a lazy chunk (`lib/forge-texts.ts`); the dialog's content waits for them. */
  readonly ready = signal(false);

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly connections = computed(() =>
    this.store.connections().map((c) => ({ id: c.id, label: `${flavorOf(c.kind, c.baseUrl).name} · ${c.baseUrl.replace(/^https?:\/\//, '')}${c.username ? ' · @' + c.username : ''}` })),
  );
  readonly connectionId = signal<string | null>(this.store.connections()[0]?.id ?? null);
  readonly connection = computed(() => this.store.connections().find((c) => c.id === this.connectionId()) ?? null);

  readonly query = signal('');
  readonly repos = signal<RemoteRepo[]>([]);
  readonly more = signal(false);
  readonly loading = signal(false);
  readonly loadError = signal<ForgeError | null>(null);
  readonly selected = signal<RemoteRepo | null>(null);
  readonly result = signal<ImportResult | null>(null);

  readonly options = signal<RepoSourceOptions>({ ...DEFAULT_REPO_OPTIONS });
  readonly switches = computed(() => {
    const o = this.options();
    return [
      { key: 'includeClosed', label: 'forge.opt.closed', on: o.includeClosed },
      { key: 'onlyAssignedToMe', label: 'forge.opt.mine', on: o.onlyAssignedToMe },
      { key: 'importMilestones', label: 'forge.opt.milestones', on: o.importMilestones },
      { key: 'labelsAsTags', label: 'forge.opt.labels', on: o.labelsAsTags },
    ] as const;
  });

  private page = 1;
  /** Bumped by every search so a slow answer to an older one is dropped. */
  private searchSeq = 0;

  /** The loaded repositories narrowed by what is typed, each with its project when it was imported before. */
  readonly rows = computed(() => {
    const conn = this.connection();
    if (!conn) return [];
    const needle = normalizeQuery(this.query().trim());
    const projectIds = new Set(this.projects.projects().map((p) => p.id));
    return this.repos()
      .filter((r) => !needle || normalizeQuery(`${r.path} ${r.description}`).includes(needle))
      .map((repo) => {
        const id = projectIdOf(repoRefOf(conn, repo));
        return { repo, projectId: projectIds.has(id) ? id : null };
      });
  });

  readonly progressKey = computed(() => {
    const p = this.importer.progress();
    return p ? (p.stage === 'issues' ? 'forge.reading.issues' : 'forge.reading.milestones') : null;
  });
  readonly importError = computed(() => {
    const e = this.importer.lastError();
    return e && e.projectId === this.workingOn() ? e.error : null;
  });
  private readonly workingOn = signal('');

  constructor() {
    afterNextRender(() => this.panel()?.nativeElement.focus(), { injector: this.injector });
    void loadForgeTexts(inject(TranslateService)).then(() => {
      this.ready.set(true);
      afterNextRender(() => (this.searchInput() ?? this.panel())?.nativeElement.focus(), { injector: this.injector });
    });

    // Debounced search: runs for the first connection at once, then whenever the connection or the typed text changes.
    effect((onCleanup) => {
      const conn = this.connection();
      const query = this.query();
      if (!conn) return;
      const timer = setTimeout(() => untracked(() => void this.load(1)), query.trim() ? SEARCH_DELAY_MS : 0);
      onCleanup(() => clearTimeout(timer));
    });
  }

  async load(page: number): Promise<void> {
    const conn = this.connection();
    if (!conn) return;
    const seq = ++this.searchSeq;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const { repos, more } = await adapterFor(conn.kind).listRepos(conn, this.query(), page);
      if (seq !== this.searchSeq) return;
      this.page = page;
      this.repos.set(page === 1 ? repos : [...this.repos(), ...repos.filter((r) => !this.repos().some((x) => x.id === r.id))]);
      this.more.set(more);
      // A choice that is not in the new results is gone from the screen, so it must not be imported unseen.
      if (!this.repos().some((r) => r.id === this.selected()?.id)) this.selected.set(null);
    } catch (error) {
      if (seq !== this.searchSeq) return;
      this.repos.set(page === 1 ? [] : this.repos());
      if (page === 1) this.selected.set(null);
      this.more.set(false);
      this.loadError.set(error instanceof ForgeError ? error : new ForgeError('network'));
    } finally {
      if (seq === this.searchSeq) this.loading.set(false);
    }
  }

  /** A way around CORS was picked for this account: remember it on the connection and try again. */
  useTransport(transport: TransportId): void {
    const id = this.connectionId();
    if (!id) return;
    this.store.update(id, { transport });
    this.importer.lastError.set(null);
    void this.load(1);
  }

  loadMore(): void {
    void this.load(this.page + 1);
  }

  setConnection(id: string): void {
    this.connectionId.set(id);
    this.repos.set([]);
    this.selected.set(null);
  }

  choose(repo: RemoteRepo): void {
    this.selected.set(this.selected()?.id === repo.id ? null : repo);
  }

  toggle(key: 'includeClosed' | 'onlyAssignedToMe' | 'importMilestones' | 'labelsAsTags'): void {
    this.options.update((o) => ({ ...o, [key]: !o[key] }));
  }

  async runImport(): Promise<void> {
    const conn = this.connection();
    const repo = this.selected();
    if (!conn || !repo || this.importer.busy()) return;
    this.workingOn.set(projectIdOf(repoRefOf(conn, repo)));
    const result = await this.importer.importRepo(conn, repo, this.options());
    if (result) this.result.set(result);
  }

  async refresh(projectId: string): Promise<void> {
    if (this.importer.busy()) return;
    this.workingOn.set(projectId);
    const result = await this.importer.refreshProject(projectId);
    if (result) this.result.set(result);
  }

  openProject(): void {
    const result = this.result();
    if (!result) return;
    this.close.emit();
    this.view.openProject(result.projectId);
  }

  openIntegrations(): void {
    this.close.emit();
    this.view.openConfiguration('integrations');
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close.emit();
      return;
    }
    const panel = this.panel()?.nativeElement;
    if (panel) trapTab(event, panel);
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }
}
