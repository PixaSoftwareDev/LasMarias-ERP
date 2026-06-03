// Cliente HTTP minimalista para la API. Inyecta el access token y maneja refresh.
// Lee el token desde localStorage; en SSR pasa sin token (las pantallas privadas
// siempre se renderizan client-side detrás del AuthGuard).

import type { AuthTokens } from '@lasmarias/shared-schemas';

// Por defecto usamos rutas RELATIVAS ('') para que las llamadas vayan al mismo
// origen que sirve la web; Next reenvía /api al backend (ver rewrites en next.config).
// Así un único puerto/túnel expone todo y no hay CORS. Se puede forzar una URL
// absoluta con NEXT_PUBLIC_API_URL si hiciera falta apuntar a otro host.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
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
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('lm:auth:expired'));
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
    }
    throw err;
  }
}

// Descarga un archivo del API con el token de sesión y dispara el "Guardar como"
// del navegador. Lo usamos para exportaciones (CSV) que el backend protege con auth.
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const headers = new Headers();
  const token = authStorage.getAccess();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res = await fetch(`${API_URL}${path}`, { headers });
  if (res.status === 401 && (await tryRefresh())) {
    const t = authStorage.getAccess();
    if (t) headers.set('Authorization', `Bearer ${t}`);
    res = await fetch(`${API_URL}${path}`, { headers });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(res.status, body);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const name = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
