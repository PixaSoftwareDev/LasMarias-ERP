'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Factory, Milk, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api-client';

interface DashboardData {
  milkReceivedTodayLiters: number;
  receptionsToday: number;
  productionsClosedToday: number;
  ordersTakenToday: number;
  openInvoicesCount: number;
  openInvoicesAmount: number;
  stockAlerts: number;
}

// Tonos de los chips de ícono — paleta de marca (esmeralda + azul) + semánticos.
// Clases literales para que Tailwind no las purgue.
const TONES = {
  emerald: 'bg-primary-50 text-primary-700',
  navy: 'bg-secondary-50 text-secondary-700',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
} as const;
type Tone = keyof typeof TONES;

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/api/reports/dashboard'),
    refetchInterval: 60_000,
  });

  const kpis: { label: string; value: string | number; unit: string; icon: typeof Milk; tone: Tone }[] = [
    { label: 'Leche recibida hoy', value: data ? data.milkReceivedTodayLiters.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '—', unit: 'litros', icon: Milk, tone: 'emerald' },
    { label: 'Recepciones del día', value: data ? data.receptionsToday : '—', unit: '', icon: Milk, tone: 'navy' },
    { label: 'Producciones cerradas', value: data ? data.productionsClosedToday : '—', unit: 'hoy', icon: Factory, tone: 'emerald' },
    { label: 'Pedidos tomados', value: data ? data.ordersTakenToday : '—', unit: 'hoy', icon: ShoppingCart, tone: 'navy' },
    { label: 'A cobrar', value: data ? `$${data.openInvoicesAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—', unit: `(${data?.openInvoicesCount ?? 0} comprobantes)`, icon: Wallet, tone: 'amber' },
    { label: 'Alertas de stock', value: data ? data.stockAlerts : '—', unit: '', icon: AlertTriangle, tone: data && data.stockAlerts > 0 ? 'red' : 'emerald' },
  ];

  const shortcuts = [
    { href: '/recepciones/nueva', label: 'Nueva recepción', icon: Milk },
    { href: '/produccion', label: 'Producción', icon: Factory },
    { href: '/ventas/nuevo', label: 'Nuevo pedido', icon: ShoppingCart },
    { href: '/comprobantes', label: 'Comprobantes', icon: Receipt },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-6">
      <PageHeader title="Inicio" description="Vista general de la planta hoy." />

      <section aria-label="Indicadores" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${TONES[k.tone]}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground-muted">{k.label}</p>
              {isLoading ? (
                <span className="mt-2 inline-block h-8 w-24 animate-pulse rounded bg-surface-subtle" />
              ) : (
                <p className="mt-1 font-display text-3xl font-bold tracking-tight text-foreground">
                  {k.value}
                  {k.unit && <span className="ml-1.5 text-sm font-medium text-foreground-subtle">{k.unit}</span>}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section aria-label="Accesos rápidos">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground-muted">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {shortcuts.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated p-4 shadow-sm transition-all hover:border-primary-300 hover:shadow-md"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 transition-colors group-hover:bg-primary-600 group-hover:text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="text-sm font-medium text-foreground">{s.label}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
