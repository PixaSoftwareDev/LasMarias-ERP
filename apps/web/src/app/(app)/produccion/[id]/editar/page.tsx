'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { TableSkeleton } from '@/components/ui/skeleton';
import { inventoryApi, productionApi, recipesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

interface MilkBatch {
  id: string;
  code: string;
  label: string;
  remainingQuantity: number | string;
}

interface MilkInputRow {
  batchId: string;
  liters: number;
}

type SourceKind = 'leche' | 'masa';

const SELECT_CLASS =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1';

// La masa (producto intermedio) se guarda con código LM-PP-…; la leche cruda con LM-LC-….
// Así detectamos con qué se elaboró la orden para mostrar el origen correcto al editar.
function detectSource(batchCode: string | undefined): SourceKind {
  return batchCode?.startsWith('LM-LC') === false ? 'masa' : 'leche';
}

export default function EditProductionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const queryClient = useQueryClient();
  const { user, hydrated } = useAuth();

  const orderQuery = useQuery({ queryKey: ['production-order', orderId], queryFn: () => productionApi.get(orderId) });
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: () => recipesApi.list() });

  const [source, setSource] = useState<SourceKind>('leche');
  const [siloId, setSiloId] = useState('');

  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: () => inventoryApi.listWarehouses() });
  const silos = useMemo(() => (warehousesQuery.data ?? []).filter((w) => w.kind === 'silo'), [warehousesQuery.data]);

  const milkBatchesQuery = useQuery({
    queryKey: ['milk-batches', siloId],
    queryFn: () => inventoryApi.milkBatches(siloId || undefined),
  });
  const milkBatchesFromReceptions: MilkBatch[] = useMemo(
    () =>
      (milkBatchesQuery.data ?? []).map((b) => ({
        id: b.id,
        code: b.code,
        remainingQuantity: b.remainingQuantity,
        label: `${b.code} (${b.remainingQuantity} ${b.unit})${b.warehouseName ? ` · ${b.warehouseName}` : ''}`,
      })),
    [milkBatchesQuery.data],
  );

  const doughBatchesQuery = useQuery({
    queryKey: ['consumable-batches', 'intermedio'],
    queryFn: () => inventoryApi.consumableBatches('intermedio'),
  });
  const doughBatches: MilkBatch[] = useMemo(
    () =>
      (doughBatchesQuery.data ?? []).map((b) => ({
        id: b.id,
        code: b.code,
        remainingQuantity: b.remainingQuantity,
        label: `${b.code} · ${b.productName} (${b.remainingQuantity} ${b.unit})`,
      })),
    [doughBatchesQuery.data],
  );

  const availableBatches = source === 'leche' ? milkBatchesFromReceptions : doughBatches;

  // Los lotes que la orden ya tiene reservados están "en proceso" y NO aparecen en la lista de
  // disponibles (que solo trae los "activos"). Los sumamos como opción para poder mantenerlos.
  const milkBatches: MilkBatch[] = useMemo(() => {
    const merged = [...availableBatches];
    for (const mi of orderQuery.data?.milkInputs ?? []) {
      if (detectSource(mi.batchCode) !== source) continue;
      if (merged.some((b) => b.id === mi.batchId)) continue;
      merged.push({
        id: mi.batchId,
        code: mi.batchCode,
        remainingQuantity: mi.liters,
        label: `${mi.batchCode} (reservado en esta orden)`,
      });
    }
    return merged;
  }, [availableBatches, orderQuery.data, source]);

  const [recipeId, setRecipeId] = useState('');
  const [startedDate, setStartedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [inputs, setInputs] = useState<MilkInputRow[]>([{ batchId: '', liters: 0 }]);
  const [seeded, setSeeded] = useState(false);

  // Solo se usan al editar una orden CERRADA: producción real (kg por producto), cámara destino
  // y rendimiento esperado. Al guardar se revierte el stock y se vuelve a cerrar recalculando.
  const [quantities, setQuantities] = useState<Record<string, number | undefined>>({});
  const [warehouseId, setWarehouseId] = useState('');
  const [expectedYield, setExpectedYield] = useState('');

  const wasClosed = orderQuery.data?.status === 'closed';

  // Precargar el formulario con los datos de la orden una sola vez, cuando llega del servidor.
  useEffect(() => {
    const order = orderQuery.data;
    if (!order || seeded) return;
    setRecipeId(order.recipeId);
    setStartedDate(order.startedAt.slice(0, 10));
    setNotes(order.notes ?? '');
    setSource(detectSource(order.milkInputs[0]?.batchCode));
    setInputs(
      order.milkInputs.length
        ? order.milkInputs.map((mi) => ({ batchId: mi.batchId, liters: mi.liters }))
        : [{ batchId: '', liters: 0 }],
    );
    // Si estaba cerrada, precargar la producción real y el esperado para no perderlos al recalcular.
    if (order.status === 'closed') {
      setQuantities(Object.fromEntries(order.actualOutputs.map((o) => [o.productId, o.quantity])));
      const std = order.costBreakdown?.estandar?.rendimiento;
      if (std) setExpectedYield(std);
    }
    setSeeded(true);
  }, [orderQuery.data, seeded]);

  function changeSource(next: SourceKind) {
    if (next === source) return;
    setSource(next);
    setInputs([{ batchId: '', liters: 0 }]);
  }

  const save = useMutation({
    mutationFn: () =>
      productionApi.update(orderId, {
        recipeId,
        // Conservamos el operario original de la orden.
        operatorId: orderQuery.data!.operatorId,
        startedAt: new Date(`${startedDate}T12:00:00`).toISOString(),
        milkInputs: inputs.filter((i) => i.batchId && i.liters > 0),
        notes: notes || undefined,
        // Solo si la orden estaba cerrada: mandar la producción real para recalcular el costo.
        ...(wasClosed
          ? {
              actualOutputs: (orderQuery.data?.expectedOutputs ?? []).map((o) => ({
                productId: o.productId,
                quantity: Number(quantities[o.productId] ?? 0),
                isPrincipal: o.isPrincipal,
              })),
              warehouseId: warehouseId || undefined,
              expectedYieldKgPerLiter:
                expectedYield !== '' && Number(expectedYield) > 0 ? Number(expectedYield) : undefined,
            }
          : {}),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries();
      toast.success(`Orden ${r.code} actualizada`);
      router.push('/produccion');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar la orden. Probá de nuevo.'),
  });

  useEffect(() => {
    if (hydrated && !user) router.replace('/login');
  }, [hydrated, user, router]);

  function removeInput(idx: number) {
    const prev = inputs;
    const removed = inputs[idx];
    const next = inputs.filter((_, i) => i !== idx);
    setInputs(next.length ? next : [{ batchId: '', liters: 0 }]);
    if (removed?.batchId) {
      toast('Lote quitado de la orden', {
        action: { label: 'Deshacer', onClick: () => setInputs(prev) },
      });
    }
  }

  if (orderQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Editar orden" description="Cargando la orden…" />
        <TableSkeleton />
      </div>
    );
  }

  const order = orderQuery.data;
  if (!order) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Editar orden" description="No encontramos esta orden." action={<Button asChild variant="ghost"><Link href="/produccion"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>} />
      </div>
    );
  }

  // Una orden cancelada no se edita. Las abiertas y las cerradas sí (la cerrada revierte y recalcula).
  if (order.status === 'cancelled') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Orden ${order.code}`} description="Esta orden fue cancelada." action={<Button asChild variant="ghost"><Link href="/produccion"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>} />
        <Card>
          <CardContent className="py-6 text-sm text-foreground-muted">
            La orden <span className="font-mono">{order.code}</span> está cancelada, así que no se puede editar.
          </CardContent>
        </Card>
      </div>
    );
  }

  const principalOutputs = (order.expectedOutputs ?? []).filter((o) => o.isPrincipal);
  const byproductOutputs = (order.expectedOutputs ?? []).filter((o) => !o.isPrincipal);
  // Para una orden cerrada necesitamos al menos un kg de producto principal para poder recalcular.
  const closedReady = !wasClosed || principalOutputs.some((o) => Number(quantities[o.productId] ?? 0) > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Editar orden ${order.code}`}
        description={
          wasClosed
            ? 'Esta orden está cerrada. Al guardar se revierte su stock y se vuelve a cerrar recalculando el costo.'
            : 'Corregí lo que se haya cargado mal. La orden sigue abierta: no se consumió stock todavía.'
        }
        action={<Button asChild variant="ghost"><Link href="/produccion"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>}
      />

      {wasClosed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Esta orden ya generó stock y su costo. Al guardar se devuelve al stock lo que consumió, se
          borran los lotes que produjo y se vuelve a cerrar con los datos nuevos.{' '}
          <span className="font-medium">Si algún lote producido ya se vendió o se usó en otra elaboración, no se podrá editar.</span>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Datos</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <Field
            label="Fecha de elaboración"
            htmlFor="startedDate"
            required
            hint="El número de lote de la orden no cambia aunque corrijas la fecha."
          >
            <Input
              id="startedDate"
              type="date"
              value={startedDate}
              onChange={(e) => setStartedDate(e.target.value)}
            />
          </Field>

          <Field label="Receta" htmlFor="recipe" required>
            <select className={SELECT_CLASS} value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
              <option value="">Elegí una receta</option>
              {recipes.data?.filter((r) => r.activeVersion).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>

          <Field
            label="¿Con qué se elabora?"
            htmlFor="source"
            required
            hint="Elaboración en dos pasos: primero leche → masa, después masa → mozzarella o queso."
          >
            <select className={SELECT_CLASS} value={source} onChange={(e) => changeSource(e.target.value as SourceKind)}>
              <option value="leche">Leche cruda (paso 1: hacer masa)</option>
              <option value="masa">Masa en stock (paso 2: hacer mozzarella o queso)</option>
            </select>
          </Field>

          {source === 'leche' && silos.length > 0 && (
            <Field label="Silo de origen" htmlFor="silo" hint="Filtro opcional. Dejá 'Todos los silos' para combinar leche de varios tanques.">
              <select id="silo" className={SELECT_CLASS} value={siloId} onChange={(e) => setSiloId(e.target.value)}>
                <option value="">Todos los silos</option>
                {silos.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">{source === 'leche' ? 'Lotes de leche a consumir' : 'Lotes de masa a consumir'}</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setInputs([...inputs, { batchId: '', liters: 0 }])}>
                <Plus className="h-4 w-4" /> Agregar lote
              </Button>
            </div>
            <div className="space-y-2">
              {inputs.map((row, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,140px,auto]">
                  <select
                    className="min-h-touch rounded-md border border-border px-3"
                    value={row.batchId}
                    onChange={(e) => {
                      const next = [...inputs]; next[idx]!.batchId = e.target.value; setInputs(next);
                    }}
                  >
                    <option value="">Elegí un lote</option>
                    {milkBatches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                  <Input type="number" inputMode="decimal" step="0.1" placeholder={source === 'leche' ? 'Litros' : 'Cantidad'} value={row.liters || ''} onChange={(e) => {
                    const next = [...inputs]; next[idx]!.liters = Number(e.target.value); setInputs(next);
                  }} />
                  <button
                    type="button"
                    onClick={() => removeInput(idx)}
                    aria-label="Quitar lote"
                    className="flex min-h-touch min-w-touch items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Field label="Notas" htmlFor="notes">
            <textarea
              id="notes"
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {wasClosed && (
        <Card>
          <CardHeader>
            <CardTitle>Producción real</CardTitle>
            <p className="text-sm text-foreground-muted">
              Los kilos que realmente se obtuvieron. Con esto se recalcula el costo al volver a cerrar la orden.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {principalOutputs.map((o) => (
              <Field
                key={o.productId}
                label={`${o.productName} — kg producidos`}
                htmlFor={`out-${o.productId}`}
                hint={o.quantity > 0 ? `Esperado: ${o.quantity.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${o.unit}` : undefined}
              >
                <Input
                  id={`out-${o.productId}`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={0}
                  placeholder="Ej: 120"
                  value={quantities[o.productId] ?? ''}
                  onChange={(e) =>
                    setQuantities((q) => ({ ...q, [o.productId]: e.target.value === '' ? undefined : Number(e.target.value) }))
                  }
                />
              </Field>
            ))}

            {byproductOutputs.length > 0 && (
              <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
                <p className="text-sm font-medium text-foreground">Subproductos (opcional)</p>
                {byproductOutputs.map((o) => (
                  <Field
                    key={o.productId}
                    label={`${o.productName} — ${o.unit} obtenidos`}
                    htmlFor={`out-${o.productId}`}
                    hint={o.quantity > 0 ? `Esperado: ${o.quantity.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${o.unit}` : undefined}
                  >
                    <Input
                      id={`out-${o.productId}`}
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={0}
                      placeholder="Ej: 15"
                      value={quantities[o.productId] ?? ''}
                      onChange={(e) =>
                        setQuantities((q) => ({ ...q, [o.productId]: e.target.value === '' ? undefined : Number(e.target.value) }))
                      }
                    />
                  </Field>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-2">
              <Field label="Rendimiento esperado (kg por litro)" htmlFor="expectedYield" hint="Opcional. Habilita el real vs esperado.">
                <Input
                  id="expectedYield"
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min={0}
                  placeholder="Ej: 0.10"
                  value={expectedYield}
                  onChange={(e) => setExpectedYield(e.target.value)}
                />
              </Field>
              <Field label="Cámara / sector destino" htmlFor="warehouseId" hint="Dónde se guardan los lotes de producto. Opcional.">
                <select id="warehouseId" className={SELECT_CLASS} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {(warehousesQuery.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push('/produccion')}>Cancelar</Button>
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!recipeId || !startedDate || inputs.every((i) => !i.batchId) || !closedReady}
        >
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
