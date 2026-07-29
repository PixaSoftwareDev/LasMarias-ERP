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

  // Solo las órdenes abiertas se pueden editar; una cerrada ya movió stock y costo.
  const editable = order.status === 'open' || order.status === 'in_progress';
  if (!editable) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Orden ${order.code}`} description="Esta orden ya está cerrada." action={<Button asChild variant="ghost"><Link href="/produccion"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>} />
        <Card>
          <CardContent className="py-6 text-sm text-foreground-muted">
            La orden <span className="font-mono">{order.code}</span> ya está cerrada, así que no se puede editar. Si algo
            quedó mal, borrala desde la lista y volvé a cargarla.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Editar orden ${order.code}`}
        description="Corregí lo que se haya cargado mal. La orden sigue abierta: no se consumió stock todavía."
        action={<Button asChild variant="ghost"><Link href="/produccion"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>}
      />

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

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push('/produccion')}>Cancelar</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!recipeId || !startedDate || inputs.every((i) => !i.batchId)}>
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
