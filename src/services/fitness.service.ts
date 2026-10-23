import { Injectable, inject } from '@angular/core';
import { ApiError, api } from '../core/api';
import { AccountService } from './account.service';

/** What `GET /api/fitness/draft` returns: the shared draft of the Sportask catalog overlay (docs/sportask/DIRECTOR.md). */
export interface DraftResponse {
  document: unknown;
  revision: number;
  baseVersion: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface VersionSummary {
  version: number;
  note: string;
  kind: 'publish' | 'rollback';
  rollbackOf: number | null;
  author: string;
  publishedAt: string;
  size: number;
}

export interface VersionDocument extends Omit<VersionSummary, 'size'> {
  document: unknown;
}

export interface PublishedResponse {
  version: number;
  publishedAt: string | null;
  document: unknown;
}

/**
 * The Fitness director's API client. Every call needs the signed-in account to be a director (the server enforces it; 403 otherwise).
 * Rejects with `ApiError`: 409 the draft changed under you (reload), 400/413 a document the server refuses, 422 nothing changed
 * since the published version. Injected only by the lazy view.
 */
@Injectable({ providedIn: 'root' })
export class FitnessService {
  private readonly accounts = inject(AccountService);

  private token(): string {
    const token = this.accounts.account()?.token;
    if (!token) throw new ApiError(401);
    return token;
  }

  draft(): Promise<DraftResponse> {
    return api<DraftResponse>('/api/fitness/draft', { token: this.token() });
  }

  saveDraft(document: unknown, expectedRevision: number): Promise<{ revision: number; updatedAt: string }> {
    return api('/api/fitness/draft', { method: 'PUT', body: { document, expectedRevision }, token: this.token() });
  }

  publish(note: string, expectedRevision: number, rollbackOf: number | null): Promise<PublishedResponse> {
    return api('/api/fitness/publish', { method: 'POST', body: { note, expectedRevision, rollbackOf }, token: this.token() });
  }

  versions(): Promise<VersionSummary[]> {
    return api('/api/fitness/versions', { token: this.token() });
  }

  version(version: number): Promise<VersionDocument> {
    return api(`/api/fitness/versions/${version}`, { token: this.token() });
  }

  restore(version: number, expectedRevision: number): Promise<{ revision: number; updatedAt: string }> {
    return api(`/api/fitness/versions/${version}/restore`, { method: 'POST', body: { expectedRevision }, token: this.token() });
  }

  /** The published head, as every client reads it (public, no token needed). */
  published(): Promise<PublishedResponse> {
    return api('/api/sport-catalog');
  }
}
