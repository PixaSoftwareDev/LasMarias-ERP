'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { salesApi } from '@/features/api';
import type { SalesOrder } from '@lasmarias/shared-schemas';

function statusBadge(s: SalesOrder['status']): { variant: Status; label: string } {
  switch (s) {
    case 'taken':       return { variant: 'info',    label: 'Tomado' };
    case 'confirmed':   return { variant: 'info',    label: 'Confirmado' };
    case 'prepared':    return { variant: 'warning', label: 'Preparado' };
    case 'loaded':      return { variant: 'warning', label: 'Cargado' };
    case 'in_delivery': return { variant: 'warning', label: 'En reparto' };
    case 'delivered':   return { variant: 'success', label: 'Entregado' };
    case 'cancelled':   return { variant: 'neutral', label: 'Cancelado' };
  }
}

const ACTIVE_STATUSES: SalesOrder['status'][] = ['taken', 'confirmed', 'prepared', 'loaded', 'in_delivery'];

type FilterKey = 'active' | 'today' | 'delivered' | 'cancelled' | 'all';

const FILTER_LABELS: Record<FilterKey, string> = {
  active:    'Activos',
  today:     'Reparto hoy',
  delivered: 'Entregados',
  cancelled: 'Cancelados',
  all:       'Todos',
};

export default function SalesPage() {
  const [filter, setFilter] = useState<FilterKey>('active');

  const { data = [], isLoading } = useQuery({
    queryKey: ['sales-orders'],
    queryFn: () => salesApi.listOrders(),
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'active':    return data.filter((o) => ACTIVE_STATUSES.includes(o.status));
      case 'today':     return data.filter((o) => o.deliveryDate?.startsWith(todayStr) && o.status !== 'cancelled');
      case 'delivered': return data.filter((o) => o.status === 'delivered');
      case 'cancelled': return data.filter((o) => o.status === 'cancelled');
      default:          return data;
    }
  }, [data, filter, todayStr]);

  const counts: Record<FilterKey, number> = {
    active:    data.filter((o) => ACTIVE_STATUSES.includes(o.status)).length,
    today:     data.filter((o) => o.deliveryDate?.startsWith(todayStr) && o.status !== 'cancelled').length,
    delivered: data.filter((o) => o.status === 'delivered').length,
    cancelled: data.filter((o) => o.status === 'cancelled').length,
    all:       data.length,
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Ventas y pedidos"
        description="Pedidos tomados con fecha de reparto."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Ventas' }]}
        action={
          <Button asChild>
            <Link href="/ventas/nuevo"><Plus className="h-4 w-4" /> Nuevo pedido</Link>
          </Button>
        }
      />

      {/* Filtro rápido por estado */}
      {!isLoading && data.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
                filter === k
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-elevated border border-border-subtle text-foreground-muted hover:bg-surface-subtle'
              }`}
            >
              {k === 'today' && <Truck className="h-3.5 w-3.5" aria-hidden="true" />}
              {FILTER_LABELS[k]}
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${filter === k ? 'bg-white/20 text-white' : 'bg-surface-subtle text-foreground-muted'}`}>
                {counts[k]}
              </span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <Card className="h-40 animate-pulse bg-surface-subtle" />
      ) : data.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Todavía no hay pedidos"
          action={<Button asChild><Link href="/ventas/nuevo">Tomar primer pedido</Link></Button>}
        />
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-foreground-muted">
          No hay pedidos en esta categoría.
        </Card>
      ) : (
        <DataTable
          data={filtered}
          getKey={(o) => o.id}
          columns={[
            {
              key: 'code',
              header: 'Código',
              render: (o) => <span className="font-mono text-xs">{o.code}</span>,
              secondary: true,
            },
            { key: 'client', header: 'Cliente', render: (o) => o.clientName, primary: true },
            {
              key: 'delivery',
              header: 'Reparto',
              render: (o) =>
                o.deliveryDate
                  ? new Date(o.deliveryDate + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
                  : '—',
            },
            { key: 'items', header: 'Items', render: (o) => o.lines.length, align: 'right' },
            {
              key: 'total',
              header: 'Total',
              render: (o) => `$${o.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`,
              align: 'right',
            },
            {
              key: 'status',
              header: 'Estado',
              render: (o) => {
                const s = statusBadge(o.status);
                return <StatusBadge status={s.variant}>{s.label}</StatusBadge>;
              },
            },
          ]}
        />
      )}
    </div>
  );
}
