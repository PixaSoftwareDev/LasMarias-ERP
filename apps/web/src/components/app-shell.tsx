'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import type { User } from '@lasmarias/shared-schemas';
import { visibleFor } from '@/lib/navigation';
import { cn } from '@/lib/utils';

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
      {/* Sidebar — solo desktop. Oscura (azul marino de marca) con activo en verde. */}
      <aside className="hidden bg-gradient-to-b from-secondary-800 to-secondary-900 md:flex md:w-64 md:flex-col">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <div className="flex flex-col leading-none">
            <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-primary-300">Lácteos</span>
            <span className="mt-1 font-display text-lg font-semibold tracking-tight text-white">Las Marías</span>
          </div>
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
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-secondary-100 hover:bg-white/10 hover:text-white',
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
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
              <p className="text-xs capitalize text-secondary-200">{user.role}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-secondary-200 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* Header mobile */}
      <header className="flex h-14 items-center justify-between border-b border-border-subtle bg-surface-elevated px-4 md:hidden">
        <div className="flex flex-col leading-none">
          <span className="text-[9px] font-medium uppercase tracking-[0.25em] text-primary-700">Lácteos</span>
          <span className="mt-0.5 font-display text-base font-semibold tracking-tight text-foreground">Las Marías</span>
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
