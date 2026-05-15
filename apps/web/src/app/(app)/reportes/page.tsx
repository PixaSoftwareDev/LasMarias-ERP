'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api-client';

interface ProductionByProduct {
  productId: string;
  productName: string;
  totalKg: number;
  orderCount: number;
  avgUnitCost: number;
}

interface ExpiringBatch {
  batchId: string;
  code: string;
  productName: string;
  remaining: number;
  expirationDate: string | null;
  daysToExpire: number | null;
}

export default function ReportsPage() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const from = thirtyDaysAgo.toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  const prod = useQuery({
    queryKey: ['report-production', from, to],
    queryFn: () => api<ProductionByProduct[]>(`/api/reports/production-by-product?from=${from}&to=${to}`),
  });
  const expiring = useQuery({
    queryKey: ['report-expiring'],
    queryFn: () => api<ExpiringBatch[]>('/api/reports/expiring-batches'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Reportes"
        description={`Últimos 30 días (${new Date(from).toLocaleDateString('es-AR')} → ${new Date(to).toLocaleDateString('es-AR')}).`}
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Reportes' }]}
      />

      <Card>
        <CardHeader><CardTitle>Producción por producto</CardTitle></CardHeader>
        <CardContent>
          {prod.isLoading ? <div className="h-32 animate-pulse rounded bg-surface-subtle" /> : (
            <DataTable
              data={prod.data ?? []}
              getKey={(r) => r.productId}
              emptyText="Sin producción cerrada en el período."
              columns={[
                { key: 'name', header: 'Producto', render: (r) => r.productName, primary: true },
                { key: 'kg', header: 'Total kg', render: (r) => r.totalKg.toFixed(1), align: 'right' },
                { key: 'orders', header: 'Órdenes', render: (r) => r.orderCount, align: 'right' },
                { key: 'cost', header: 'Costo $/kg promedio', render: (r) => `$${r.avgUnitCost.toFixed(2)}`, align: 'right' },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Lotes próximos a vencer</CardTitle></CardHeader>
        <CardContent>
          {expiring.isLoading ? <div className="h-32 animate-pulse rounded bg-surface-subtle" /> : (
            <DataTable
              data={expiring.data ?? []}
              getKey={(r) => r.batchId}
              emptyText="No hay lotes por vencer en los próximos 14 días."
              columns={[
                { key: 'code', header: 'Lote', render: (r) => <span className="font-mono text-xs">{r.code}</span>, primary: true },
                { key: 'product', header: 'Producto', render: (r) => r.productName, secondary: true },
                { key: 'remaining', header: 'Restante', render: (r) => r.remaining.toFixed(2), align: 'right' },
                { key: 'expiration', header: 'Vence', render: (r) => r.expirationDate ? new Date(r.expirationDate).toLocaleDateString('es-AR') : '—' },
                { key: 'days', header: 'Días', render: (r) => r.daysToExpire, align: 'right' },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
