'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Factory, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { productionApi } from '@/features/api';
import { formatDateTime } from '@/lib/utils';
import type { ProductionOrder } from '@lasmarias/shared-schemas';

function statusBadge(s: ProductionOrder['status']): { variant: Status; label: string } {
  switch (s) {
    case 'open': return { variant: 'info', label: 'Abierta' };
    case 'in_progress': return { variant: 'info', label: 'En curso' };
    case 'closed': return { variant: 'success', label: 'Cerrada' };
    case 'cancelled': return { variant: 'neutral', label: 'Cancelada' };
  }
}

export default function ProductionPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ['production-orders'], queryFn: () => productionApi.list() });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Producción"
        description="Órdenes de producción. Cerrar una orden es definitivo (modificaciones requieren rol Gerente)."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Producción' }]}
        action={<Button asChild><Link href="/produccion/nueva"><Plus className="h-4 w-4" /> Abrir orden</Link></Button>}
      />

      {isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : data.length === 0 ? (
        <EmptyState icon={Factory} title="Todavía no hay órdenes de producción" description="Cuando abras la primera orden, va a aparecer acá." action={<Button asChild><Link href="/produccion/nueva">Abrir primera orden</Link></Button>} />
      ) : (
        <DataTable
          data={data}
          getKey={(o) => o.id}
          columns={[
            { key: 'code', header: 'Código', render: (o) => <span className="font-mono text-xs">{o.code}</span>, primary: true },
            { key: 'recipe', header: 'Receta', render: (o) => o.recipeName, secondary: true },
            { key: 'started', header: 'Inicio', render: (o) => formatDateTime(o.startedAt) },
            { key: 'milk', header: 'Litros', render: (o) => o.totalMilkLiters.toLocaleString('es-AR'), align: 'right' },
            { key: 'output', header: 'Producido', render: (o) => o.totalPrincipalKg ? `${o.totalPrincipalKg.toFixed(1)} kg` : '—', align: 'right' },
            { key: 'cost', header: 'Costo/kg', render: (o) => o.unitCost ? `$${o.unitCost.toFixed(2)}` : '—', align: 'right' },
            { key: 'status', header: 'Estado', render: (o) => { const s = statusBadge(o.status); return <StatusBadge status={s.variant}>{s.label}</StatusBadge>; } },
          ]}
        />
      )}
    </div>
  );
}
