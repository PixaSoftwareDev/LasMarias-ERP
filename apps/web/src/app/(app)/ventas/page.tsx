'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Plus } from 'lucide-react';
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
    case 'taken': return { variant: 'info', label: 'Tomado' };
    case 'confirmed': return { variant: 'info', label: 'Confirmado' };
    case 'prepared': return { variant: 'warning', label: 'Preparado' };
    case 'loaded': return { variant: 'warning', label: 'Cargado' };
    case 'in_delivery': return { variant: 'warning', label: 'En reparto' };
    case 'delivered': return { variant: 'success', label: 'Entregado' };
    case 'cancelled': return { variant: 'neutral', label: 'Cancelado' };
  }
}

export default function SalesPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ['sales-orders'], queryFn: () => salesApi.listOrders() });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Ventas y pedidos"
        description="Pedidos tomados con fecha de reparto."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Ventas' }]}
        action={<Button asChild><Link href="/ventas/nuevo"><Plus className="h-4 w-4" /> Nuevo pedido</Link></Button>}
      />

      {isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : data.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Todavía no hay pedidos" action={<Button asChild><Link href="/ventas/nuevo">Tomar primer pedido</Link></Button>} />
      ) : (
        <DataTable
          data={data}
          getKey={(o) => o.id}
          columns={[
            { key: 'code', header: 'Código', render: (o) => <span className="font-mono text-xs">{o.code}</span>, secondary: true },
            { key: 'client', header: 'Cliente', render: (o) => o.clientName, primary: true },
            { key: 'delivery', header: 'Reparto', render: (o) => new Date(o.deliveryDate).toLocaleDateString('es-AR') },
            { key: 'items', header: 'Items', render: (o) => o.lines.length, align: 'right' },
            { key: 'total', header: 'Total', render: (o) => `$${o.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`, align: 'right' },
            { key: 'status', header: 'Estado', render: (o) => { const s = statusBadge(o.status); return <StatusBadge status={s.variant}>{s.label}</StatusBadge>; } },
          ]}
        />
      )}
    </div>
  );
}
