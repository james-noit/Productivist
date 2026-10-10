import { Injectable } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { API_ENABLED, api } from '../core/api';

export interface Account {
  email: string;
  token: string;
}

/** Optional email-only account. The app is fully usable signed out; signing in only turns on sync. */
@Injectable({ providedIn: 'root' })
export class AccountService {
  readonly enabled = API_ENABLED;
  readonly account = localStorageSignal<Account | null>('productivist.account', null);

  async login(email: string): Promise<void> {
    const response = await api<Account>('/api/auth/login', { method: 'POST', body: { email } });
    this.account.set({ email: response.email, token: response.token });
  }

  logout(): void {
    this.account.set(null);
  }
}
