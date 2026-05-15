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
import { productionApi, recipesApi } from '@/features/api';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

interface MilkBatch {
  id: string;
  code: string;
  remainingQuantity: number | string;
  status: string;
}

interface MilkInputRow {
  batchId: string;
  liters: number;
}

export default function NewProductionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: () => recipesApi.list() });

  // Lotes de leche disponibles. Como no tenemos endpoint dedicado, usamos un workaround:
  // pegar al endpoint de recepciones aceptadas y mapearlas a sus batchIds.
  // Para MVP, asumimos que el operario sabe el batchId — en un próximo iter, agregar /api/batches?type=milk
  const receptions = useQuery({
    queryKey: ['receptions-for-production'],
    queryFn: () => api<Array<{ id: string; code: string; liters: number; status: string; batchId?: string }>>('/api/milk-receptions'),
  });
  const milkBatches: MilkBatch[] = useMemo(
    () =>
      (receptions.data ?? [])
        .filter((r) => r.status === 'aceptada' && r.batchId)
        .map((r) => ({ id: r.batchId!, code: r.code, remainingQuantity: r.liters, status: r.status })),
    [receptions.data],
  );

  const [recipeId, setRecipeId] = useState('');
  const [notes, setNotes] = useState('');
  const [inputs, setInputs] = useState<MilkInputRow[]>([{ batchId: '', liters: 0 }]);

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
      toast.success(`Orden ${r.code} abierta`);
      router.push('/produccion');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al abrir orden'),
  });

  useEffect(() => {
    if (!user) router.replace('/login');
  }, [user, router]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Abrir orden de producción"
        description="Elegí la receta y los lotes de leche a consumir. Las salidas reales se cargan al cerrar."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { href: '/produccion', label: 'Producción' }, { label: 'Abrir' }]}
        action={<Button asChild variant="ghost"><Link href="/produccion"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>}
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

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Lotes de leche a consumir</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setInputs([...inputs, { batchId: '', liters: 0 }])}>
                <Plus className="h-4 w-4" /> Agregar lote
              </Button>
            </div>
            {milkBatches.length === 0 && (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                No hay lotes de leche disponibles. Cargá primero una recepción aceptada.
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
                    {milkBatches.map((b) => <option key={b.id} value={b.id}>{b.code} ({b.remainingQuantity} L)</option>)}
                  </select>
                  <Input type="number" inputMode="decimal" step="0.1" placeholder="Litros" value={row.liters || ''} onChange={(e) => {
                    const next = [...inputs]; next[idx]!.liters = Number(e.target.value); setInputs(next);
                  }} />
                  <Button type="button" size="sm" variant="ghost" onClick={() => setInputs(inputs.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
