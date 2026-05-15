// Cliente HTTP minimalista para la API. Inyecta el access token y maneja refresh.
// Lee el token desde localStorage; en SSR pasa sin token (las pantallas privadas
// siempre se renderizan client-side detrás del AuthGuard).

import type { AuthTokens } from '@lasmarias/shared-schemas';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const ACCESS_KEY = 'lm.accessToken';
const REFRESH_KEY = 'lm.refreshToken';

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  errors?: Record<string, string[]>;
  path?: string;
}

export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) {
    super(body.message);
  }
}

export const authStorage = {
  getAccess: () => (typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY)),
  getRefresh: () => (typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY)),
  set: (tokens: AuthTokens) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },
  clear: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

async function rawFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  if (!headers.has('Content-Type') && opts.body) headers.set('Content-Type', 'application/json');
  if (!opts.skipAuth) {
    const t = authStorage.getAccess();
    if (t) headers.set('Authorization', `Bearer ${t}`);
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody);
  return data as T;
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = authStorage.getRefresh();
  if (!refreshToken) return false;
  refreshInFlight = (async () => {
    try {
      const tokens = await rawFetch<AuthTokens>('/api/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        skipAuth: true,
      });
      authStorage.set(tokens);
      return true;
    } catch {
      authStorage.clear();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await rawFetch<T>(path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !opts.skipAuth) {
      const refreshed = await tryRefresh();
      if (refreshed) return rawFetch<T>(path, opts);
      // Si el refresh falla, dejamos que la pantalla se ocupe del 401 (redirect a login).
    }
    throw err;
  }
}
