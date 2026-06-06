'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Factory, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DateRangeFilter } from '@/components/ui/date-range';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { productionApi } from '@/features/api';
import { formatDateTime, formatMoney } from '@/lib/utils';
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
  const router = useRouter();
  const { data = [], isLoading } = useQuery({ queryKey: ['production-orders'], queryFn: () => productionApi.list() });

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtered = useMemo(
    () =>
      data.filter((o) => {
        const day = o.startedAt.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      }),
    [data, from, to],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Producción"
        description="Órdenes de producción. Una vez que cargás la producción y cerrás la orden, queda firme."        action={<Button asChild><Link href="/produccion/nueva"><Plus className="h-4 w-4" /> Abrir orden</Link></Button>}
      />

      {isLoading ? <TableSkeleton /> : data.length === 0 ? (
        <EmptyState icon={Factory} title="Todavía no hay órdenes de producción" description="Cuando abras la primera orden, va a aparecer acá." action={<Button asChild><Link href="/produccion/nueva">Abrir primera orden</Link></Button>} />
      ) : (
        <DataTable
          data={filtered}
          getKey={(o) => o.id}
          onRowClick={(o) => router.push(`/produccion/${o.id}/cerrar`)}
          getSearchText={(o) => `${o.code} ${o.recipeName}`}
          searchPlaceholder="Buscar por código o receta…"
          filters={
            <DateRangeFilter
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
              onClear={from || to ? () => { setFrom(''); setTo(''); } : undefined}
            />
          }
          columns={[
            { key: 'code', header: 'Código', render: (o) => <span className="font-mono text-xs">{o.code}</span>, primary: true, sortValue: (o) => o.code },
            { key: 'recipe', header: 'Receta', render: (o) => o.recipeName, secondary: true, sortValue: (o) => o.recipeName },
            { key: 'started', header: 'Inicio', render: (o) => formatDateTime(o.startedAt), sortValue: (o) => new Date(o.startedAt).getTime() },
            { key: 'milk', header: 'Litros', render: (o) => o.totalMilkLiters.toLocaleString('es-AR'), align: 'right', sortValue: (o) => Number(o.totalMilkLiters) },
            { key: 'output', header: 'Producido', render: (o) => o.totalPrincipalKg ? `${o.totalPrincipalKg.toFixed(1)} kg` : '—', align: 'right', sortValue: (o) => Number(o.totalPrincipalKg ?? 0) },
            { key: 'cost', header: 'Costo/kg', render: (o) => o.unitCost ? formatMoney(o.unitCost) : '—', align: 'right' },
            { key: 'status', header: 'Estado', render: (o) => { const s = statusBadge(o.status); return <StatusBadge status={s.variant}>{s.label}</StatusBadge>; } },
            {
              key: 'action',
              header: '',
              align: 'right',
              render: (o) =>
                o.status === 'open' || o.status === 'in_progress' ? (
                  <Button asChild size="sm" variant="secondary" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/produccion/${o.id}/cerrar`}>Cargar producción / Cerrar</Link>
                  </Button>
                ) : o.status === 'closed' ? (
                  <Button asChild size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/produccion/${o.id}/cerrar`}>Ver costo</Link>
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
    </div>
  );
}
