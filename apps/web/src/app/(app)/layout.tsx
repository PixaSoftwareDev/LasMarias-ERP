'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AppShell } from '@/components/app-shell';

// Layout privado: monta el shell con sidebar/bottom-nav. Si el usuario no está
// autenticado redirige a /login. CLAUDE.md §6 — JWT con refresh, sesiones expirables.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, hydrated, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace('/login');
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" aria-hidden="true" />
      </div>
    );
  }

  return (
    <AppShell
      user={user}
      onLogout={async () => {
        await logout();
        router.replace('/login');
      }}
    >
      {children}
    </AppShell>
  );
}
