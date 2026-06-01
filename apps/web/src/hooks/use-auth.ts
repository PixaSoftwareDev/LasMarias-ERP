'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User, LoginInput } from '@lasmarias/shared-schemas';
import { ApiError, api, authStorage } from '@/lib/api-client';

interface LoginResponse {
  user: User;
  tokens: { accessToken: string; refreshToken: string; expiresInSeconds: number };
}

const USER_KEY = 'lm.user';

// Hook de autenticación. Mantiene el usuario actual en localStorage para que
// la app sepa quién es sin pegarle de nuevo a /me al recargar.
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) {
        try {
          setUser(JSON.parse(raw) as User);
        } catch {
          localStorage.removeItem(USER_KEY);
        }
      }
      setHydrated(true);
    }
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const res = await api<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: input,
      skipAuth: true,
    });
    authStorage.set(res.tokens);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  }, []);

  // Refresca el usuario local (localStorage + estado) tras editar "Mi cuenta",
  // sin volver a pedir login. Mantiene el sidebar y demás en sincronía.
  const updateLocalUser = useCallback((next: User) => {
    localStorage.setItem(USER_KEY, JSON.stringify(next));
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      // Si el server no responde, igual limpiamos local.
      if (!(err instanceof ApiError)) throw err;
    } finally {
      authStorage.clear();
      localStorage.removeItem(USER_KEY);
      setUser(null);
    }
  }, []);

  return { user, hydrated, login, logout, updateLocalUser, isAuthenticated: !!user };
}
