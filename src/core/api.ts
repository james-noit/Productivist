import { environment } from '../environments/environment';

export const API_ENABLED = environment.syncEnabled;

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** JSON request against the sync backend. Throws `ApiError` for non-2xx; network failures reject as-is. */
export async function api<T>(path: string, options: { method?: 'GET' | 'POST'; body?: unknown; token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const response = await fetch(environment.apiUrl + path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) throw new ApiError(response.status);
  return (await response.json()) as T;
}
