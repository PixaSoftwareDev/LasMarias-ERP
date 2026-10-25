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
import { inventoryApi, productionApi, productsApi, recipesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { DobleCostoAviso, ReprocesoRows, SinCostoAviso, useStockSources, type InputRow } from '@/components/production/stock-inputs';
import { OutputFields } from '@/components/production/output-fields';

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

// 'otro' = un subproducto en stock como origen (crema cruda → crema pasteurizada, suero → ricota).
type SourceKind = 'leche' | 'masa' | 'otro';

const SELECT_CLASS =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1';

// De qué tipo es cada lote de la orden, por la categoría de su producto (viene en el detalle
// de la orden). Sin categoría = leche cruda; las órdenes viejas sin el dato se resuelven por
// el código (la leche es LM-LC-…).
type InputKind = SourceKind | 'reproceso';
function inputKind(mi: { batchCode: string; category?: string }): InputKind {
  if (mi.category === 'queso') return 'reproceso';
  if (mi.category === 'subproducto') return 'otro';
  if (mi.category === 'intermedio') return 'masa';
  return mi.batchCode.startsWith('LM-LC') ? 'leche' : 'masa';
}
function detectSource(milkInputs: { batchCode: string; category?: string }[]): SourceKind {
  const kinds = milkInputs.map(inputKind);
  if (kinds.includes('otro')) return 'otro';
  if (kinds.includes('masa') || kinds.includes('reproceso')) return 'masa';
  return 'leche';
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

  // Lotes en stock que pueden ser origen: masa, queso para reproceso y subproductos (crema).
  const stock = useStockSources();
  const availableBatches: MilkBatch[] =
    source === 'leche' ? milkBatchesFromReceptions : source === 'masa' ? stock.masa : stock.subproductos;

  // Los lotes de la orden que NO están en la lista de disponibles se agregan igual, para
  // poder verlos y cambiarlos. Pero hay dos motivos muy distintos por los que un lote no
  // aparece, y confundirlos fue lo que hizo perder tiempo con la orden OP-20260729-0002:
  //
  //   a) esta orden lo reservó → su leche está descontada y guardada para ella. Todo bien.
  //   b) el lote quedó en CERO porque se lo llevó OTRA orden → esa leche ya no existe y la
  //      orden no va a poder cerrar hasta que se elija otro lote.
  //
  // La diferencia la da `milkReserved` (si la orden tiene o no su salida de leche registrada).
  // Antes se mostraba siempre "reservado en esta orden", que en el caso (b) es mentira y
  // tapaba justamente el problema que había que ver.
  const reservada = orderQuery.data?.milkReserved !== false;
  const mergeOrderBatches = <T extends MilkBatch>(available: T[], kind: InputKind): MilkBatch[] => {
    const merged: MilkBatch[] = [...available];
    for (const mi of orderQuery.data?.milkInputs ?? []) {
      if (inputKind(mi) !== kind) continue;
      if (merged.some((b) => b.id === mi.batchId)) continue;
      merged.push({
        id: mi.batchId,
        code: mi.batchCode,
        remainingQuantity: mi.liters,
        label: reservada
          ? `${mi.batchCode} (reservado en esta orden)`
          : `${mi.batchCode} — SIN LECHE: se la llevó otra orden`,
      });
    }
    return merged;
  };
  const milkBatches = mergeOrderBatches(availableBatches, source);
  const reprocesoOptions = mergeOrderBatches(stock.reproceso, 'reproceso').map((b) => ({
    productId: '',
    unitCost: 0,
    ...b,
    remainingQuantity: Number(b.remainingQuantity),
  }));

  // Lotes de la orden que quedaron sin leche por culpa de otra orden: hay que avisarlo
  // arriba de todo, porque si no el operario guarda igual y el error recién aparece al cerrar.
  const lotesSinLeche = useMemo(() => {
    if (reservada) return [];
    return (orderQuery.data?.milkInputs ?? []).filter(
      (mi) => ![...availableBatches, ...stock.reproceso].some((b) => b.id === mi.batchId),
    );
  }, [availableBatches, stock.reproceso, orderQuery.data, reservada]);

  const [recipeId, setRecipeId] = useState('');
  const [startedDate, setStartedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [inputs, setInputs] = useState<MilkInputRow[]>([{ batchId: '', liters: 0 }]);
  // Reproceso (queso que vuelve a fundirse con la masa): solo con origen masa.
  const [reprocesos, setReprocesos] = useState<InputRow[]>([]);
  const [seeded, setSeeded] = useState(false);

  // Solo se usan al editar una orden CERRADA: producción real (kg y bultos por producto),
  // cámara destino y rendimiento esperado. Al guardar se revierte el stock y se vuelve a
  // cerrar recalculando. Bultos y cámara se precargan de la orden: si no, al guardar el
  // lote nuevo los perdía (bug corregido oct 2026).
  const [quantities, setQuantities] = useState<Record<string, number | undefined>>({});
  const [bultos, setBultos] = useState<Record<string, number | undefined>>({});
  const [warehouseId, setWarehouseId] = useState('');
  const [expectedYield, setExpectedYield] = useState('');

  // Ficha de cada producto: define si se cuenta por bultos y cuántos kg trae uno.
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const productById = useMemo(
    () => new Map((productsQuery.data ?? []).map((p) => [p.id, p])),
    [productsQuery.data],
  );

  const wasClosed = orderQuery.data?.status === 'closed';

  // Precargar el formulario con los datos de la orden una sola vez, cuando llega del servidor.
  useEffect(() => {
    const order = orderQuery.data;
    if (!order || seeded) return;
    setRecipeId(order.recipeId);
    setStartedDate(order.startedAt.slice(0, 10));
    setNotes(order.notes ?? '');
    setSource(detectSource(order.milkInputs));
    const principales = order.milkInputs.filter((mi) => inputKind(mi) !== 'reproceso');
    setInputs(
      principales.length
        ? principales.map((mi) => ({ batchId: mi.batchId, liters: mi.liters }))
        : [{ batchId: '', liters: 0 }],
    );
    setReprocesos(
      order.milkInputs
        .filter((mi) => inputKind(mi) === 'reproceso')
        .map((mi) => ({ batchId: mi.batchId, liters: mi.liters })),
    );
    // Si estaba cerrada, precargar la producción real (kg y bultos), la cámara y el esperado
    // para no perderlos al recalcular.
    if (order.status === 'closed') {
      setQuantities(Object.fromEntries(order.actualOutputs.map((o) => [o.productId, o.quantity])));
      setBultos(
        Object.fromEntries(
          order.actualOutputs.filter((o) => o.bultos != null).map((o) => [o.productId, o.bultos]),
        ),
      );
      setWarehouseId(order.warehouseId ?? '');
      const std = order.costBreakdown?.estandar?.rendimiento;
      if (std) setExpectedYield(std);
    }
    setSeeded(true);
  }, [orderQuery.data, seeded]);

  function changeSource(next: SourceKind) {
    if (next === source) return;
    setSource(next);
    setInputs([{ batchId: '', liters: 0 }]);
    setReprocesos([]);
  }

  // Todo lo que consume la orden: los lotes del origen elegido + el reproceso (si es masa).
  const allInputs = [...inputs, ...(source === 'masa' ? reprocesos : [])].filter((i) => i.batchId && i.liters > 0);

  const save = useMutation({
    mutationFn: () =>
      productionApi.update(orderId, {
        recipeId,
        // Conservamos el operario original de la orden.
        operatorId: orderQuery.data!.operatorId,
        startedAt: new Date(`${startedDate}T12:00:00`).toISOString(),
        milkInputs: allInputs,
        notes: notes || undefined,
        // Solo si la orden estaba cerrada: mandar la producción real para recalcular el costo.
        ...(wasClosed
          ? {
              actualOutputs: (orderQuery.data?.expectedOutputs ?? []).map((o) => ({
                productId: o.productId,
                quantity: Number(quantities[o.productId] ?? 0),
                bultos: bultos[o.productId] != null ? Number(bultos[o.productId]) : undefined,
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
            : reservada
              ? 'Corregí lo que se haya cargado mal. La leche de esta orden ya está reservada: si cambiás de lote, vuelve al silo la vieja y se descuenta la nueva.'
              : 'Corregí lo que se haya cargado mal. Ojo: esta orden todavía no tiene la leche reservada.'
        }
        action={<Button asChild variant="ghost"><Link href="/produccion"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>}
      />

      {/* Aviso claro cuando los lotes de la orden se quedaron sin leche: es el caso que hacía
          que la orden no cerrara y que antes no se veía por ningún lado. */}
      {lotesSinLeche.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">
            Esta orden no va a poder cerrarse: {lotesSinLeche.length === 1 ? 'uno de sus lotes' : `${lotesSinLeche.length} de sus lotes`} ya no tiene leche.
          </p>
          <p className="mt-1">
            {lotesSinLeche.map((mi) => `${mi.batchCode} (pide ${mi.liters.toLocaleString('es-AR')} L)`).join(' · ')}
          </p>
          <p className="mt-1">
            Esa leche la consumió otra orden. Elegí un lote que tenga saldo y guardá.
          </p>
        </div>
      )}

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
              {recipes.data?.filter((r) => (r.isActive || r.id === recipeId) && r.activeVersion).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>

          <Field
            label="¿Con qué se elabora?"
            htmlFor="source"
            required
            hint="Primero leche → masa; después masa (más reproceso, si hay) → mozzarella o queso. La crema cruda se pasteuriza eligiendo «Crema u otro subproducto»."
          >
            <select className={SELECT_CLASS} value={source} onChange={(e) => changeSource(e.target.value as SourceKind)}>
              <option value="leche">Leche cruda (paso 1: hacer masa)</option>
              <option value="masa">Masa en stock (paso 2: hacer mozzarella o queso)</option>
              <option value="otro">Crema u otro subproducto en stock (ej: pasteurizar crema)</option>
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
              <p className="text-sm font-medium">
                {source === 'leche' ? 'Lotes de leche a consumir' : source === 'masa' ? 'Lotes de masa a consumir' : 'Lotes a consumir'}
              </p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setInputs([...inputs, { batchId: '', liters: 0 }])}>
                <Plus className="h-4 w-4" /> Agregar lote
              </Button>
            </div>
            <div className="space-y-2">
              {inputs.map((row, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr),140px,auto]">
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

          {source === 'masa' && (
            <ReprocesoRows rows={reprocesos} onChange={setReprocesos} options={reprocesoOptions} />
          )}

          {source !== 'leche' && (
            <SinCostoAviso
              batchIds={allInputs.map((i) => i.batchId)}
              options={[...stock.masa, ...stock.reproceso, ...stock.subproductos]}
            />
          )}

          <DobleCostoAviso
            ingredients={recipes.data?.find((r) => r.id === recipeId)?.activeVersion?.ingredients ?? []}
            originProductIds={[...stock.masa, ...stock.subproductos]
              .filter((o) => inputs.some((i) => i.batchId === o.id))
              .map((o) => o.productId)}
            products={stock.products}
          />

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
              <OutputFields
                key={o.productId}
                output={o}
                product={productById.get(o.productId)}
                kg={quantities[o.productId]}
                bultos={bultos[o.productId]}
                placeholder="Ej: 120"
                onKg={(v) => setQuantities((q) => ({ ...q, [o.productId]: v }))}
                onBultos={(v) => setBultos((b) => ({ ...b, [o.productId]: v }))}
              />
            ))}

            {byproductOutputs.length > 0 && (
              <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
                <p className="text-sm font-medium text-foreground">Subproductos (opcional)</p>
                {byproductOutputs.map((o) => (
                  <OutputFields
                    key={o.productId}
                    output={o}
                    product={productById.get(o.productId)}
                    kg={quantities[o.productId]}
                    bultos={bultos[o.productId]}
                    placeholder="Ej: 15"
                    onKg={(v) => setQuantities((q) => ({ ...q, [o.productId]: v }))}
                    onBultos={(v) => setBultos((b) => ({ ...b, [o.productId]: v }))}
                  />
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
