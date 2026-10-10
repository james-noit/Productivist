import { Injectable } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { API_ENABLED, api } from '../core/api';

export interface Account {
  email: string;
  token: string;
}

/** Optional email + password account. The app is fully usable signed out; signing in only turns on sync. */
@Injectable({ providedIn: 'root' })
export class AccountService {
  readonly enabled = API_ENABLED;
  readonly account = localStorageSignal<Account | null>('productivist.account', null);

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
