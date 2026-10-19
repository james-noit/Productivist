import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { adapterFor } from '../../../lib/forge-adapters';
import { FLAVORS, flavorOf, type FlavorInfo } from '../../../lib/forge-flavors';
import { normalizeBaseUrl } from '../../../lib/forge-map';
import { loadForgeTexts } from '../../../lib/forge-texts';
import { ForgeConnectionsService } from '../../../services/forge-connections.service';
import { ViewService } from '../../../services/view.service';
import { ForgeError, type ForgeFlavor, type TransportId } from '../../../types/forge';
import { ExternalHrefDirective } from '../../directives/external-href.directive';
import { ForgeErrorComponent } from '../forge-error/forge-error.component';

interface TestOutcome {
  id: string;
  /** The username when the test passed. */
  user?: string;
  error?: ForgeError;
}

/**
 * Configuration → Integrations: the Git accounts of this device (GitHub, GitLab, Forgejo, Codeberg, Gitea). A
 * connection is a host plus a personal access token; "Test and save" asks the forge who the token belongs to and
 * keeps the connection only if that works. The tokens live in `ForgeConnectionsService`, device-local.
 */
@Component({
  selector: 'app-forge-connections-settings',
  standalone: true,
  imports: [TranslatePipe, ExternalHrefDirective, ForgeErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forge-connections-settings.component.html',
  styleUrl: './forge-connections-settings.component.css',
})
export class ForgeConnectionsSettingsComponent {
  private readonly store = inject(ForgeConnectionsService);
  private readonly view = inject(ViewService);
  private readonly injector = inject(Injector);
  /** The strings are a lazy chunk (`lib/forge-texts.ts`); the first render waits for them. */
  readonly ready = signal(false);

  protected readonly flavors = FLAVORS;
  readonly connections = computed(() =>
    this.store.connections().map((c) => ({ ...c, name: FLAVORS.find((f) => f.id === c.flavor)?.name ?? c.flavor })),
  );

  readonly adding = signal(false);
  readonly flavor = signal<FlavorInfo>(FLAVORS[0]);
  readonly host = signal(FLAVORS[0].host);
  readonly token = signal('');
  readonly busy = signal(false);
  /** `host` is a form mistake of ours, the rest a forge error. */
  readonly error = signal<ForgeError | 'host' | null>(null);
  /** The way around CORS picked for the account being added (device-local; `direct` until a failure offered another). */
  readonly transport = signal<TransportId>('direct');
  readonly formError = computed(() => {
    const e = this.error();
    return e instanceof ForgeError ? e : null;
  });
  readonly outcome = signal<TestOutcome | null>(null);
  readonly testing = signal<string | null>(null);
  readonly removing = signal<string | null>(null);

  /** Where "Create a token" goes: the platform's token page on the typed host. */
  readonly tokenUrl = computed(() => {
    const host = normalizeBaseUrl(this.host());
    return host ? this.flavor().tokenUrl(host) : '';
  });

  private readonly hostInput = viewChild<ElementRef<HTMLInputElement>>('hostInput');
  private readonly tokenInput = viewChild<ElementRef<HTMLInputElement>>('tokenInput');
  private readonly addButton = viewChild<ElementRef<HTMLButtonElement>>('addButton');

  constructor() {
    // "Connect GitHub to refresh" opens Integrations with the host already in the form.
    const prefill = this.view.forgePrefill();
    if (prefill) {
      this.view.forgePrefill.set(null);
      const flavor = flavorOf(prefill.kind, prefill.host);
      this.flavor.set(flavor);
      this.host.set(prefill.host);
      this.adding.set(true);
    }
    void loadForgeTexts(inject(TranslateService)).then(() => {
      this.ready.set(true);
      if (prefill) afterNextRender(() => this.tokenInput()?.nativeElement.focus(), { injector: this.injector });
    });
  }

  openForm(): void {
    this.flavor.set(FLAVORS[0]);
    this.host.set(FLAVORS[0].host);
    this.token.set('');
    this.error.set(null);
    this.transport.set('direct');
    this.adding.set(true);
    afterNextRender(() => this.tokenInput()?.nativeElement.focus(), { injector: this.injector });
  }

  closeForm(): void {
    this.adding.set(false);
    this.token.set('');
    this.error.set(null);
    afterNextRender(() => this.addButton()?.nativeElement.focus(), { injector: this.injector });
  }

  pickFlavor(id: ForgeFlavor): void {
    const flavor = FLAVORS.find((f) => f.id === id) ?? FLAVORS[0];
    this.flavor.set(flavor);
    this.host.set(flavor.host);
    this.error.set(null);
    this.transport.set('direct');
    if (!flavor.host) afterNextRender(() => this.hostInput()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Asks the forge who the token belongs to; the connection is kept only if it answers. */
  async testAndSave(event: Event): Promise<void> {
    event.preventDefault();
    const baseUrl = normalizeBaseUrl(this.host());
    const token = this.token().trim();
    if (!baseUrl) return this.error.set('host');
    if (!token || this.busy()) return;
    const flavor = this.flavor();
    this.busy.set(true);
    this.error.set(null);
    try {
      const transport = this.transport();
      const { username } = await adapterFor(flavor.kind).whoAmI({ id: '', kind: flavor.kind, flavor: flavor.id, baseUrl, token, transport, createdAt: 0 });
      const existing = this.store.forHost(flavor.kind, baseUrl);
      if (existing) this.store.update(existing.id, { token, username, transport });
      else this.store.add({ kind: flavor.kind, flavor: flavor.id, baseUrl, token, username, transport });
      this.closeForm();
    } catch (error) {
      this.error.set(error instanceof ForgeError ? error : new ForgeError('network'));
    } finally {
      this.busy.set(false);
    }
  }

  /** A way around CORS was picked for the account in the form: keep it and try again. */
  useFormTransport(transport: TransportId): void {
    this.transport.set(transport);
    void this.testAndSave(new Event('submit'));
  }

  /** The same for an account in the list. */
  useTransport(id: string, transport: TransportId): void {
    this.store.update(id, { transport });
    void this.test(id);
  }

  async test(id: string): Promise<void> {
    const connection = this.store.connections().find((c) => c.id === id);
    if (!connection || this.testing()) return;
    this.testing.set(id);
    this.outcome.set(null);
    try {
      const { username } = await adapterFor(connection.kind).whoAmI(connection);
      this.store.update(id, { username });
      this.outcome.set({ id, user: username });
    } catch (error) {
      this.outcome.set({ id, error: error instanceof ForgeError ? error : new ForgeError('network') });
    } finally {
      this.testing.set(null);
    }
  }

  askRemove(id: string): void {
    this.removing.set(id);
  }

  remove(id: string): void {
    this.store.remove(id);
    this.removing.set(null);
    if (this.outcome()?.id === id) this.outcome.set(null);
  }

  /** Escape closes the add form instead of the Configuration modal. */
  onFormKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    this.closeForm();
  }

  /** Escape on the question answers it; the Configuration modal does not also close. */
  onQuestionKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    this.removing.set(null);
  }
}
