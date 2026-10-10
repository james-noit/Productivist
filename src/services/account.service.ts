import { Injectable, effect, signal } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { API_ENABLED, ApiError, api } from '../core/api';

export interface Account {
  email: string;
  token: string;
}

/** Optional email + password account. The app is fully usable signed out; signing in only turns on sync. */
@Injectable({ providedIn: 'root' })
export class AccountService {
  readonly enabled = API_ENABLED;
  readonly account = localStorageSignal<Account | null>('productivist.account', null);
  /**
   * Whether the signed-in account is the backend's admin. Asked of the server (the role is its decision, not the
   * client's), so it is false until the answer arrives and again as soon as the account changes.
   */
  readonly isAdmin = signal(false);

  constructor() {
    effect(() => {
      const token = this.account()?.token;
      this.isAdmin.set(false);
      if (!this.enabled || !token) return;
      void this.probeAdmin(token);
    });
  }

  private async probeAdmin(token: string): Promise<void> {
    try {
      await api('/api/admin/me', { token });
      // The account may have changed while the request was in flight.
      if (this.account()?.token === token) this.isAdmin.set(true);
    } catch (error) {
      // 403 is the normal answer for everyone but the admin; network failures just leave the admin UI hidden.
      if (!(error instanceof ApiError)) console.debug('Admin check failed', error);
    }
  }

  /** Rejects with `ApiError`: 400 invalid input, 401 wrong email or password. */
  login(email: string, password: string): Promise<void> {
    return this.authenticate('/api/auth/login', email, password);
  }

  /** Rejects with `ApiError`: 400 invalid input, 409 the email already has an account. */
  signup(email: string, password: string): Promise<void> {
    return this.authenticate('/api/auth/signup', email, password);
  }

  private async authenticate(path: string, email: string, password: string): Promise<void> {
    const response = await api<Account>(path, { method: 'POST', body: { email, password } });
    this.account.set({ email: response.email, token: response.token });
  }

  logout(): void {
    this.account.set(null);
  }
}
