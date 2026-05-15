'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calculator } from 'lucide-react';
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
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Simulador de rendimiento"
        description="Probá una receta sin abrir orden real."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { href: '/recetas', label: 'Recetas' }, { label: 'Simulador' }]}
      />

      <Card>
        <CardHeader><CardTitle>Parámetros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Receta" htmlFor="recipeId" required>
            <select className="min-h-touch w-full rounded-md border border-border px-3" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
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
          <CardHeader><CardTitle>Resultado</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-foreground-muted">Rendimiento aplicado</p>
              <p className="text-2xl font-bold">{simulate.data.appliedYieldKgPerLiter.toFixed(4)} <span className="text-sm font-normal text-foreground-muted">kg/L</span></p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm text-foreground-muted">Producción esperada</p>
              <p className="text-2xl font-bold">{simulate.data.expectedYieldKg.toFixed(1)} <span className="text-sm font-normal text-foreground-muted">kg</span></p>
            </div>
            <div className="sm:col-span-3">
              <p className="mb-2 text-sm font-medium">Insumos requeridos</p>
              {simulate.data.ingredients.length === 0 ? (
                <p className="text-sm text-foreground-muted">— sin insumos en la receta —</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {simulate.data.ingredients.map((i, idx) => (
                    <li key={idx}>• {i.productName}: <strong>{i.quantity}</strong> {i.unit}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="sm:col-span-3">
              <p className="mb-2 text-sm font-medium">Subproductos esperados</p>
              {simulate.data.byproducts.length === 0 ? (
                <p className="text-sm text-foreground-muted">— sin subproductos —</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {simulate.data.byproducts.map((b, idx) => (
                    <li key={idx}>• {b.name}: <strong>{b.expectedQuantity}</strong> {b.unit}</li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
