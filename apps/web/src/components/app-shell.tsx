'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Milk } from 'lucide-react';
import type { User } from '@lasmarias/shared-schemas';
import { visibleFor } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

// CLAUDE.md §5.3:
// - Desktop (md+): sidebar fija con todos los módulos visibles según rol.
// - Mobile (<md): bottom navigation con los 4-5 ítems más relevantes según rol/contexto.

interface Props {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}

export function AppShell({ user, onLogout, children }: Props) {
  const items = visibleFor(user.role);
  const pathname = usePathname();
  const router = useRouter();

  // Selecciona los 5 ítems para bottom-nav: inicio + los más relevantes del rol
  const bottomItems = items.slice(0, 5);

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Sidebar — solo desktop */}
      <aside className="hidden border-r border-border-subtle bg-surface-elevated md:flex md:w-64 md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-border-subtle px-6">
          <Milk className="h-6 w-6 text-primary-600" aria-hidden="true" />
          <span className="text-base font-semibold">Las Marías</span>
        </div>
        <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-foreground-muted hover:bg-surface-subtle hover:text-foreground',
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-border-subtle p-3">
          <div className="mb-2 px-2">
            <p className="text-sm font-medium text-foreground">{user.fullName}</p>
            <p className="text-xs text-foreground-muted capitalize">{user.role}</p>
          </div>
          <Button variant="ghost" size="sm" block onClick={onLogout}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Cerrar sesión</span>
          </Button>
        </div>
      </aside>

      {/* Header mobile */}
      <header className="flex h-14 items-center justify-between border-b border-border-subtle bg-surface-elevated px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Milk className="h-5 w-5 text-primary-600" aria-hidden="true" />
          <span className="text-sm font-semibold">Las Marías</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-touch min-w-touch items-center justify-center text-foreground-muted"
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">{children}</main>

      {/* Bottom navigation — solo mobile */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface-elevated md:hidden"
      >
        <ul className="flex">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="flex-1">
                <button
                  type="button"
                  onClick={() => router.push(item.href)}
                  className={cn(
                    'flex min-h-touch w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs',
                    active ? 'text-primary-700' : 'text-foreground-muted',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span className="truncate text-[11px]">{item.label.split(' ')[0]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
