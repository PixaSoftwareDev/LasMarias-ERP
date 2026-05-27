'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Milk, Plus } from 'lucide-react';
import type { MilkReception } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { formatDateTime, formatLiters } from '@/lib/utils';
import { receptionsApi } from '@/features/receptions/api';

function statusToBadge(s: MilkReception['status']): { variant: Status; label: string } {
  switch (s) {
    case 'aceptada':
      return { variant: 'success', label: 'Aceptada' };
    case 'bloqueada':
      return { variant: 'danger', label: 'Bloqueada' };
    case 'anulada':
      return { variant: 'neutral', label: 'Anulada' };
  }
}

export default function ReceptionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['receptions'],
    queryFn: () => receptionsApi.list(),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Recepción de leche"
        description="Ingreso diario de leche cruda a la planta."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Recepción de leche' }]}
        action={
          <Button asChild size="md">
            <Link href="/recepciones/nueva">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva recepción
            </Link>
          </Button>
        }
      />

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-32 animate-pulse bg-surface-subtle" />
          ))}
        </div>
      )}

      {error && (
        <Card className="flex items-start gap-2 border-danger/40 p-4 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>No pudimos cargar las recepciones. Revisá tu conexión a internet y recargá la página. Si el problema sigue, avisá al soporte.</span>
        </Card>
      )}

      {data && data.length === 0 && (
        <EmptyState
          icon={Milk}
          title="Todavía no hay recepciones"
          description="Cuando cargues la primera recepción de leche, va a aparecer acá."
          action={
            <Button asChild>
              <Link href="/recepciones/nueva">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Cargar la primera
              </Link>
            </Button>
          }
        />
      )}

      {data && data.length > 0 && (
        <>
          {/* Mobile: card list. CLAUDE.md §5.3 — "listas sobre tablas en mobile". */}
          <div className="grid gap-3 md:hidden">
            {data.map((r) => {
              const s = statusToBadge(r.status);
              return (
                <Card key={r.id} className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.producerName}</p>
                      <p className="truncate text-xs text-foreground-muted">{r.code}</p>
                    </div>
                    <StatusBadge status={s.variant}>{s.label}</StatusBadge>
                  </div>
                  <div className="flex items-end justify-between">
                    <p className="text-xs text-foreground-muted">{formatDateTime(r.receivedAt)}</p>
                    <p className="text-base font-bold text-foreground">{formatLiters(r.liters)}</p>
                  </div>
                  {r.blockedReason && (
                    <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-danger">{r.blockedReason}</p>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Desktop: tabla */}
          <Card className="hidden md:block">
            <table className="w-full">
              <thead className="border-b border-border-subtle bg-surface-subtle/40">
                <tr className="text-left text-xs uppercase tracking-wide text-foreground-muted">
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Fecha y hora</th>
                  <th className="px-4 py-3 font-medium">Productor</th>
                  <th className="px-4 py-3 font-medium text-right">Litros</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const s = statusToBadge(r.status);
                  return (
                    <tr key={r.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-subtle/30">
                      <td className="px-4 py-3 font-mono text-sm">{r.code}</td>
                      <td className="px-4 py-3 text-sm text-foreground-muted">{formatDateTime(r.receivedAt)}</td>
                      <td className="px-4 py-3 text-sm">{r.producerName}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">{formatLiters(r.liters)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.variant}>{s.label}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
