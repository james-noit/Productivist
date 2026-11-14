import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { API_ENABLED, ApiError, api } from '../../../core/api';
import { feedUrl, googleSubscribeUrl, outlookSubscribeUrl } from '../../../lib/calendar-links';
import { loadCalendarTexts } from '../../../lib/calendar-texts';
import { AccountService } from '../../../services/account.service';
import { SettingsService } from '../../../services/settings.service';
import { ExternalHrefDirective } from '../../directives/external-href.directive';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

interface FeedStatus {
  token: string | null;
  createdAt: number | null;
  lastFetchedAt: number | null;
}

/**
 * Configuration > Integrations: the calendar subscription (`/api/calendar/feed`, see `backend/README.md`). One secret URL
 * per account that Google Calendar, Outlook and Proton Calendar poll; managing it needs a session, reading it does not.
 * Lazy; rendered only while sync exists.
 */
@Component({
  selector: 'app-calendar-feed-settings',
  standalone: true,
  imports: [TranslatePipe, ExternalHrefDirective, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar-feed-settings.component.html',
  styleUrl: './calendar-feed-settings.component.css',
})
export class CalendarFeedSettingsComponent {
  private readonly accounts = inject(AccountService);
  private readonly settings = inject(SettingsService);
  private readonly injector = inject(Injector);
  private readonly urlInput = viewChild<ElementRef<HTMLInputElement>>('urlInput');
  private readonly questionFocus = viewChild<ElementRef<HTMLButtonElement>>('questionFocus');

  readonly enabled = API_ENABLED;
  readonly ready = signal(false);
  readonly signedIn = computed(() => !!this.accounts.account()?.token);
  readonly status = signal<FeedStatus | null>(null);
  readonly busy = signal(false);
  readonly error = signal(false);
  readonly copied = signal(false);
  readonly confirm = signal<'regenerate' | 'off' | null>(null);

  readonly view = computed(() => {
    const token = this.status()?.token;
    if (!token) return null;
    const url = feedUrl(token);
    const read = this.status()?.lastFetchedAt;
    const format = new Intl.DateTimeFormat(this.settings.language(), { dateStyle: 'medium', timeStyle: 'short' });
    return { url, google: googleSubscribeUrl(url), outlook: outlookSubscribeUrl(url), lastRead: read ? format.format(new Date(read)) : null };
  });

  constructor() {
    void loadCalendarTexts(inject(TranslateService)).then(() => this.ready.set(true));
    effect(() => {
      const token = this.accounts.account()?.token;
      untracked(() => {
        this.status.set(null);
        this.confirm.set(null);
        if (this.enabled && token) void this.load(token);
      });
    });
  }

  private async load(token: string): Promise<void> {
    this.error.set(false);
    try {
      const status = await api<FeedStatus>('/api/calendar/feed', { token });
      if (this.accounts.account()?.token === token) this.status.set(status);
    } catch (e) {
      this.fail(e);
    }
  }

  async create(): Promise<void> {
    const token = this.accounts.account()?.token;
    if (!token || this.busy()) return;
    this.busy.set(true);
    this.error.set(false);
    try {
      this.status.set(await api<FeedStatus>('/api/calendar/feed', { method: 'POST', token }));
      this.confirm.set(null);
      this.copied.set(false);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  async turnOff(): Promise<void> {
    const token = this.accounts.account()?.token;
    if (!token || this.busy()) return;
    this.busy.set(true);
    this.error.set(false);
    try {
      await api<void>('/api/calendar/feed', { method: 'DELETE', token });
      this.status.set({ token: null, createdAt: null, lastFetchedAt: null });
      this.confirm.set(null);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(error: unknown): void {
    // A 401 is handled app-wide (expired session); anything else is shown here.
    if (error instanceof ApiError && error.status === 401) return;
    this.error.set(true);
  }

  async copy(): Promise<void> {
    const url = this.view()?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // No clipboard access (an http page, or a refused permission): select the text so Ctrl+C works.
      this.urlInput()?.nativeElement.select();
    }
  }

  private askedFrom: HTMLElement | null = null;

  ask(kind: 'regenerate' | 'off'): void {
    this.askedFrom = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.confirm.set(kind);
    afterNextRender(() => this.questionFocus()?.nativeElement.focus(), { injector: this.injector });
  }

  onQuestionKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    // Answer the question, not the Configuration modal.
    event.stopPropagation();
    this.dismiss();
  }

  dismiss(): void {
    this.confirm.set(null);
    if (this.askedFrom?.isConnected) this.askedFrom.focus();
  }
}
