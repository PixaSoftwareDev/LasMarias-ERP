'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Factory, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DateRangeFilter } from '@/components/ui/date-range';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { productionApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useConfirm } from '@/hooks/use-confirm';
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
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { user } = useAuth();
  // Borrar deshace stock: lo puede hacer quien opera la pantalla (mismo criterio que anular una venta).
  const canDelete = user?.role === 'admin' || user?.role === 'gerente' || user?.role === 'operario';
  const { data = [], isLoading } = useQuery({ queryKey: ['production-orders'], queryFn: () => productionApi.list() });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productionApi.remove(id),
    onSuccess: (r) => {
      // La reversa toca silos, stock e insumos: invalidamos todo para no dejar datos viejos.
      queryClient.invalidateQueries();
      toast.success(`Orden ${r.code} borrada. El stock volvió a como estaba.`);
    },
    onError: (err) => {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('No se pudo borrar la orden. Probá de nuevo.');
    },
  });

  const handleDelete = async (o: ProductionOrder) => {
    const ok = await confirm({
      title: `Borrar la orden ${o.code}`,
      message:
        o.status === 'closed'
          ? 'Se elimina lo producido y la leche y los insumos vuelven al stock, como si la orden nunca hubiera existido. Solo se puede si lo producido no se vendió ni se usó todavía.'
          : 'Se libera la leche que estaba reservada para esta orden.',
      confirmLabel: 'Borrar orden',
      cancelLabel: 'Cancelar',
      destructive: true,
    });
    if (ok) deleteMutation.mutate(o.id);
  };

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
              render: (o) => (
                <div className="flex items-center justify-end gap-1">
                  {o.status === 'open' || o.status === 'in_progress' ? (
                    <>
                      {canDelete && (
                        <Button asChild size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
                          <Link href={`/produccion/${o.id}/editar`} aria-label={`Editar orden ${o.code}`}>
                            <Pencil className="h-4 w-4" /> Editar
                          </Link>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="secondary" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/produccion/${o.id}/cerrar`}>Cargar producción / Cerrar</Link>
                      </Button>
                    </>
                  ) : o.status === 'closed' ? (
                    <>
                      {canDelete && (
                        <Button asChild size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
                          <Link href={`/produccion/${o.id}/editar`} aria-label={`Editar orden ${o.code}`}>
                            <Pencil className="h-4 w-4" /> Editar
                          </Link>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/produccion/${o.id}/cerrar`}>Ver costo</Link>
                      </Button>
                    </>
                  ) : null}
                  {canDelete && (
                    <button
                      type="button"
                      aria-label={`Borrar orden ${o.code}`}
                      disabled={deleteMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(o);
                      }}
                      className="flex min-h-touch min-w-touch items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
