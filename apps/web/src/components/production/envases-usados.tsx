'use client';

import { useQuery } from '@tanstack/react-query';
import { envaseSugerido, esEnvase } from '@lasmarias/shared-schemas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { recipesApi } from '@/features/api';

// Envases de la receta (baldes, bolsas, cajas) que usa esta tachada. Se cuentan enteros y
// la pantalla propone el número (17 baldes para 168 kg a 0,1). Si se usaron otros (se rompió
// uno, un formato va en otro envase), se corrige acá: eso se descuenta del stock y se costea.
// `value`: productId → lo que escribió el operario ('' = el sugerido).
export function EnvasesUsados({
  recipeId,
  recipeVersionId,
  kg,
  bultos,
  value,
  onChange,
}: {
  recipeId: string;
  recipeVersionId: string;
  kg: number;
  bultos: number;
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const recipe = useQuery({ queryKey: ['recipe', recipeId], queryFn: () => recipesApi.get(recipeId) });
  const version = recipe.data?.versions?.find((v) => v.id === recipeVersionId);
  const envases = (version?.ingredients ?? []).filter(esEnvase);
  if (envases.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Envases</CardTitle>
        <p className="text-sm text-foreground-muted">Se cuentan enteros. Cambialo solo si usaste otra cantidad.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {envases.map((ing) => {
          const sugerido = envaseSugerido(ing, kg, bultos);
          const sinBultos = ing.basis === 'per_bulto' && bultos === 0;
          return (
            <Field
              key={ing.productId}
              label={ing.productName}
              htmlFor={`envase-${ing.productId}`}
              hint={sinBultos ? 'Va uno por bulto: cargá los bultos arriba.' : `Según la receta: ${sugerido}`}
            >
              <Input
                id={`envase-${ing.productId}`}
                type="number"
                inputMode="numeric"
                step="1"
                min={0}
                placeholder={String(sugerido)}
                value={value[ing.productId] ?? ''}
                onChange={(e) => onChange({ ...value, [ing.productId]: e.target.value })}
              />
            </Field>
          );
        })}
      </CardContent>
    </Card>
  );
}

// Lo que se manda al cerrar: solo los envases corregidos (los vacíos usan la cuenta de la receta).
export function envasesCorregidos(value: Record<string, string>) {
  return Object.entries(value)
    .filter(([, v]) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0)
    .map(([productId, v]) => ({ productId, quantity: Number(v) }));
}
