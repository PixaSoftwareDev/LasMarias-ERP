'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, UserCog, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { User } from '@lasmarias/shared-schemas';
import { groupedFor, mobileNavFor, type NavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';

// CLAUDE.md §5.3:
// - Desktop (md+): sidebar fija, colapsable a solo íconos (recuerda la preferencia).
// - Mobile (<md): bottom navigation con los ítems de uso diario.

interface Props {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
}

const COLLAPSE_KEY = 'lm.sidebarCollapsed';

export function AppShell({ user, onLogout, children }: Props) {
  const groups = groupedFor(user.role);
  const pathname = usePathname();
  const router = useRouter();

  // Colapsado a solo íconos. Persistente. Se lee al montar (el layout solo renderiza
  // el shell una vez hidratado, así que no hay mismatch SSR).
  const [collapsed, setCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem(COLLAPSE_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Bottom-nav mobile: los de uso diario (planta + despacho).
  const bottomItems = mobileNavFor(user.role);

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          title={collapsed ? item.label : undefined}
          aria-label={item.label}
          className={cn(
            'flex items-center rounded-lg text-sm font-medium transition-colors',
            collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2',
            active
              ? 'bg-primary-600 text-white shadow-sm'
              : 'text-secondary-100 hover:bg-white/10 hover:text-white',
          )}
        >
          <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
      </li>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Sidebar — solo desktop. Oscura (azul marino de marca) con activo en verde. */}
      <aside
        className={cn(
          // Fija: queda anclada al viewport mientras el contenido scrollea (UX estándar).
          'hidden bg-gradient-to-b from-secondary-800 to-secondary-900 transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-screen md:flex-col',
          collapsed ? 'md:w-[4.75rem]' : 'md:w-64',
        )}
      >
        {/* Encabezado: marca + botón colapsar/expandir */}
        <div
          className={cn(
            'flex h-16 items-center border-b border-white/10',
            collapsed ? 'justify-center px-2' : 'justify-between px-4',
          )}
        >
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo-iso-white.png"
                alt=""
                width={500}
                height={290}
                className="h-8 w-auto"
                aria-hidden="true"
              />
              <div className="flex flex-col leading-none">
                <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-primary-300">Lácteos</span>
                <span className="mt-1 font-display text-lg font-semibold tracking-tight text-white">Las Marías</span>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-secondary-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" aria-hidden="true" /> : <PanelLeftClose className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>

        <nav aria-label="Navegación principal" className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-4">
          {groups.map((group, i) => (
            <div key={group.area || 'inicio'} className={i > 0 ? 'mt-4' : undefined}>
              {/* Encabezado de área. Colapsado: una línea divisoria en vez del texto. */}
              {group.area &&
                (collapsed ? (
                  <div className="mx-2 mb-1 border-t border-white/10" aria-hidden="true" />
                ) : (
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-secondary-300">
                    {group.area}
                  </p>
                ))}
              <ul className="space-y-1">{group.items.map(renderItem)}</ul>
            </div>
          ))}
        </nav>

        {/* Footer: cuenta + cerrar sesión */}
        <div className="border-t border-white/10 p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-1.5">
              <Link
                href="/mi-cuenta"
                title={`${user.fullName} · Mi cuenta`}
                aria-label="Mi cuenta"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                {user.fullName.charAt(0).toUpperCase()}
              </Link>
              <button
                type="button"
                onClick={onLogout}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-secondary-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/mi-cuenta"
                title="Mi cuenta"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-white/10"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                  {user.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
                  <p className="text-xs text-secondary-200">Mi cuenta</p>
                </div>
              </Link>
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
          )}
        </div>
      </aside>

      {/* Header mobile */}
      <header className="no-print flex h-14 items-center justify-between border-b border-border-subtle bg-surface-elevated px-4 md:hidden">
        <div className="flex items-center gap-2">
          <Image
            src="/logo-iso-emerald.png"
            alt=""
            width={500}
            height={290}
            className="h-7 w-auto"
            aria-hidden="true"
          />
          <div className="flex flex-col leading-none">
            <span className="text-[9px] font-medium uppercase tracking-[0.25em] text-primary-700">Lácteos</span>
            <span className="mt-0.5 font-display text-base font-semibold tracking-tight text-foreground">Las Marías</span>
          </div>
        </div>
        <div className="flex items-center">
          <Link
            href="/mi-cuenta"
            className="flex min-h-touch min-w-touch items-center justify-center text-foreground-muted"
            aria-label="Mi cuenta"
            title="Mi cuenta"
          >
            <UserCog className="h-5 w-5" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-touch min-w-touch items-center justify-center text-foreground-muted"
            aria-label="Cerrar sesión"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Contenido principal — contenedor de ancho máximo ÚNICO para toda la app,
          así ninguna pantalla se estira de más en monitores anchos y todas quedan
          consistentes. Las páginas internas ya no definen su propio max-w/padding. */}
      <main className="flex-1 overflow-x-hidden pb-20 md:pb-0">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">{children}</div>
      </main>

      {/* Bottom navigation — solo mobile */}
      <nav
        aria-label="Navegación principal"
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface-elevated md:hidden"
      >
        <ul className="flex">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
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
                  <span className="truncate text-[11px]">{item.short ?? item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
