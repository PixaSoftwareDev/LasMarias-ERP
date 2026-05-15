'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Factory, Milk, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/api/reports/dashboard'),
    refetchInterval: 60_000,
  });

  const kpis = [
    { label: 'Leche recibida hoy', value: data ? data.milkReceivedTodayLiters.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '—', unit: 'litros', icon: Milk, accent: 'text-primary-600' },
    { label: 'Recepciones del día', value: data ? data.receptionsToday : '—', unit: '', icon: Milk, accent: 'text-foreground-muted' },
    { label: 'Producciones cerradas', value: data ? data.productionsClosedToday : '—', unit: 'hoy', icon: Factory, accent: 'text-foreground-muted' },
    { label: 'Pedidos tomados', value: data ? data.ordersTakenToday : '—', unit: 'hoy', icon: ShoppingCart, accent: 'text-foreground-muted' },
    { label: 'A cobrar', value: data ? `$${data.openInvoicesAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—', unit: `(${data?.openInvoicesCount ?? 0} comprobantes)`, icon: Wallet, accent: data && data.openInvoicesAmount > 0 ? 'text-warning' : 'text-foreground-muted' },
    { label: 'Alertas de stock', value: data ? data.stockAlerts : '—', unit: '', icon: AlertTriangle, accent: data && data.stockAlerts > 0 ? 'text-danger' : 'text-success' },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader title="Inicio" description="Vista general de la planta hoy." />

      <section aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-foreground-muted">{k.label}</CardTitle>
                <Icon className={`h-5 w-5 ${k.accent}`} aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {isLoading ? <span className="inline-block h-8 w-24 animate-pulse rounded bg-surface-subtle" /> : k.value}
                  {k.unit && <span className="ml-1 text-base font-normal text-foreground-muted">{k.unit}</span>}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Accesos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { href: '/recepciones/nueva', label: 'Nueva recepción', icon: Milk },
            { href: '/produccion', label: 'Producción', icon: Factory },
            { href: '/ventas/nuevo', label: 'Nuevo pedido', icon: ShoppingCart },
            { href: '/comprobantes', label: 'Comprobantes', icon: Receipt },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.href}
                href={s.href}
                className="flex min-h-touch flex-col items-center justify-center gap-2 rounded-md border border-border-subtle bg-surface-elevated p-4 text-center text-sm hover:bg-surface-subtle"
              >
                <Icon className="h-5 w-5 text-primary-600" aria-hidden="true" />
                <span>{s.label}</span>
              </a>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
