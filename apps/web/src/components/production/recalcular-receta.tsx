'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { esEnvase, type ProductionOrder, type ProductionRecalcPreview } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { productionApi, recipesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { formatMoney } from '@/lib/utils';

// "Recalcular con la receta corregida" (pedido del dueño, 09/11/2026). Una orden cerrada queda
// con la receta con que se hizo. Si esa receta tenía un error y ya se corrigió (versión nueva),
// acá se vuelve a calcular el costo con la receta corregida. Cambia el costo y los insumos
// descontados; los kg, los lotes producidos y las ventas quedan igual. Aparece si la receta tiene
// una versión más nueva, o si la orden contó envases partidos (16,8 baldes: antes del 13/11/2026).

const money = (s: string | null) => (s == null ? '—' : formatMoney(Number(s)));
const qty = (s: string) => Number(s).toLocaleString('es-AR', { maximumFractionDigits: 4 });

export function RecalcularReceta({ order, onDone }: { order: ProductionOrder; onDone: (o: ProductionOrder) => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const puede = user?.role === 'admin' || user?.role === 'gerente';
  const [preview, setPreview] = useState<ProductionRecalcPreview | null>(null);

  const recipe = useQuery({
    queryKey: ['recipe', order.recipeId],
    queryFn: () => recipesApi.get(order.recipeId),
    enabled: puede,
  });

  const ver = useMutation({
    mutationFn: () => productionApi.recalcPreview(order.id),
    onSuccess: setPreview,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo calcular. Probá de nuevo.'),
  });

  const aplicar = useMutation({
    mutationFn: () => productionApi.recalcApply(order.id),
    onSuccess: (o) => {
      queryClient.invalidateQueries();
      toast.success(`Listo: el costo de ${o.code} quedó calculado con la receta corregida.`);
      setPreview(null);
      onDone(o);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar. Probá de nuevo.'),
  });

  const activa = recipe.data?.activeVersion;
  const recetaNueva = !!activa && activa.id !== order.recipeVersionId;
  const usada = recipe.data?.versions?.find((v) => v.id === order.recipeVersionId);
  const envasesPartidos = (usada?.ingredients ?? []).some(
    (ing) =>
      esEnvase(ing) &&
      !Number.isInteger(Number(order.costBreakdown?.real.detalleInsumos?.find((l) => l.name === ing.productName)?.cantidad ?? 0)),
  );
  if (!puede || !activa || (!recetaNueva && !envasesPartidos)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{recetaNueva ? 'La receta cambió después de esta elaboración' : 'Envases contados partidos'}</CardTitle>
        <p className="text-sm text-foreground-muted">
          {recetaNueva
            ? 'Esta orden se calculó con una receta anterior. Si esa receta tenía un error, podés recalcular el costo con la receta corregida.'
            : 'Esta orden descontó envases con decimales. Recalculala para contarlos enteros.'}{' '}
          Cambian el costo y los insumos descontados; los kg y las ventas quedan igual.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!preview ? (
          <Button variant="secondary" className="self-start" onClick={() => ver.mutate()} disabled={ver.isPending}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {ver.isPending ? 'Calculando…' : recetaNueva ? 'Ver cómo queda con la receta corregida' : 'Ver cómo queda'}
          </Button>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-sm text-foreground-muted">Ahora (receta v{preview.versionActual})</p>
                <p className="text-xl font-bold">{money(preview.antes.costoPorKg)} / kg</p>
                <p className="text-sm text-foreground-muted">Total {money(preview.antes.costoNeto)}</p>
              </div>
              <div className="rounded-lg border border-primary-200 bg-primary-50/40 p-3">
                <p className="text-sm text-foreground-muted">Recalculada (receta v{preview.versionNueva})</p>
                <p className="text-xl font-bold text-primary-700">{money(preview.despues.costoPorKg)} / kg</p>
                <p className="text-sm text-foreground-muted">Total {money(preview.despues.costoNeto)}</p>
              </div>
            </div>

            {preview.cambios.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Qué cambia</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {preview.cambios.map((c) => (
                    <li key={c.name} className="flex flex-wrap justify-between gap-2 rounded-md bg-surface-subtle/40 px-3 py-2">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-foreground-muted">
                        {c.antes ? `${qty(c.antes.cantidad)} (${money(c.antes.subtotal)})` : 'no estaba'} →{' '}
                        {c.despues ? `${qty(c.despues.cantidad)} (${money(c.despues.subtotal)})` : 'se saca'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.bloqueo ? (
              <p className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-foreground" role="alert">
                <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
                {preview.bloqueo}
              </p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => aplicar.mutate()} disabled={aplicar.isPending}>
                  {aplicar.isPending ? 'Guardando…' : 'Usar el costo corregido'}
                </Button>
                <Button variant="ghost" onClick={() => setPreview(null)} disabled={aplicar.isPending}>
                  Dejar como está
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
