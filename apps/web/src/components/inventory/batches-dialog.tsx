'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { inventoryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { ProductBatch, StockSummary } from '@lasmarias/shared-schemas';

// Lotes de un producto, con corrección por lote (pedido del dueño, oct 2026).
// Acá se arregla lo que antes no tenía salida: kg que no cuadran, bultos colgados en un
// lote agotado, un costo mal cargado, el vencimiento que ningún flujo dejaba poner, o la
// cámara equivocada. Los kg quedan registrados como ajuste por conteo (con rastro); el
// costo corregido aplica hacia adelante, lo ya elaborado o vendido no se recalcula.

const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
const SELECT_CLASS =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

function statusBadge(status: string): { variant: Status; label: string } {
  switch (status) {
    case 'activo': return { variant: 'success', label: 'Activo' };
    case 'en_proceso': return { variant: 'info', label: 'En proceso' };
    case 'agotado': return { variant: 'warning', label: 'Agotado' };
    default: return { variant: 'danger', label: status };
  }
}

// ISO → YYYY-MM-DD para el input de fecha.
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

function EditBatchForm({ b, unit, onClose }: { b: ProductBatch; unit: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [counted, setCounted] = useState(String(b.remainingQuantity));
  const [bultos, setBultos] = useState(b.remainingBultos != null ? String(b.remainingBultos) : '');
  const [unitCost, setUnitCost] = useState(b.unitCost != null ? String(b.unitCost) : '');
  const [expiration, setExpiration] = useState(toDateInput(b.expirationDate));
  const [warehouseId, setWarehouseId] = useState(b.warehouseId ?? '');
  const [notes, setNotes] = useState(b.notes ?? '');

  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: () => inventoryApi.listWarehouses() });

  const costoCambia = (unitCost === '' ? null : Number(unitCost)) !== b.unitCost;

  const save = useMutation({
    mutationFn: () =>
      inventoryApi.updateBatch(b.id, {
        countedQuantity: counted !== '' ? Number(counted) : undefined,
        remainingBultos: bultos !== '' ? Math.round(Number(bultos)) : null,
        unitCost: unitCost !== '' ? Number(unitCost) : null,
        // Mediodía local: evita que el huso horario corra la fecha un día.
        expirationDate: expiration ? new Date(`${expiration}T12:00:00`).toISOString() : null,
        warehouseId: warehouseId || null,
        // Siempre string (hasta vacío): si se borra el texto, la nota se borra de verdad.
        notes: notes.trim(),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['inv-movements'] });
      queryClient.invalidateQueries({ queryKey: ['product-batches'] });
      toast.success(`Lote ${r.code} corregido.`);
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo corregir el lote. Probá de nuevo.'),
  });

  const canSave = counted !== '' && Number(counted) >= 0 && !save.isPending;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-subtle/40 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={`Cantidad real (${unit})`}
          htmlFor={`edit-qty-${b.id}`}
          required
          hint={`El sistema tiene ${num(b.remainingQuantity)}. La diferencia queda como ajuste por conteo.`}
        >
          <Input id={`edit-qty-${b.id}`} type="number" inputMode="decimal" step="0.01" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} />
        </Field>
        <Field label="Bultos" htmlFor={`edit-bultos-${b.id}`} hint="Bolsas o cajas que quedan de este lote. Vacío = no se cuenta por bultos.">
          <Input id={`edit-bultos-${b.id}`} type="number" inputMode="numeric" step="1" min={0} value={bultos} onChange={(e) => setBultos(e.target.value)} />
        </Field>
        <Field label={`Costo por ${unit} ($)`} htmlFor={`edit-cost-${b.id}`} hint="Vacío = sin costo.">
          <Input id={`edit-cost-${b.id}`} type="number" inputMode="decimal" step="0.01" min={0} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
        </Field>
        <Field label="Vencimiento" htmlFor={`edit-exp-${b.id}`} hint="Habilita el aviso 'por vencer' y el orden de salida por vencimiento.">
          <Input id={`edit-exp-${b.id}`} type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
        </Field>
        <Field label="Cámara / sector" htmlFor={`edit-wh-${b.id}`}>
          <select id={`edit-wh-${b.id}`} className={SELECT_CLASS} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">Sin asignar</option>
            {(warehousesQuery.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <Field label="Notas" htmlFor={`edit-notes-${b.id}`}>
          <Input id={`edit-notes-${b.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {costoCambia && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          El costo nuevo vale para lo que se elabore o venda de acá en adelante. Lo ya elaborado o
          vendido con el costo anterior no se recalcula.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancelar</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending} loadingText="Guardando..." disabled={!canSave}>
          Guardar corrección
        </Button>
      </div>
    </div>
  );
}

export function BatchesDialog({ s, onClose }: { s: StockSummary; onClose: () => void }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState<string | null>(null);
  const batchesQuery = useQuery({
    queryKey: ['product-batches', s.productId],
    queryFn: () => inventoryApi.batchesOfProduct(s.productId),
  });
  // Corregir lotes es cosa del administrativo (la API también lo exige).
  const puedeEditar = user?.role === 'admin' || user?.role === 'gerente';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Lotes de {s.productName}</CardTitle>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-foreground-muted hover:text-foreground">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </CardHeader>
        <CardContent className="space-y-3 overflow-y-auto">
          {batchesQuery.isLoading ? (
            <TableSkeleton />
          ) : (batchesQuery.data ?? []).length === 0 ? (
            <p className="py-4 text-sm text-foreground-muted">Este producto no tiene lotes cargados.</p>
          ) : (
            (batchesQuery.data ?? []).map((b) => {
              const badge = statusBadge(b.status);
              // Bultos colgados en un lote sin kg: el caso típico que hay que corregir.
              const bultosColgados = b.remainingQuantity <= 0 && (b.remainingBultos ?? 0) > 0;
              return (
                <div key={b.id} className="rounded-lg border border-border-subtle">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <span className="font-mono text-sm font-medium text-foreground">{b.code}</span>
                    <StatusBadge status={badge.variant}>{badge.label}</StatusBadge>
                    <span className="ml-auto text-right">
                      <span className="font-display text-base font-bold text-foreground">{num(b.remainingQuantity)}</span>
                      <span className="ml-1 text-xs text-foreground-muted">{b.unit}</span>
                      {b.remainingBultos != null && (
                        <span className={`block text-xs ${bultosColgados ? 'font-medium text-amber-700' : 'text-foreground-muted'}`}>
                          {num(b.remainingBultos)} {b.remainingBultos === 1 ? 'bulto' : 'bultos'}
                          {bultosColgados ? ' (sin kg: revisar)' : ''}
                        </span>
                      )}
                    </span>
                    {puedeEditar && (
                      <Button size="sm" variant="secondary" onClick={() => setEditing(editing === b.id ? null : b.id)}>
                        <Pencil className="h-3.5 w-3.5" /> Corregir
                      </Button>
                    )}
                  </div>
                  <p className="px-4 pb-3 text-xs text-foreground-muted">
                    {[
                      b.productionDate ? `elaborado ${new Date(b.productionDate).toLocaleDateString('es-AR')}` : null,
                      b.expirationDate ? `vence ${new Date(b.expirationDate).toLocaleDateString('es-AR')}` : 'sin vencimiento',
                      b.unitCost != null ? `${formatMoney(b.unitCost)}/${b.unit}` : 'sin costo',
                      b.warehouseName ?? null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {editing === b.id && (
                    <div className="border-t border-border-subtle p-3">
                      <EditBatchForm b={b} unit={b.unit} onClose={() => setEditing(null)} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
