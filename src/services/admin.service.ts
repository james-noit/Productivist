import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiError, api } from '../core/api';
import { AccountService } from './account.service';

/** Account metadata only: the admin API never exposes anyone's tasks or projects, just how many there are. */
export interface AdminUser {
  id: number;
  email: string;
  createdAt: string;
  hasPassword: boolean;
  sessions: number;
  todos: number;
  projects: number;
}

export interface AdminStats {
  users: number;
  withoutPassword: number;
  sessions: number;
  todos: number;
  projects: number;
}

interface UserPage {
  users: AdminUser[];
  total: number;
}

export type AdminLoadError = 'network' | 'session';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

/** Backs the admin view. Every method needs the signed-in account to be the admin; the server enforces that. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly accounts = inject(AccountService);

  readonly users = signal<AdminUser[]>([]);
  readonly total = signal(0);
  readonly stats = signal<AdminStats | null>(null);
  readonly query = signal('');
  readonly page = signal(0);
  readonly loading = signal(false);
  readonly error = signal<AdminLoadError | null>(null);

  readonly pageSize = PAGE_SIZE;
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  /** Only the latest list request may write its result, so a slow earlier one cannot overwrite a newer one. */
  private requestId = 0;

  /** Reloads the stats and the current page. */
  async refresh(): Promise<void> {
    const token = this.accounts.account()?.token;
    if (!token) return;
    const id = ++this.requestId;
    this.loading.set(true);
    try {
      const params = new URLSearchParams({ query: this.query(), page: String(this.page()), size: String(PAGE_SIZE) });
      const [stats, page] = await Promise.all([
        api<AdminStats>('/api/admin/stats', { token }),
        api<UserPage>(`/api/admin/users?${params}`, { token }),
      ]);
      if (id !== this.requestId) return;
      this.stats.set(stats);
      this.users.set(page.users);
      this.total.set(page.total);
      this.error.set(null);
    } catch (error) {
      if (id !== this.requestId) return;
      this.error.set(error instanceof ApiError && (error.status === 401 || error.status === 403) ? 'session' : 'network');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  setQuery(query: string): void {
    this.query.set(query);
    this.page.set(0);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.refresh(), SEARCH_DEBOUNCE_MS);
  }

  setPage(page: number): void {
    this.page.set(Math.min(Math.max(page, 0), this.pageCount() - 1));
    void this.refresh();
  }

  /** Rejects with `ApiError`: 400 invalid input, 404 gone, 409 email taken (or the admin's own account). */
  async update(id: number, changes: { email?: string; password?: string }): Promise<void> {
    await api<void>(`/api/admin/users/${id}`, { method: 'PATCH', body: changes, token: this.token() });
    await this.refresh();
  }

  /** Signs the user out on every device. */
  async revokeSessions(id: number): Promise<void> {
    await api<void>(`/api/admin/users/${id}/sessions`, { method: 'DELETE', token: this.token() });
    await this.refresh();
  }

  /** Deletes the account and everything synced under it. */
  async remove(id: number): Promise<void> {
    await api<void>(`/api/admin/users/${id}`, { method: 'DELETE', token: this.token() });
    // Deleting the last row of a page would otherwise leave the view on an empty page.
    if (this.users().length === 1 && this.page() > 0) this.page.update((page) => page - 1);
    await this.refresh();
  }

  private token(): string {
    return this.accounts.account()?.token ?? '';
  }
}
