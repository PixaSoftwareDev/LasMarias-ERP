'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Barra de pestañas que une todo el módulo de plata (CLAUDE.md §9 UX — finanzas como
// un solo lugar). Cada pestaña es una ruta propia (deep-link + botón atrás), pero la
// barra compartida arriba de cada pantalla hace que se sienta UN módulo, no islas.
const TABS: { href: string; label: string }[] = [
  { href: '/finanzas', label: 'Resumen' },
  { href: '/cuentas', label: 'Cobranzas' },
  { href: '/pagos-tambos', label: 'Pagos a tambos' },
  { href: '/cuentas-pagar', label: 'Cuentas por pagar' },
  { href: '/caja', label: 'Caja y bancos' },
  { href: '/cheques', label: 'Cheques' },
];

export function FinanceTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de Finanzas" className="flex flex-wrap gap-2 overflow-x-auto border-b border-border-subtle">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-touch items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-foreground-muted hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
