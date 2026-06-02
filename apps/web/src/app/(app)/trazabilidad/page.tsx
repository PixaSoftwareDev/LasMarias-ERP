'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { GitBranch, Milk, Factory, Truck, Package, ArrowRight, MapPin, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { inventoryApi, productionApi } from '@/features/api';
import { receptionsApi } from '@/features/receptions/api';
import { cn, formatDate, normalizeText } from '@/lib/utils';
import type { TraceForward, TraceBackward, TraceBatch } from '@lasmarias/shared-schemas';

// Trazabilidad como un ÚNICO recorrido vertical (CLAUDE.md §4.4 / §7): de arriba
// (la leche y el tambo) hacia abajo (el cliente), con el lote elegido resaltado en
// el medio. Se lee como el viaje del producto, no como un árbol de datos. Cada lote
// sigue siendo clickeable para centrar la trazabilidad en él.

type BatchKind = 'leche' | 'produccion';
interface BatchOption {
  batchId: string;
  kind: BatchKind;
  name: string; // tambo (leche) o producto (producción)
  date?: string; // ISO
  code: string; // código de lote
  searchText: string; // para el buscador por palabras
}

const fmtDate = (iso?: string) => (iso ? formatDate(iso) : null);
const fmtQty = (n: number | null | undefined, unit?: string) =>
  typeof n === 'number' ? `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}` : null;

// ─── Pasos del recorrido (lista plana, de origen → lote actual → destino) ──────
type Step =
  | { kind: 'origen'; key: string; batch: TraceBatch; producerName: string; receptionCode?: string }
  | { kind: 'produccion'; key: string; orderCode: string; batch: TraceBatch }
  | { kind: 'destino'; key: string; clientName: string; quantity: number; unit: string; dispatchedAt?: string; salesOrderCode: string };

// Aplana la cadena ASCENDENTE en pasos ordenados de origen → (hasta) el lote actual.
// El nodo raíz (lote actual) NO se incluye: se muestra aparte, resaltado.
function backwardSteps(node: TraceBackward, isRoot: boolean): Step[] {
  const out: Step[] = [];
  // Primero lo más profundo (más cerca del origen).
  if (node.producedBy) {
    for (const input of node.producedBy.inputs) out.push(...backwardSteps(input, false));
  }
  if (!isRoot) {
    if (node.producer) {
      out.push({
        kind: 'origen',
        key: `o-${node.batch.id}`,
        batch: node.batch,
        producerName: node.producer.producerName,
        receptionCode: node.producer.receptionCode,
      });
    } else if (node.producedBy) {
      out.push({ kind: 'produccion', key: `pb-${node.batch.id}`, orderCode: node.producedBy.orderCode, batch: node.batch });
    }
  }
  return out;
}

// Aplana la cadena DESCENDENTE en pasos ordenados del lote actual → destinos.
function forwardSteps(node: TraceForward): Step[] {
  const out: Step[] = [];
  for (const order of node.productionOrders) {
    for (const o of order.outputs) {
      out.push({ kind: 'produccion', key: `pf-${order.orderId}-${o.batch.id}`, orderCode: order.orderCode, batch: o.batch });
      out.push(...forwardSteps(o));
    }
  }
  for (const d of node.dispatches) {
    out.push({
      kind: 'destino',
      key: `d-${d.salesOrderId}-${d.clientId ?? d.clientName}`,
      clientName: d.clientName,
      quantity: d.quantity,
      unit: d.unit,
      dispatchedAt: d.dispatchedAt,
      salesOrderCode: d.salesOrderCode,
    });
  }
  return out;
}

// Productores únicos de toda la cadena ascendente (para el titular).
function collectProducers(node: TraceBackward, acc: Set<string>): void {
  if (node.producer) acc.add(node.producer.producerName);
  node.producedBy?.inputs.forEach((i) => collectProducers(i, acc));
}

