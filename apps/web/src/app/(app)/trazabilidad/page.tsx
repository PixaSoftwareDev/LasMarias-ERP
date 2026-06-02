'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitBranch, Milk, Factory, Truck, ArrowDownToLine, ArrowUpFromLine, Crosshair, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/page-header';
import { inventoryApi, productionApi } from '@/features/api';
import { receptionsApi } from '@/features/receptions/api';
import type { TraceForward, TraceBackward } from '@lasmarias/shared-schemas';

// Trazabilidad bidireccional navegable (CLAUDE.md §4.4). El usuario elige un lote
// y ve "de dónde viene" (ascendente: hasta la leche y el productor) y "a dónde fue"
// (descendente: órdenes → productos → despachos a clientes). Cada lote es clickeable
// para re-centrar la trazabilidad en él.

interface BatchOption {
  batchId: string;
  code: string;
  group: string; // "Lotes de leche" | "Lotes de producción"
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-AR') : null);
const fmtQty = (n: number | null | undefined, unit?: string) =>
  typeof n === 'number' ? `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}` : null;

// Chip de lote clickeable para re-centrar la trazabilidad.
function BatchChip({
  code,
  isMilk,
  onClick,
}: {
  code: string;
  isMilk?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Centrar la trazabilidad en este lote"
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs font-medium transition-colors',
        isMilk
          ? 'bg-secondary-50 text-secondary-700 hover:bg-secondary-100'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
      ].join(' ')}
    >
      {isMilk ? <Milk className="h-3.5 w-3.5" aria-hidden="true" /> : <Package className="h-3.5 w-3.5" aria-hidden="true" />}
      {code}
    </button>
  );
}

