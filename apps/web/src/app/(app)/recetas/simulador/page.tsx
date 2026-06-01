'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Boxes, Calculator, Gauge, Recycle, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { recipesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import type { RecipeSimulationResult } from '@lasmarias/shared-schemas';

export default function SimulatorPage() {
  const recipes = useQuery({ queryKey: ['recipes'], queryFn: () => recipesApi.list() });
  const [recipeId, setRecipeId] = useState('');
  const [liters, setLiters] = useState(1000);
  const [fat, setFat] = useState<number | undefined>(undefined);
  const [protein, setProtein] = useState<number | undefined>(undefined);

  const simulate = useMutation<RecipeSimulationResult, Error>({
    mutationFn: () =>
      recipesApi.simulate({ recipeId, liters: Number(liters), fatPercent: fat, proteinPercent: protein }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al simular'),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Simulador de rendimiento"
        description="Probá una receta sin abrir orden real."      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-primary-700" aria-hidden="true" />Parámetros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Receta" htmlFor="recipeId" required>
            <select className="flex min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
              <option value="">Elegí una receta</option>
              {recipes.data?.filter((r) => r.activeVersion).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Field label="Litros de leche" htmlFor="liters" required>
            <Input type="number" inputMode="numeric" value={liters} onChange={(e) => setLiters(Number(e.target.value))} />
          </Field>
          <Field label="Grasa real (%)" htmlFor="fat" hint="Dejá en blanco para usar el valor base de la receta">
            <Input type="number" step="0.01" inputMode="decimal" value={fat ?? ''} onChange={(e) => setFat(e.target.value === '' ? undefined : Number(e.target.value))} />
          </Field>
          <Field label="Proteína real (%)" htmlFor="protein">
            <Input type="number" step="0.01" inputMode="decimal" value={protein ?? ''} onChange={(e) => setProtein(e.target.value === '' ? undefined : Number(e.target.value))} />
          </Field>
          <div className="sm:col-span-2">
            <Button onClick={() => simulate.mutate()} loading={simulate.isPending} disabled={!recipeId}>
              <Calculator className="h-4 w-4" /> Calcular
            </Button>
          </div>
        </CardContent>
      </Card>

      {simulate.data && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-primary-700" aria-hidden="true" />Resultado</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Números clave en chips compactos (consistente con el Home). */}
            <div className="flex flex-wrap gap-3">
              <div className="flex min-w-[12rem] flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-secondary-50 text-secondary-700">
                  <Gauge className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">Rendimiento aplicado</span>
                  <span className="block font-display text-lg font-bold tracking-tight text-foreground">{simulate.data.appliedYieldKgPerLiter.toFixed(4)} <span className="text-sm font-normal text-foreground-muted">kg/L</span></span>
                </span>
              </div>
              <div className="flex min-w-[12rem] flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <Boxes className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">Producción esperada</span>
                  <span className="block font-display text-lg font-bold tracking-tight text-foreground">{simulate.data.expectedYieldKg.toFixed(1)} <span className="text-sm font-normal text-foreground-muted">kg</span></span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Boxes className="h-4 w-4 text-foreground-muted" aria-hidden="true" /> Insumos requeridos
                </p>
                {simulate.data.ingredients.length === 0 ? (
                  <p className="text-sm text-foreground-muted">Sin insumos en la receta.</p>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {simulate.data.ingredients.map((i, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate text-foreground">{i.productName}</span>
                        <span className="flex-shrink-0 font-medium text-foreground">{i.quantity} {i.unit}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Recycle className="h-4 w-4 text-foreground-muted" aria-hidden="true" /> Subproductos esperados
                </p>
                {simulate.data.byproducts.length === 0 ? (
                  <p className="text-sm text-foreground-muted">Sin subproductos.</p>
                ) : (
                  <ul className="divide-y divide-border-subtle">
                    {simulate.data.byproducts.map((b, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate text-foreground">{b.name}</span>
                        <span className="flex-shrink-0 font-medium text-foreground">{b.expectedQuantity} {b.unit}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
