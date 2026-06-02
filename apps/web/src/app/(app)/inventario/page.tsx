'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Boxes, Package, PackageX, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { inventoryApi } from '@/features/api';
import { formatDateTime } from '@/lib/utils';
import { labelOr, movementReasonLabel, movementTypeLabel } from '@/lib/labels';
import type { StockSummary } from '@lasmarias/shared-schemas';

function alertBadge(level?: StockSummary['alertLevel']): { variant: Status; label: string } {
  switch (level) {
    case 'critical': return { variant: 'danger', label: 'Vencido' };
    case 'expiring': return { variant: 'warning', label: 'Por vencer' };
    case 'low': return { variant: 'warning', label: 'Stock bajo' };
    default: return { variant: 'success', label: 'OK' };
  }
}

const num = (n: number) => n.toLocaleString('es-AR');

// Chip compacto de resumen, alineado al lenguaje visual del Home (§5.3):
// ícono en cuadro con tono semántico + label en mayúsculas chico + número grande.
const CHIP_TONE = {
  primary: 'bg-primary-50 text-primary-700',
  amber: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
} as const;

function SummaryChip({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: keyof typeof CHIP_TONE }) {
  return (
    <div className="flex min-w-[11rem] flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${CHIP_TONE[tone]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">{label}</span>
        <span className="block font-display text-lg font-bold tracking-tight text-foreground">{value}</span>
      </span>
    </div>
  );
}

function ChipSkeleton() {
  return <div className="h-[60px] min-w-[11rem] flex-1 animate-pulse rounded-lg bg-surface-subtle" />;
}

export default function InventoryPage() {
  const stockQuery = useQuery({ queryKey: ['stock'], queryFn: () => inventoryApi.stock() });
  const movementsQuery = useQuery({ queryKey: ['inv-movements'], queryFn: () => inventoryApi.movements() });

  const stock = stockQuery.data;
  const summary = useMemo(() => {
    if (!stock) return null;
    const low = stock.filter((s) => s.alertLevel === 'low').length;
    const expiring = stock.filter((s) => s.alertLevel === 'expiring' || s.alertLevel === 'critical').length;
    return { products: stock.length, low, expiring };
  }, [stock]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventario"
        description="Stock por producto con FEFO y alertas de vencimiento."      />

      {/* Resumen en chips compactos (consistente con el Home). */}
      <section aria-label="Resumen de inventario" className="flex flex-wrap gap-3">
        {stockQuery.isLoading ? (
          Array.from({ length: 3 }, (_, i) => <ChipSkeleton key={i} />)
        ) : summary ? (
          <>
            <SummaryChip icon={Boxes} label="Productos con stock" value={num(summary.products)} tone="primary" />
            <SummaryChip icon={Package} label="Con stock bajo" value={num(summary.low)} tone={summary.low > 0 ? 'amber' : 'primary'} />
            <SummaryChip icon={PackageX} label="Por vencer o vencidos" value={num(summary.expiring)} tone={summary.expiring > 0 ? 'danger' : 'primary'} />
          </>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
          <Boxes className="h-5 w-5 text-primary-700" aria-hidden="true" />
          Stock actual
        </h2>
        {stockQuery.isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : stockQuery.data?.length === 0 ? (
          <EmptyState icon={Package} title="Sin stock cargado" description="A medida que se cierren órdenes de producción y se reciban compras, el stock aparece acá." />
        ) : (
          <DataTable
            data={stockQuery.data ?? []}
            getKey={(s) => s.productId}
            getSearchText={(s) => `${s.productName} ${s.sku}`}
            searchPlaceholder="Buscar producto o SKU…"
            columns={[
              { key: 'product', header: 'Producto', render: (s) => s.productName, primary: true, sortValue: (s) => s.productName },
              { key: 'sku', header: 'SKU', render: (s) => <span className="font-mono text-xs">{s.sku}</span>, secondary: true, sortValue: (s) => s.sku },
              { key: 'qty', header: 'Cantidad', align: 'right', render: (s) => (
                <div className="flex flex-col items-end">
                  <span>{`${s.totalQuantity.toLocaleString('es-AR', { maximumFractionDigits: 2 })} ${s.unit}`}</span>
                  {typeof s.minStock === 'number' && (
                    <span className="text-xs text-foreground-subtle">mín: {s.minStock.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                  )}
                </div>
              )},
              { key: 'warehouses', header: 'Cámara/s', render: (s) => (
                s.warehouses && s.warehouses.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {s.warehouses.map((w) => (
                      <span key={w} className="inline-flex items-center rounded-md bg-surface-subtle px-2 py-0.5 text-xs text-foreground">{w}</span>
                    ))}
                  </span>
                ) : <span className="text-foreground-subtle">—</span>
              )},
              { key: 'batches', header: 'Lotes', render: (s) => s.batchCount, align: 'right' },
              { key: 'expiration', header: 'Próx. vto.', render: (s) => s.nearestExpiration
                ? new Date(s.nearestExpiration).toLocaleDateString('es-AR')
                : <span className="text-foreground-subtle">—</span> },
              { key: 'alert', header: 'Estado', render: (s) => { const b = alertBadge(s.alertLevel); return <StatusBadge status={b.variant}>{b.label}</StatusBadge>; }},
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
          <ArrowLeftRight className="h-5 w-5 text-secondary-700" aria-hidden="true" />
          Últimos movimientos
        </h2>
        {movementsQuery.isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : (
          <DataTable
            data={movementsQuery.data ?? []}
            getKey={(m) => m.id}
            emptyText="Sin movimientos registrados."
            getSearchText={(m) => `${m.batchCode ?? ''} ${m.productName ?? ''}`}
            searchPlaceholder="Buscar por lote o producto…"
            columns={[
              { key: 'when', header: 'Fecha', render: (m) => formatDateTime(m.createdAt), secondary: true, sortValue: (m) => new Date(m.createdAt).getTime() },
              { key: 'batch', header: 'Lote', render: (m) => <span className="font-mono text-xs">{m.batchCode || '—'}</span>, primary: true, sortValue: (m) => m.batchCode ?? '' },
              { key: 'product', header: 'Producto', render: (m) => m.productName || '—', sortValue: (m) => m.productName ?? '' },
              { key: 'type', header: 'Movimiento', render: (m) => (
                <StatusBadge status={m.type === 'in' ? 'success' : m.type === 'out' ? 'info' : 'warning'}>
                  {labelOr(movementTypeLabel, m.type)}
                </StatusBadge>
              )},
              { key: 'qty', header: 'Cantidad', render: (m) => `${m.quantity} ${m.unit}`, align: 'right', sortValue: (m) => Number(m.quantity) },
              { key: 'reason', header: 'Motivo', render: (m) => labelOr(movementReasonLabel, m.reason) },
            ]}
          />
        )}
      </section>
    </div>
  );
}
