import { environment } from '../environments/environment';
import { ForgeError, type ForgeConnection, type TransportId } from '../types/forge';

/**
 * How a request reaches a forge. Every adapter call goes through `transportFor(connection)`, so the transports are
 * interchangeable: `direct` (plain `fetch`, subject to the forge's CORS settings), `extension` (Thunderbird: once the add-on
 * holds a host permission for the server, `fetch` from the extension page is exempt from CORS, so it is `fetch` too),
 * `native` (the mobile apps' HTTP plugin, loaded lazily from `core/native/`) and `relay` (the Productivist backend
 * fetches it for a signed-in user: see `backend/README.md`). A connection starts on `direct`; when that fails with a CORS
 * error the UI offers the fallbacks that exist here (`availableFallbacks`) and remembers the pick on the connection.
 * Read-only for now: GET only (write-back would add PATCH/POST for issue paths).
 */

export interface TransportRequest {
  url: string;
  method: 'GET';
  headers: Record<string, string>;
  signal: AbortSignal;
}

/** The part of a `Response` the adapters read. */
export interface TransportResponse {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null; has(name: string): boolean };
  json(): Promise<unknown>;
}

export type ForgeTransport = (request: TransportRequest) => Promise<TransportResponse>;

// ---- Availability ---------------------------------------------------------------------------------------------

interface BrowserApi {
  permissions?: { request(p: { origins: string[] }): Promise<boolean> };
}
/** The WebExtension API object: defined on Thunderbird's extension pages, not on web pages. */
declare const browser: BrowserApi | undefined;

const extensionApi = (): BrowserApi | undefined => (typeof browser !== 'undefined' ? browser : undefined);
const hasExtensionPermissions = (): boolean => typeof extensionApi()?.permissions?.request === 'function';
const isNative = (): boolean => !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** Where the relay's session token comes from; set by `ForgeConnectionsService` (a lazy service that can see the account). */
let relayToken: () => string | null = () => null;
export function configureRelay(tokenOf: () => string | null): void {
  relayToken = tokenOf;
}

/** The relay needs sync to exist at all and a signed-in user. */
export const relayAvailable = (): boolean => environment.syncEnabled && relayToken() !== null;

/** The fallbacks this device can offer after a CORS failure, best first: the ones that need no server come before the relay. */
export function availableFallbacks(): TransportId[] {
  const list: TransportId[] = [];
  if (hasExtensionPermissions()) list.push('extension');
  if (isNative()) list.push('native');
  if (relayAvailable()) list.push('relay');
  return list;
}

/**
 * Asks Thunderbird for permission to contact the forge's origin. Must be called from the click handler that starts it
 * (the browser only grants it inside a user gesture), so it asks before it awaits anything.
 */
export async function requestHostPermission(baseUrl: string): Promise<boolean> {
  const request = extensionApi()?.permissions?.request;
  if (!request) return false;
  try {
    return await extensionApi()!.permissions!.request({ origins: [new URL(baseUrl).origin + '/*'] });
  } catch {
    return false;
  }
}

// ---- Transports -----------------------------------------------------------------------------------------------

const direct: ForgeTransport = (r) => fetch(r.url, { headers: r.headers, signal: r.signal });

/** The Productivist backend makes the request; its own failures (refused target, busy, session gone) all read as `relay`. */
const relay: ForgeTransport = async (r) => {
  const token = relayToken();
  if (!token) throw new ForgeError('relay');
  let response: Response;
  try {
    response = await fetch(`${environment.apiUrl}/api/forge/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url: r.url, method: r.method, headers: r.headers }),
      signal: r.signal,
    });
  } catch {
    throw new ForgeError(r.signal.aborted || navigator.onLine === false ? 'network' : 'relay');
  }
  if (!response.ok) throw new ForgeError('relay');
  const answer = (await response.json()) as { status: number; headers?: Record<string, string>; body?: string };
  const headers = new Headers(answer.headers ?? {});
  return {
    status: answer.status,
    ok: answer.status >= 200 && answer.status < 300,
    headers,
    json: async () => JSON.parse(answer.body ?? ''),
  };
};

/** The transport a connection uses. `native` is a dynamic import, so Capacitor code only loads on the mobile apps. */
export function transportFor(connection: Pick<ForgeConnection, 'transport'>): ForgeTransport {
  switch (connection.transport) {
    case 'relay':
      return relay;
    case 'native':
      return async (r) => {
        if (!isNative()) throw new ForgeError('cors');
        const { nativeTransport } = await import('../core/native/native-http');
        return nativeTransport(r);
      };
    default:
      // 'direct' and 'extension' are both `fetch`; the extension only differs by the permission it was granted.
      return direct;
  }
}
