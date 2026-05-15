'use client';

import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { inventoryApi } from '@/features/api';
import { formatDateTime } from '@/lib/utils';
import type { StockSummary } from '@lasmarias/shared-schemas';

function alertBadge(level?: StockSummary['alertLevel']): { variant: Status; label: string } {
  switch (level) {
    case 'critical': return { variant: 'danger', label: 'Vencido' };
    case 'expiring': return { variant: 'warning', label: 'Por vencer' };
    case 'low': return { variant: 'warning', label: 'Stock bajo' };
    default: return { variant: 'success', label: 'OK' };
  }
}

export default function InventoryPage() {
  const stockQuery = useQuery({ queryKey: ['stock'], queryFn: () => inventoryApi.stock() });
  const movementsQuery = useQuery({ queryKey: ['inv-movements'], queryFn: () => inventoryApi.movements() });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Inventario"
        description="Stock por producto con FEFO y alertas de vencimiento."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Inventario' }]}
      />

      <section>
        <h2 className="mb-3 text-xl font-semibold">Stock actual</h2>
        {stockQuery.isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : stockQuery.data?.length === 0 ? (
          <EmptyState icon={Package} title="Sin stock cargado" description="A medida que se cierren órdenes de producción y se reciban compras, el stock aparece acá." />
        ) : (
          <DataTable
            data={stockQuery.data ?? []}
            getKey={(s) => s.productId}
            columns={[
              { key: 'product', header: 'Producto', render: (s) => s.productName, primary: true },
              { key: 'sku', header: 'SKU', render: (s) => <span className="font-mono text-xs">{s.sku}</span>, secondary: true },
              { key: 'qty', header: 'Cantidad', render: (s) => `${s.totalQuantity.toLocaleString('es-AR', { maximumFractionDigits: 2 })} ${s.unit}`, align: 'right' },
              { key: 'batches', header: 'Lotes', render: (s) => s.batchCount, align: 'right' },
              { key: 'expiration', header: 'Próx. vto.', render: (s) => s.nearestExpiration ? new Date(s.nearestExpiration).toLocaleDateString('es-AR') : '—' },
              { key: 'alert', header: 'Estado', render: (s) => { const b = alertBadge(s.alertLevel); return <StatusBadge status={b.variant}>{b.label}</StatusBadge>; }},
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Últimos movimientos</h2>
        {movementsQuery.isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : (
          <DataTable
            data={movementsQuery.data?.slice(0, 50) ?? []}
            getKey={(m) => m.id}
            emptyText="Sin movimientos registrados."
            columns={[
              { key: 'when', header: 'Fecha', render: (m) => formatDateTime(m.createdAt), secondary: true },
              { key: 'batch', header: 'Lote', render: (m) => <span className="font-mono text-xs">{m.batchCode || '—'}</span>, primary: true },
              { key: 'product', header: 'Producto', render: (m) => m.productName || '—' },
              { key: 'type', header: 'Movimiento', render: (m) => (
                <StatusBadge status={m.type === 'in' ? 'success' : m.type === 'out' ? 'info' : 'warning'}>
                  {m.type === 'in' ? 'Entrada' : m.type === 'out' ? 'Salida' : m.type === 'adjustment' ? 'Ajuste' : 'Transferencia'}
                </StatusBadge>
              )},
              { key: 'qty', header: 'Cantidad', render: (m) => `${m.quantity} ${m.unit}`, align: 'right' },
              { key: 'reason', header: 'Motivo', render: (m) => m.reason },
            ]}
          />
        )}
      </section>
    </div>
  );
}
