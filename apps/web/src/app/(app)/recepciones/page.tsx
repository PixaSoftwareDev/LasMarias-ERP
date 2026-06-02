'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Milk, Plus, Search } from 'lucide-react';
import type { MilkReception } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { formatDateTime, formatLiters } from '@/lib/utils';
import { receptionsApi } from '@/features/receptions/api';
import { cn, normalizeText } from '@/lib/utils';

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

const PAGE_SIZE = 10;

type StatusFilter = 'todas' | 'aceptada' | 'bloqueada';
type SortKey = 'code' | 'receivedAt' | 'producerName' | 'liters';

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'aceptada', label: 'Aceptadas' },
  { value: 'bloqueada', label: 'Bloqueadas' },
];

// Valor de orden por columna.
function sortVal(r: MilkReception, key: SortKey): string | number {
  switch (key) {
    case 'code': return r.code;
    case 'receivedAt': return new Date(r.receivedAt).getTime();
    case 'producerName': return r.producerName;
    case 'liters': return Number(r.liters);
  }
}

export default function ReceptionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['receptions'],
    queryFn: () => receptionsApi.list(),
  });

  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('todas');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Por defecto, la más reciente arriba.
  const [sortKey, setSortKey] = useState<SortKey>('receivedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filtrado + orden.
  const result = useMemo(() => {
    const q = normalizeText(query.trim());
    const filtered = (data ?? []).filter((r) => {
      if (status !== 'todas' && r.status !== status) return false;
      if (q && !normalizeText(`${r.code} ${r.producerName} ${r.remito ?? ''}`).includes(q)) return false;
      const day = r.receivedAt.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortVal(a, sortKey);
      const vb = sortVal(b, sortKey);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir;
    });
  }, [data, query, status, from, to, sortKey, sortDir]);

  const total = result.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
  }, [query, status, from, to, sortKey, sortDir]);
  useEffect(() => {
    if (page > totalPages - 1) setPage(0);
  }, [totalPages, page]);
  const start = page * PAGE_SIZE;
  const rows = result.slice(start, start + PAGE_SIZE);
  const paginated = total > PAGE_SIZE;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'receivedAt' ? 'desc' : 'asc');
    }
  }

  // Encabezado ordenable de la tabla desktop.
  const SortTh = ({ label, col, align = 'left' }: { label: string; col: SortKey; align?: 'left' | 'right' }) => {
    const active = sortKey === col;
    return (
      <th className={cn('px-4 py-3 font-medium', align === 'right' && 'text-right')}>
        <button
          type="button"
          onClick={() => toggleSort(col)}
          className={cn(
            'inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground',
            align === 'right' && 'flex-row-reverse',
            active && 'text-foreground',
          )}
        >
          {label}
          {active ? (
            sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
          )}
        </button>
      </th>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recepción de leche"
        description="Ingreso diario de leche cruda a la planta."
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
          {/* Controles: buscador + estado + rango de fechas */}
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar código, tambo o remito…"
                aria-label="Buscar recepciones"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Chips de estado */}
              <div className="flex gap-1 rounded-lg border border-border-subtle bg-surface-subtle/40 p-1">
                {STATUS_CHIPS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setStatus(c.value)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      status === c.value ? 'bg-primary-600 text-white shadow-sm' : 'text-foreground-muted hover:text-foreground',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Rango de fechas */}
              <div className="flex items-center gap-1.5">
                <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" className="w-40" />
                <span className="text-sm text-foreground-muted">a</span>
                <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" className="w-40" />
              </div>
            </div>
          </div>

          {total === 0 ? (
            <Card className="p-8 text-center text-sm text-foreground-muted">
              No hay recepciones que coincidan con la búsqueda o los filtros.
            </Card>
          ) : (
            <>
              {/* Mobile: card list. CLAUDE.md §5.3 — "listas sobre tablas en mobile". */}
              <div className="grid gap-3 md:hidden">
                {rows.map((r) => {
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
                      <SortTh label="Código" col="code" />
                      <SortTh label="Fecha y hora" col="receivedAt" />
                      <SortTh label="Productor" col="producerName" />
                      <SortTh label="Litros" col="liters" align="right" />
                      <th className="px-4 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
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

              {/* Paginación — solo si hay más de una página. */}
              {paginated && (
                <div className="flex flex-col items-center justify-between gap-2 text-sm sm:flex-row">
                  <span className="text-foreground-muted">
                    Mostrando {start + 1}–{Math.min(start + PAGE_SIZE, total)} de {total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                      <ChevronLeft className="h-4 w-4" /> Anterior
                    </Button>
                    <span className="px-1 text-foreground-muted">
                      Página {page + 1} de {totalPages}
                    </span>
                    <Button variant="secondary" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                      Siguiente <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