// Clientes únicos de toda la cadena descendente (para el titular).
function collectClients(node: TraceForward, acc: Set<string>): void {
  node.dispatches.forEach((d) => acc.add(d.clientName));
  node.productionOrders.forEach((o) => o.outputs.forEach((out) => collectClients(out, acc)));
}

// ─── Estilo de cada tipo de paso ──────────────────────────────────────────────
const STEP_STYLE: Record<Step['kind'] | 'actual', { icon: LucideIcon; dot: string; tag: string; tagText: string }> = {
  origen: { icon: Milk, dot: 'bg-secondary-50 text-secondary-700 ring-secondary-100', tag: 'text-secondary-700', tagText: 'Origen' },
  produccion: { icon: Factory, dot: 'bg-slate-100 text-slate-600 ring-slate-200', tag: 'text-slate-600', tagText: 'Producción' },
  destino: { icon: Truck, dot: 'bg-primary-50 text-primary-700 ring-primary-100', tag: 'text-primary-700', tagText: 'Destino' },
  actual: { icon: Package, dot: 'bg-primary-600 text-white ring-primary-200', tag: 'text-primary-700', tagText: 'Este lote' },
};

// Una fila del recorrido: nodo con ícono + línea conectora a la izquierda, contenido a la derecha.
function TimelineRow({
  icon: Icon,
  dotClass,
  isLast,
  children,
}: {
  icon: LucideIcon;
  dotClass: string;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ring-4 ${dotClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {!isLast && <span className="w-px flex-1 bg-border-subtle" aria-hidden="true" />}
      </div>
      <div className={isLast ? 'flex-1' : 'flex-1 pb-6'}>{children}</div>
    </li>
  );
}

// Etiqueta de etapa ("ORIGEN", "PRODUCCIÓN"…).
function StepTag({ kind }: { kind: Step['kind'] | 'actual' }) {
  const s = STEP_STYLE[kind];
  return <span className={`text-[11px] font-semibold uppercase tracking-wide ${s.tag}`}>{s.tagText}</span>;
}

// Contenido de un paso del recorrido (resuelve el tipo con un switch para que el
// narrowing del union funcione sin importar en qué tramo del hilo esté).
function StepContent({ step, onSelect }: { step: Step; onSelect: (batchId: string) => void }) {
  switch (step.kind) {
    case 'origen':
      return (
        <>
          <StepTag kind="origen" />
          <p className="mt-0.5 text-sm text-foreground">
            Leche del tambo <span className="font-medium">{step.producerName}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <BatchChip code={step.batch.code} isMilk onClick={() => onSelect(step.batch.id)} />
            {fmtQty(step.batch.quantity, step.batch.unit) && (
              <span className="text-xs text-foreground-muted">{fmtQty(step.batch.quantity, step.batch.unit)}</span>
            )}
            {step.receptionCode && <span className="font-mono text-xs text-foreground-muted">recep. {step.receptionCode}</span>}
          </div>
        </>
      );
    case 'produccion':
      return (
        <>
          <StepTag kind="produccion" />
          <p className="mt-0.5 text-sm text-foreground">
            En la orden <span className="font-medium">{step.orderCode}</span> salió{' '}
            <span className="font-medium">{step.batch.productName ?? 'producto'}</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <BatchChip code={step.batch.code} isMilk={step.batch.isMilk} onClick={() => onSelect(step.batch.id)} />
            {fmtQty(step.batch.quantity, step.batch.unit) && (
              <span className="text-xs text-foreground-muted">{fmtQty(step.batch.quantity, step.batch.unit)}</span>
            )}
          </div>
        </>
      );
    case 'destino':
      return (
        <>
          <StepTag kind="destino" />
          <p className="mt-0.5 text-sm text-foreground">
            Vendido a <span className="font-medium">{step.clientName}</span>
          </p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            {fmtQty(step.quantity, step.unit)}
            {fmtDate(step.dispatchedAt) ? ` · ${fmtDate(step.dispatchedAt)}` : ''} · {step.salesOrderCode}
          </p>
        </>
      );
  }
}

// Código de lote clickeable para re-centrar.
function BatchChip({ code, isMilk, onClick }: { code: string; isMilk?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Centrar la trazabilidad en este lote"
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs font-medium transition-colors',
        isMilk ? 'bg-secondary-50 text-secondary-700 hover:bg-secondary-100' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
      ].join(' ')}
    >
      {isMilk ? <Milk className="h-3.5 w-3.5" aria-hidden="true" /> : <Package className="h-3.5 w-3.5" aria-hidden="true" />}
      {code}
    </button>
  );
}

