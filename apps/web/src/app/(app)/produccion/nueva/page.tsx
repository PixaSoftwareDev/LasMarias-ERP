'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { inventoryApi, productionApi, recipesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

interface MilkBatch {
  id: string;
  code: string;
  label: string; // texto a mostrar en el option (código + cantidad disponible)
  remainingQuantity: number | string;
}

interface MilkInputRow {
  batchId: string;
  liters: number;
}

type SourceKind = 'leche' | 'masa';

export default function NewProductionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, hydrated } = useAuth();
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: () => recipesApi.list() });

  // Origen de la materia prima a consumir.
  // - "leche": lotes de leche cruda en stock, filtrables por silo (CLAUDE.md §9).
  // - "masa": lotes intermedios en stock (ej. para elaborar mozzarella desde masa).
  const [source, setSource] = useState<SourceKind>('leche');
  // Silo de origen (opcional): filtra los lotes de leche disponibles a ese silo.
  const [siloId, setSiloId] = useState('');

  // Silos definidos, para el selector de origen.
  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: () => inventoryApi.listWarehouses() });
  const silos = useMemo(() => (warehousesQuery.data ?? []).filter((w) => w.kind === 'silo'), [warehousesQuery.data]);

  // Lotes de leche cruda disponibles (con su silo). Filtra por silo si se eligió uno.
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

  // Lotes de masa (categoría intermedio) en stock.
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

  const milkBatches = source === 'leche' ? milkBatchesFromReceptions : doughBatches;

  const [recipeId, setRecipeId] = useState('');
  const [notes, setNotes] = useState('');
  const [inputs, setInputs] = useState<MilkInputRow[]>([{ batchId: '', liters: 0 }]);

  // Al cambiar de origen, reseteamos las filas para no enviar lotes de la otra fuente.
  function changeSource(next: SourceKind) {
    if (next === source) return;
    setSource(next);
    setInputs([{ batchId: '', liters: 0 }]);
  }

  const open = useMutation({
    mutationFn: () =>
      productionApi.open({
        recipeId,
        operatorId: user!.id,
        startedAt: new Date().toISOString(),
        milkInputs: inputs.filter((i) => i.batchId && i.liters > 0),
        notes: notes || undefined,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      // Continuidad del pipeline: la orden recién abierta hay que CERRARLA cargando la
      // producción real. Llevamos directo a ese paso en vez de a la lista (CLAUDE.md §7).
      toast.success(`Orden ${r.code} abierta — ahora cargá la producción`);
      router.push(`/produccion/${r.id}/cerrar`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo abrir la orden. Probá de nuevo.'),
  });

  useEffect(() => {
    // Esperamos a que la sesión se hidrate desde el navegador antes de decidir
    // el redirect; si no, el primer render (user=null) patea al login por error.
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Abrir orden de producción"
        description="Elegí la receta, el origen (leche o masa) y los lotes a consumir. Las salidas reales se cargan al cerrar."        action={<Button asChild variant="ghost"><Link href="/produccion"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>}
      />

      <Card>
        <CardHeader><CardTitle>Datos</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <Field label="Receta" htmlFor="recipe" required>
            <select className="min-h-touch w-full rounded-md border border-border px-3" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
              <option value="">Elegí una receta</option>
              {recipes.data?.filter((r) => r.activeVersion).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>

          <Field
            label="¿De qué se parte?"
            htmlFor="source"
            required
            hint="Elaboración en dos pasos: primero leche → masa, después masa → mozzarella o queso. La masa es un producto intermedio que queda en stock con su propio costo."
          >
            <select className="min-h-touch w-full rounded-md border border-border px-3" value={source} onChange={(e) => changeSource(e.target.value as SourceKind)}>
              <option value="leche">Leche cruda (paso 1: hacer masa)</option>
              <option value="masa">Masa en stock (paso 2: hacer mozzarella o queso)</option>
            </select>
          </Field>

          {source === 'leche' && silos.length > 0 && (
            <Field label="Silo de origen" htmlFor="silo" hint="Filtrá los lotes de leche por silo. Vacío = todos los silos.">
              <select id="silo" className="min-h-touch w-full rounded-md border border-border px-3" value={siloId} onChange={(e) => { setSiloId(e.target.value); setInputs([{ batchId: '', liters: 0 }]); }}>
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
            {milkBatches.length === 0 && (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                {source === 'leche'
                  ? 'No hay lotes de leche disponibles. Cargá primero una recepción aceptada.'
                  : 'No hay lotes de masa en stock. Elaborá primero la masa o revisá el stock.'}
              </p>
            )}
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
              className="w-full rounded-md border border-border px-3 py-2"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push('/produccion')}>Cancelar</Button>
        <Button onClick={() => open.mutate()} loading={open.isPending} disabled={!recipeId || inputs.every((i) => !i.batchId)}>
          Abrir orden
        </Button>
      </div>
    </div>
  );
}
