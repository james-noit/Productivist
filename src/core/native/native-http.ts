import { CapacitorHttp } from '@capacitor/core';
import type { ForgeTransport } from '../../lib/forge-transport';

/**
 * The mobile apps' way around CORS for the Git forge import: `CapacitorHttp` makes the request from native code, so the
 * WebView's cross-origin rules do not apply. Used per call through `lib/forge-transport.ts` (a dynamic `import()` behind
 * `window.Capacitor?.isNativePlatform?.()`); never enabled globally in `capacitor.config.ts`, which would patch every
 * `fetch`, the sync included.
 */
export const nativeTransport: ForgeTransport = async (request) => {
  const response = await CapacitorHttp.get({
    url: request.url,
    headers: request.headers,
    responseType: 'text',
    connectTimeout: 15_000,
    readTimeout: 15_000,
  });
  // Header names come back in the server's case; the adapters ask for them case-insensitively.
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers ?? {})) headers.set(name, String(value));
  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    headers,
    json: async () => (typeof response.data === 'string' ? JSON.parse(response.data) : response.data),
  };
};