// ─── Recorrido completo (origen → lote actual → destino) ──────────────────────
function Journey({
  backward,
  forward,
  onSelect,
}: {
  backward: TraceBackward;
  forward: TraceForward;
  onSelect: (batchId: string) => void;
}) {
  const before = backwardSteps(backward, true);
  const after = forwardSteps(forward);
  const current = backward.batch;
  const originLine = backward.producer
    ? `Leche de ${backward.producer.producerName}${backward.producer.receptionCode ? ` · recepción ${backward.producer.receptionCode}` : ''}`
    : backward.producedBy
      ? `Hecho en la orden ${backward.producedBy.orderCode}`
      : null;

  return (
    <Card>
      <CardContent>
        <ol className="flex flex-col">
          {/* ORIGEN y producciones intermedias */}
          {before.map((step) => {
            const style = STEP_STYLE[step.kind];
            return (
              <TimelineRow key={step.key} icon={style.icon} dotClass={style.dot}>
                <StepContent step={step} onSelect={onSelect} />
              </TimelineRow>
            );
          })}

          {/* EL LOTE ACTUAL — resaltado */}
          <TimelineRow icon={STEP_STYLE.actual.icon} dotClass={STEP_STYLE.actual.dot} isLast={after.length === 0}>
            <div className="rounded-xl border-2 border-primary-300 bg-primary-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StepTag kind="actual" />
                <span className="rounded-full bg-primary-600 px-2.5 py-0.5 text-[11px] font-medium text-white">
                  Estás viendo este lote
                </span>
              </div>
              <p className="mt-1 font-display text-lg font-bold tracking-tight text-foreground">
                {current.productName ?? (current.isMilk ? 'Leche cruda' : 'Producto')}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium text-foreground">{current.code}</span>
                {fmtQty(current.quantity, current.unit) && (
                  <span className="text-sm text-foreground-muted">· {fmtQty(current.quantity, current.unit)}</span>
                )}
              </div>
              {originLine && <p className="mt-1.5 text-xs text-foreground-muted">{originLine}</p>}
              {current.expirationDate && (
                <p className="text-xs text-foreground-muted">Vence el {fmtDate(current.expirationDate)}</p>
              )}
            </div>
          </TimelineRow>

          {/* DESTINOS y producciones posteriores */}
          {after.map((step, i) => {
            const style = STEP_STYLE[step.kind];
            const isLast = i === after.length - 1;
            return (
              <TimelineRow key={step.key} icon={style.icon} dotClass={style.dot} isLast={isLast}>
                <StepContent step={step} onSelect={onSelect} />
              </TimelineRow>
            );
          })}
        </ol>

        {before.length === 0 && after.length === 0 && (
          <p className="mt-4 text-sm text-foreground-muted">
            Este lote todavía no tiene origen encadenado ni movimientos posteriores: recién entró al circuito.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TraceabilityInner() {
  // Entrada natural: si llegamos con ?lote=<batchId> (desde Producción, Recepción…),
  // arrancamos centrados en ese lote sin que el usuario tenga que buscar nada.
  const searchParams = useSearchParams();
  const [batchId, setBatchId] = useState(() => searchParams.get('lote') ?? '');
  // Mientras "elegís" mostramos el buscador completo; al elegir un lote lo colapsamos
  // a una barrita para que el recorrido quede arriba y la página no se alargue de gusto.
  const [picking, setPicking] = useState(() => !searchParams.get('lote'));
  // Filtros del buscador: tipo (chips), filtro dependiente (tambo/producto) y texto libre.
  const [kindFilter, setKindFilter] = useState<'todos' | BatchKind>('todos');
  const [subFilter, setSubFilter] = useState('');
  const [query, setQuery] = useState('');

  const receptionsQuery = useQuery({ queryKey: ['milk-receptions'], queryFn: () => receptionsApi.list() });
  const productionQuery = useQuery({ queryKey: ['production-orders'], queryFn: () => productionApi.list() });

  const batchOptions = useMemo<BatchOption[]>(() => {
    const seen = new Set<string>();
    const opts: BatchOption[] = [];
    for (const r of receptionsQuery.data ?? []) {
      if (r.batchId && !seen.has(r.batchId)) {
        seen.add(r.batchId);
        opts.push({
          batchId: r.batchId,
          kind: 'leche',
          name: r.producerName,
          date: r.receivedAt,
          code: r.code,
          searchText: `${r.producerName} ${r.code} ${fmtDate(r.receivedAt) ?? ''}`,
        });
      }
    }
    for (const o of productionQuery.data ?? []) {
      for (const out of o.actualOutputs) {
        if (out.batchId && out.batchCode && !seen.has(out.batchId)) {
          seen.add(out.batchId);
          opts.push({
            batchId: out.batchId,
            kind: 'produccion',
            name: out.productName,
            date: o.startedAt,
            code: out.batchCode,
            searchText: `${out.productName} ${out.batchCode} ${fmtDate(o.startedAt) ?? ''}`,
          });
        }
      }
    }
    return opts;
  }, [receptionsQuery.data, productionQuery.data]);

  // Opciones del 2º filtro (dependiente del tipo): tambos si es leche, productos si es producción.
  const subOptions = useMemo(() => {
    if (kindFilter === 'todos') return [];
    const names = new Set<string>();
    for (const o of batchOptions) if (o.kind === kindFilter) names.add(o.name);
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  }, [batchOptions, kindFilter]);

  // Al cambiar el tipo, reseteamos el filtro dependiente (sus opciones cambian).
  useEffect(() => {
    setSubFilter('');
  }, [kindFilter]);

  // Resultados: tipo → filtro dependiente → texto. Más nuevos primero.
  const results = useMemo(() => {
    const q = normalizeText(query.trim());
    return batchOptions
      .filter((o) => (kindFilter === 'todos' ? true : o.kind === kindFilter))
      .filter((o) => (subFilter ? o.name === subFilter : true))
      .filter((o) => (q ? normalizeText(o.searchText).includes(q) : true))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [batchOptions, kindFilter, subFilter, query]);

  const KIND_CHIPS: { value: 'todos' | BatchKind; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'leche', label: 'Lotes de leche' },
    { value: 'produccion', label: 'Lotes de producción' },
  ];
  // Cuántos lotes mostramos en la lista antes de pedir que filtre (filas enteras, sin scroll cortado).
  const VISIBLE_RESULTS = 6;

  const backwardQuery = useQuery({
    queryKey: ['trace-backward', batchId],
    queryFn: () => inventoryApi.traceBackward(batchId),
    enabled: !!batchId,
  });
  const forwardQuery = useQuery({
    queryKey: ['trace-forward', batchId],
    queryFn: () => inventoryApi.traceForward(batchId),
    enabled: !!batchId,
  });

  const loadingOptions = receptionsQuery.isLoading || productionQuery.isLoading;
  const loadingTrace = backwardQuery.isLoading || forwardQuery.isLoading;

  // Datos del lote elegido para la barrita compacta (con respaldo en la traza si el
  // lote vino por deep-link y no está en la lista de opciones).
  const selectedOpt = batchOptions.find((o) => o.batchId === batchId);
  const selName = selectedOpt?.name ?? backwardQuery.data?.batch.productName ?? (backwardQuery.data?.batch.isMilk ? 'Leche cruda' : 'Lote');
  const selCode = selectedOpt?.code ?? backwardQuery.data?.batch.code ?? '';
  const selKind: BatchKind = selectedOpt?.kind ?? (backwardQuery.data?.batch.isMilk ? 'leche' : 'produccion');

  // Titular en una frase: "Leche de X → Producto → N clientes".
  const headline = useMemo(() => {
    if (!backwardQuery.data || !forwardQuery.data) return null;
    const producers = new Set<string>();
    collectProducers(backwardQuery.data, producers);
    const clients = new Set<string>();
    collectClients(forwardQuery.data, clients);

    const origin =
      producers.size === 0 ? 'Sin origen registrado' : producers.size === 1 ? `Leche de ${[...producers][0]}` : `Leche de ${producers.size} tambos`;
    const product = backwardQuery.data.batch.productName ?? (backwardQuery.data.batch.isMilk ? 'Leche cruda' : 'Producto');
    const dest =
      clients.size === 0 ? 'Todavía en planta' : clients.size === 1 ? [...clients][0] : `${clients.size} clientes`;
    return { origin, product, dest };
  }, [backwardQuery.data, forwardQuery.data]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trazabilidad"
        description="Seguí el viaje de un lote: de qué leche salió y a qué clientes llegó, todo en un solo recorrido."
      />

      <Card>
        <CardContent className="flex flex-col gap-4">
          {loadingOptions ? (
            <Skeleton className="h-11" />
          ) : batchOptions.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              Todavía no hay lotes para rastrear. Cargá una recepción de leche o cerrá una orden de producción.
            </p>
          ) : batchId && !picking ? (
            // Barrita compacta: el lote elegido + botón para cambiarlo. Deja lugar al recorrido.
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  className={cn(
                    'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
                    selKind === 'leche' ? 'bg-secondary-50 text-secondary-700' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {selKind === 'leche' ? <Milk className="h-4 w-4" aria-hidden="true" /> : <Package className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="text-foreground-muted">Siguiendo: </span>
                  <span className="font-medium text-foreground">{selName}</span>{' '}
                  <span className="font-mono text-xs text-foreground-muted">{selCode}</span>
                </span>
              </span>
              <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
                <Search className="h-4 w-4" /> Cambiar lote
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">¿Qué lote querés seguir?</p>

              {/* Filtro 1: tipo de lote (chips). */}
              <div className="flex flex-wrap gap-1 rounded-lg border border-border-subtle bg-surface-subtle/40 p-1">
                {KIND_CHIPS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setKindFilter(c.value)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      kindFilter === c.value ? 'bg-primary-600 text-white shadow-sm' : 'text-foreground-muted hover:text-foreground',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Filtro 2 (dependiente) + buscador por palabras, en una fila. */}
              <div className="flex flex-col gap-2 sm:flex-row">
                {kindFilter !== 'todos' && subOptions.length > 0 && (
                  <select
                    aria-label={kindFilter === 'leche' ? 'Filtrar por tambo' : 'Filtrar por producto'}
                    className="min-h-touch rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 sm:w-56"
                    value={subFilter}
                    onChange={(e) => setSubFilter(e.target.value)}
                  >
                    <option value="">{kindFilter === 'leche' ? 'Todos los tambos' : 'Todos los productos'}</option>
                    {subOptions.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                )}
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" aria-hidden="true" />
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por producto, tambo, código o fecha…"
                    aria-label="Buscar lote"
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Resultados: lista clickeable (el elegido queda resaltado). */}
              {results.length === 0 ? (
                <p className="rounded-lg border border-border-subtle bg-surface-subtle/40 px-3 py-6 text-center text-sm text-foreground-muted">
                  No hay lotes que coincidan con la búsqueda.
                </p>
              ) : (
                <>
                  <p className="text-xs text-foreground-muted">{results.length} {results.length === 1 ? 'lote' : 'lotes'}</p>
                  {/* Mostramos filas enteras (sin scroll que corte a la mitad). Si hay más,
                      invitamos a filtrar/buscar — los más nuevos aparecen primero. */}
                  <ul className="flex flex-col gap-2">
                    {results.slice(0, VISIBLE_RESULTS).map((o) => {
                      const selected = o.batchId === batchId;
                      return (
                        <li key={o.batchId}>
                          <button
                            type="button"
                            onClick={() => { setBatchId(o.batchId); setPicking(false); }}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                              selected
                                ? 'border-primary-300 bg-primary-50/60 ring-1 ring-primary-200'
                                : 'border-border-subtle hover:bg-surface-subtle',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
                                o.kind === 'leche' ? 'bg-secondary-50 text-secondary-700' : 'bg-slate-100 text-slate-600',
                              )}
                            >
                              {o.kind === 'leche' ? <Milk className="h-4 w-4" aria-hidden="true" /> : <Package className="h-4 w-4" aria-hidden="true" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">{o.name}</span>
                              <span className="block truncate text-xs text-foreground-muted">
                                {fmtDate(o.date) ? `${fmtDate(o.date)} · ` : ''}
                                <span className="font-mono">{o.code}</span>
                              </span>
                            </span>
                            {selected && <span className="text-[11px] font-medium text-primary-700">Elegido</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {results.length > VISIBLE_RESULTS && (
                    <p className="pt-1 text-center text-xs text-foreground-muted">
                      y {results.length - VISIBLE_RESULTS} lotes más — usá los filtros o el buscador para encontrar el tuyo.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!batchId ? (
        <EmptyState
          icon={GitBranch}
          title="Elegí un lote para ver su recorrido"
          description="Vas a ver de dónde vino la leche y a qué clientes llegó el producto, paso a paso."
        />
      ) : loadingTrace ? (
        <Card>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : backwardQuery.isError || forwardQuery.isError ? (
        <Card>
          <CardContent className="p-5 pt-5 text-sm text-danger sm:p-6 sm:pt-6">
            No se pudo cargar la trazabilidad de este lote. Probá de nuevo en un momento.
          </CardContent>
        </Card>
      ) : backwardQuery.data && forwardQuery.data ? (
        <>
          {/* Titular: el viaje en una frase */}
          {headline && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border-subtle bg-surface-subtle/50 px-4 py-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-secondary-700">
                <Milk className="h-4 w-4" aria-hidden="true" /> {headline.origin}
              </span>
              <ArrowRight className="h-4 w-4 text-foreground-subtle" aria-hidden="true" />
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Package className="h-4 w-4 text-slate-500" aria-hidden="true" /> {headline.product}
              </span>
              <ArrowRight className="h-4 w-4 text-foreground-subtle" aria-hidden="true" />
              <span className="flex items-center gap-1.5 font-medium text-primary-700">
                <MapPin className="h-4 w-4" aria-hidden="true" /> {headline.dest}
              </span>
            </div>
          )}

          <Journey backward={backwardQuery.data} forward={forwardQuery.data} onSelect={setBatchId} />

          <p className="text-xs text-foreground-subtle">
            Tocá cualquier código de lote (los redondeados) para centrar el recorrido en él.
          </p>
        </>
      ) : null}
    </div>
  );
}

// useSearchParams (leer ?lote=) requiere un límite de Suspense en App Router.
export default function TraceabilityPage() {
  return (
    <Suspense fallback={<div className="h-11 animate-pulse rounded-md bg-surface-subtle" />}>
      <TraceabilityInner />
    </Suspense>
  );
}
