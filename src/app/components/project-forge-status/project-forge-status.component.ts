import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FLAVORS, forgeName } from '../../../lib/forge-flavors';
import { loadForgeTexts } from '../../../lib/forge-texts';
import { ForgeConnectionsService } from '../../../services/forge-connections.service';
import { ForgeImportService } from '../../../services/forge-import.service';
import { SettingsService } from '../../../services/settings.service';
import { ViewService } from '../../../services/view.service';
import type { TransportId } from '../../../types/forge';
import type { Project } from '../../../types/project';
import { ExternalHrefDirective } from '../../directives/external-href.directive';
import { ForgeErrorComponent } from '../forge-error/forge-error.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

/** How often the "Synced 5 min ago" text and the idle-refresh check tick. */
const TICK_MS = 30_000;

/**
 * The linked-project strip of a project's header: "Synced 5 min ago · GitHub", a Refresh button, or "Connect GitHub to
 * refresh" when this device has no token for the host. While the project is open and the page visible it also
 * refreshes on its own, at most every 10 minutes (`ForgeImportService.autoRefresh`). Rendered by
 * `project-detail-view` inside `@defer`, only for projects with a `source`, so other projects never load it.
 */
@Component({
  selector: 'app-project-forge-status',
  standalone: true,
  imports: [TranslatePipe, ExternalHrefDirective, UiIconComponent, ForgeErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-forge-status.component.html',
  styleUrl: './project-forge-status.component.css',
})
export class ProjectForgeStatusComponent {
  private readonly importer = inject(ForgeImportService);
  private readonly connections = inject(ForgeConnectionsService);
  private readonly view = inject(ViewService);
  private readonly settings = inject(SettingsService);

  readonly project = input.required<Project>();
  /** The strings are a lazy chunk (`lib/forge-texts.ts`); the strip waits for them. */
  readonly ready = signal(false);

  private readonly now = signal(Date.now());
  readonly source = computed(() => this.project().source ?? null);
  readonly connection = computed(() => this.importer.connectionFor(this.project()));
  /** "GitHub", "Codeberg"...; a connection knows its flavor (Forgejo vs Gitea), a bare source only its host. */
  readonly name = computed(() => {
    const s = this.source();
    const flavor = this.connection()?.flavor;
    return (flavor && FLAVORS.find((f) => f.id === flavor)?.name) || (s ? forgeName(s) : '');
  });
  readonly busy = computed(() => this.importer.busy() === this.project().id);
  readonly error = computed(() => {
    const e = this.importer.lastError();
    return e && e.projectId === this.project().id ? e.error : null;
  });

  /** "Synced 5 minutes ago", in the app's language; re-read every tick and when the language changes. */
  readonly synced = computed(() => {
    const at = this.source()?.options?.lastSyncedAt;
    if (!at) return null;
    const seconds = Math.round((at - this.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(this.settings.language(), { numeric: 'auto' });
    const abs = Math.abs(seconds);
    const time =
      abs < 60 ? formatter.format(0, 'second') : abs < 3600 ? formatter.format(Math.round(seconds / 60), 'minute') : abs < 86400 ? formatter.format(Math.round(seconds / 3600), 'hour') : formatter.format(Math.round(seconds / 86400), 'day');
    return time;
  });

  constructor() {
    void loadForgeTexts(inject(TranslateService)).then(() => this.ready.set(true));
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') this.tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => this.tick(), TICK_MS);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    });
    // Opening a linked project (or getting a connection for it) checks whether it is due for a refresh.
    effect(() => {
      const id = this.project().id;
      if (this.connection()) untracked(() => this.importer.autoRefresh(id));
    });
  }

  private tick(): void {
    this.now.set(Date.now());
    if (this.connection()) this.importer.autoRefresh(this.project().id);
  }

  refresh(): void {
    void this.importer.refreshProject(this.project().id);
  }

  /** A way around CORS was picked: remember it on the connection and refresh again. */
  useTransport(transport: TransportId): void {
    const connection = this.connection();
    if (!connection) return;
    this.connections.update(connection.id, { transport });
    this.refresh();
  }

  connect(): void {
    const s = this.source();
    if (s) this.view.openConfiguration('integrations', { kind: s.kind, host: s.host });
  }
}
