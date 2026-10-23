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
  /** Whether the signed-in account may author the Sportask catalog (a director from `FITNESS_DIRECTOR_EMAILS`, or the admin); asked of the server like `isAdmin`. */
  readonly isFitnessDirector = signal(false);

  constructor() {
    effect(() => {
      const token = this.account()?.token;
      this.isAdmin.set(false);
      this.isFitnessDirector.set(false);
      if (!this.enabled || !token) return;
      void this.probe('/api/admin/me', token, this.isAdmin);
      void this.probe('/api/fitness/me', token, this.isFitnessDirector);
    });
  }

  private async probe(path: string, token: string, flag: { set(value: boolean): void }): Promise<void> {
    try {
      await api(path, { token });
      // The account may have changed while the request was in flight.
      if (this.account()?.token === token) flag.set(true);
    } catch (error) {
      // 403 is the normal answer for everyone without the role; network failures just leave that UI hidden.
      if (!(error instanceof ApiError)) console.debug('Role check failed', path, error);
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

  /**
   * Erases the account and everything synced under it on the server, then signs out (only on success). Local data
   * stays on this device: the app is local-first, so the stores are deliberately not wiped. Rejects with `ApiError`:
   * 403 wrong password, 409 the admin account cannot be deleted, 401 the session had expired; network failures reject
   * as-is.
   */
  async deleteAccount(password: string): Promise<void> {
    const token = this.account()?.token;
    if (!token) return;
    await api<void>('/api/account', { method: 'DELETE', body: { password }, token });
    this.logout();
  }

  logout(): void {
    this.account.set(null);
  }
}