// --- Árbol ASCENDENTE: de qué se hizo el lote, hasta la leche y el productor.
function BackwardNode({
  node,
  onSelect,
  depth = 0,
}: {
  node: TraceBackward;
  onSelect: (batchId: string) => void;
  depth?: number;
}) {
  const { batch } = node;
  return (
    <div className={depth > 0 ? 'mt-3 border-l-2 border-border-subtle pl-4' : ''}>
      <div className="flex flex-wrap items-center gap-2">
        <BatchChip code={batch.code} isMilk={batch.isMilk} onClick={() => onSelect(batch.id)} />
        <span className="text-sm text-foreground">
          {batch.productName ?? (batch.isMilk ? 'Leche cruda' : 'Producto')}
        </span>
        {fmtQty(batch.quantity, batch.unit) && (
          <span className="text-xs text-foreground-muted">{fmtQty(batch.quantity, batch.unit)}</span>
        )}
      </div>

      {node.producer && (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-foreground-muted">
          <Milk className="h-4 w-4 text-secondary-600" aria-hidden="true" />
          Leche del productor <span className="font-medium text-foreground">{node.producer.producerName}</span>
          {node.producer.receptionCode && (
            <span className="font-mono text-xs">(recepción {node.producer.receptionCode})</span>
          )}
        </p>
      )}

      {node.producedBy && (
        <div className="mt-1.5">
          <p className="flex items-center gap-1.5 text-sm text-foreground-muted">
            <Factory className="h-4 w-4 text-primary-600" aria-hidden="true" />
            Producido en la orden <span className="font-medium text-foreground">{node.producedBy.orderCode}</span>
            {node.producedBy.inputs.length > 0 && <span>· se usaron estos lotes:</span>}
          </p>
          {node.producedBy.inputs.map((child) => (
            <BackwardNode key={child.batch.id} node={child} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}

      {!node.producer && !node.producedBy && depth === 0 && (
        <p className="mt-1.5 text-sm text-foreground-muted">No hay origen registrado para este lote.</p>
      )}
    </div>
  );
}

// --- Árbol DESCENDENTE: qué se hizo con el lote y a quién se vendió.
function ForwardNode({
  node,
  onSelect,
  depth = 0,
}: {
  node: TraceForward;
  onSelect: (batchId: string) => void;
  depth?: number;
}) {
  const { batch } = node;
  return (
    <div className={depth > 0 ? 'mt-3 border-l-2 border-border-subtle pl-4' : ''}>
      <div className="flex flex-wrap items-center gap-2">
        <BatchChip code={batch.code} isMilk={batch.isMilk} onClick={() => onSelect(batch.id)} />
        <span className="text-sm text-foreground">
          {batch.productName ?? (batch.isMilk ? 'Leche cruda' : 'Producto')}
        </span>
        {fmtQty(batch.quantity, batch.unit) && (
          <span className="text-xs text-foreground-muted">{fmtQty(batch.quantity, batch.unit)}</span>
        )}
      </div>

      {node.productionOrders.map((order) => (
        <div key={order.orderId} className="mt-1.5">
          <p className="flex items-center gap-1.5 text-sm text-foreground-muted">
            <Factory className="h-4 w-4 text-primary-600" aria-hidden="true" />
            Usado en la orden <span className="font-medium text-foreground">{order.orderCode}</span>
            {order.outputs.length > 0 && <span>· salieron estos lotes:</span>}
          </p>
          {order.outputs.map((child) => (
            <ForwardNode key={child.batch.id} node={child} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      ))}

      {node.dispatches.map((d, i) => (
        <p key={`${d.salesOrderId}-${i}`} className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-foreground-muted">
          <Truck className="h-4 w-4 text-secondary-600" aria-hidden="true" />
          Despachado a <span className="font-medium text-foreground">{d.clientName}</span>
          <span className="text-xs">
            {fmtQty(d.quantity, d.unit)}
            {fmtDate(d.dispatchedAt) ? ` · el ${fmtDate(d.dispatchedAt)}` : ''}
            {` · ${d.salesOrderCode}`}
          </span>
        </p>
      ))}

      {node.productionOrders.length === 0 && node.dispatches.length === 0 && depth === 0 && (
        <p className="mt-1.5 text-sm text-foreground-muted">
          Este lote todavía no se usó en producción ni se despachó.
        </p>
      )}
    </div>
  );
}

export default function TraceabilityPage() {
  const [batchId, setBatchId] = useState('');

  // Lotes candidatos: reusamos recepciones de leche (traen batchId + código de lote)
  // y las salidas de órdenes de producción cerradas (traen batchId + batchCode).
  const receptionsQuery = useQuery({ queryKey: ['milk-receptions'], queryFn: () => receptionsApi.list() });
  const productionQuery = useQuery({ queryKey: ['production-orders'], queryFn: () => productionApi.list() });

  const batchOptions = useMemo<BatchOption[]>(() => {
    const seen = new Set<string>();
    const opts: BatchOption[] = [];
    for (const r of receptionsQuery.data ?? []) {
      if (r.batchId && !seen.has(r.batchId)) {
        seen.add(r.batchId);
        opts.push({ batchId: r.batchId, code: `${r.code} · ${r.producerName}`, group: 'Lotes de leche' });
      }
    }
    for (const o of productionQuery.data ?? []) {
      for (const out of o.actualOutputs) {
        if (out.batchId && out.batchCode && !seen.has(out.batchId)) {
          seen.add(out.batchId);
          opts.push({ batchId: out.batchId, code: `${out.batchCode} · ${out.productName}`, group: 'Lotes de producción' });
        }
      }
    }
    return opts;
  }, [receptionsQuery.data, productionQuery.data]);

  const grouped = useMemo(() => {
    const map = new Map<string, BatchOption[]>();
    for (const o of batchOptions) {
      const arr = map.get(o.group) ?? [];
      arr.push(o);
      map.set(o.group, arr);
    }
    return map;
  }, [batchOptions]);

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

  const selectedLabel = batchOptions.find((o) => o.batchId === batchId)?.code;
  const loadingOptions = receptionsQuery.isLoading || productionQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trazabilidad"
        description="Seguí un lote en las dos direcciones: de dónde viene la leche y a qué clientes llegó el producto."      />

      <Card>
        <CardHeader>
          <CardTitle>Elegí un lote para rastrear</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingOptions ? (
            <div className="h-11 animate-pulse rounded-md bg-surface-subtle" />
          ) : batchOptions.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              Todavía no hay lotes para rastrear. Cargá una recepción de leche o cerrá una orden de producción.
            </p>
          ) : (
            <Field label="Lote" htmlFor="batch" hint="Podés tipear parte del código para buscar.">
              <select
                id="batch"
                className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
              >
                <option value="">Elegí un lote</option>
                {[...grouped.entries()].map(([group, opts]) => (
                  <optgroup key={group} label={group}>
                    {opts.map((o) => (
                      <option key={o.batchId} value={o.batchId}>
                        {o.code}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
          )}
        </CardContent>
      </Card>

      {!batchId ? (
        <EmptyState
          icon={GitBranch}
          title="Elegí un lote para ver su trazabilidad"
          description="Vas a ver de dónde viene (leche y productor) y a dónde fue (productos y clientes)."
        />
      ) : (
        <>
          {selectedLabel && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-foreground-muted">
              <Crosshair className="h-4 w-4 text-primary-600" aria-hidden="true" />
              Mostrando la trazabilidad de <span className="font-medium text-foreground">{selectedLabel}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* De dónde viene — ascendente */}
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <ArrowUpFromLine className="h-5 w-5 text-secondary-600" aria-hidden="true" />
                <div>
                  <CardTitle>De dónde viene</CardTitle>
                  <p className="text-xs text-foreground-muted">Cadena hasta la leche y el productor.</p>
                </div>
              </CardHeader>
              <CardContent>
                {backwardQuery.isLoading ? (
                  <div className="h-24 animate-pulse rounded-md bg-surface-subtle" />
                ) : backwardQuery.isError ? (
                  <p className="text-sm text-danger">No se pudo cargar el origen del lote.</p>
                ) : backwardQuery.data ? (
                  <BackwardNode node={backwardQuery.data} onSelect={setBatchId} />
                ) : null}
              </CardContent>
            </Card>

            {/* A dónde fue — descendente */}
            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <ArrowDownToLine className="h-5 w-5 text-primary-600" aria-hidden="true" />
                <div>
                  <CardTitle>A dónde fue</CardTitle>
                  <p className="text-xs text-foreground-muted">Órdenes, productos y ventas a clientes.</p>
                </div>
              </CardHeader>
              <CardContent>
                {forwardQuery.isLoading ? (
                  <div className="h-24 animate-pulse rounded-md bg-surface-subtle" />
                ) : forwardQuery.isError ? (
                  <p className="text-sm text-danger">No se pudo cargar el destino del lote.</p>
                ) : forwardQuery.data ? (
                  <ForwardNode node={forwardQuery.data} onSelect={setBatchId} />
                ) : null}
              </CardContent>
            </Card>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-foreground-subtle">
            <StatusBadge status="info">Tip</StatusBadge>
            Hacé clic en cualquier código de lote para centrar la trazabilidad en él.
          </p>
        </>
      )}
    </div>
  );
}
