import { Injectable, inject } from '@angular/core';
import { localStorageSignal } from '../core/local-storage-signal';
import { configureRelay } from '../lib/forge-transport';
import type { ForgeConnection, ForgeKind } from '../types/forge';
import { AccountService } from './account.service';

/**
 * The Git forge accounts of this device. Holds the personal access tokens, so it is device-local on purpose: not
 * in the sync blob, not in the export file, never sent to the backend. Only injected from lazy components (the
 * Integrations settings, the import dialog, `ForgeImportService`); the full Reset clears it through a dynamic import.
 */
@Injectable({ providedIn: 'root' })
export class ForgeConnectionsService {
  private readonly accounts = inject(AccountService);
  readonly connections = localStorageSignal<ForgeConnection[]>('productivist.forgeConnections', []);

  constructor() {
    // The relay transport signs its requests with the session token; reading it here keeps `lib/forge-transport.ts`
    // free of Angular. Every caller of an adapter has this service injected, so this runs before any request.
    configureRelay(() => this.accounts.account()?.token ?? null);
  }

  add(input: Omit<ForgeConnection, 'id' | 'createdAt'>): ForgeConnection {
    const connection: ForgeConnection = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
    this.connections.update((list) => [...list, connection]);
    return connection;
  }

  update(id: string, patch: Partial<Pick<ForgeConnection, 'token' | 'username' | 'transport'>>): void {
    this.connections.update((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  remove(id: string): void {
    this.connections.update((list) => list.filter((c) => c.id !== id));
  }

  /** The connection this device has for a host (the `host` of an `ExternalRef`), if any. */
  forHost(kind: ForgeKind, host: string): ForgeConnection | undefined {
    return this.connections().find((c) => c.kind === kind && c.baseUrl === host);
  }

  reset(): void {
    this.connections.set([]);
  }
}
