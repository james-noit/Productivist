import { API_ENABLED } from '../../../core/api';
import { environment } from '../../../environments/environment';
import { applyOverlay } from './apply';
import { sanitizeOverlayReport } from './sanitize-overlay';
import type { CatalogOverlay } from './types';
import { validateOverlay } from './validate';
import { appliedOverlayVersion } from './version';

/**
 * Consuming the published catalog overlay (docs/sportask/DIRECTOR.md section 2.4). The cache lives in this device's localStorage
 * (`productivist.sportCatalog`), never in the sync blob and never in an export. With no backend, sync disabled, offline or any
 * failure, nothing changes: the built-in catalog keeps working exactly as before.
 */
const KEY = 'productivist.sportCatalog';
const FETCH_TIMEOUT_MS = 10_000;

interface Cached {
  version: number;
  etag: string;
  document: CatalogOverlay;
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Cached> | null;
    if (!parsed || typeof parsed.version !== 'number' || typeof parsed.etag !== 'string') return null;
    return { version: parsed.version, etag: parsed.etag, document: sanitizeOverlayReport(parsed.document).overlay };
  } catch {
    return null;
  }
}

function writeCache(cache: Cached | null): void {
  try {
    if (cache) localStorage.setItem(KEY, JSON.stringify(cache));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage disabled or full: the overlay is simply fetched again next time.
  }
}

/** A sanitised overlay that is safe to apply, or null (it is then ignored whole: the built-ins stay). */
export function usableOverlay(raw: unknown): CatalogOverlay | null {
  try {
    const { overlay } = sanitizeOverlayReport(raw);
    const errors = validateOverlay(overlay, { deep: false }).filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      console.debug('Sportask catalog overlay ignored:', errors.slice(0, 3).map((e) => `${e.section}/${e.id ?? ''}: ${e.code}`).join(', '));
      return null;
    }
    return overlay;
  } catch (error) {
    // Whatever went wrong, the built-in catalog keeps working.
    console.debug('Sportask catalog overlay ignored:', error);
    return null;
  }
}

let started = false;

/**
 * Applies the cached overlay synchronously (so the first block of this page load already uses it), then revalidates it in the
 * background. Idempotent; called by `loadSportaskTexts` (every lazy Sportask component waits for it) and by `makePending`.
 */
export function ensureOverlay(): void {
  if (started) return;
  started = true;
  const cached = readCache();
  if (cached) {
    const usable = usableOverlay(cached.document);
    if (usable) applyOverlay(usable, cached.version);
    else writeCache(null);
  }
  void refreshOverlay();
}

export type RefreshResult = 'disabled' | 'unchanged' | 'updated' | 'ignored' | 'failed';

/** Asks the backend for a newer published overlay (`If-None-Match`), caches and applies it. Never throws. */
export async function refreshOverlay(): Promise<RefreshResult> {
  if (!API_ENABLED) return 'disabled';
  const cached = readCache();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${environment.apiUrl}/api/sport-catalog`, {
      headers: cached ? { 'If-None-Match': cached.etag } : {},
      cache: 'no-cache',
      signal: controller.signal,
    });
    if (response.status === 304) return 'unchanged';
    if (!response.ok) return 'failed';
    const body = (await response.json()) as { version?: unknown; document?: unknown };
    const version = typeof body.version === 'number' && Number.isInteger(body.version) && body.version >= 0 ? body.version : -1;
    if (version < 0) return 'failed';
    if (version === 0) {
      // Nothing published (or the backend was reset): back to the built-ins.
      if (cached || appliedOverlayVersion() !== 0) {
        writeCache(null);
        applyOverlay(null);
        return 'updated';
      }
      return 'unchanged';
    }
    if (cached && cached.version === version) return 'unchanged';
    const usable = usableOverlay(body.document);
    if (!usable) return 'ignored';
    writeCache({ version, etag: response.headers.get('ETag') ?? `"v${version}"`, document: usable });
    applyOverlay(usable, version);
    return 'updated';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
