'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { inventoryApi, productsApi, type ConsumableBatch } from '@/features/api';
import { formatMoney } from '@/lib/utils';
import { insumosDuplicados } from '@/lib/doble-costo';

// Orígenes de una orden que vienen del STOCK (no de un silo de leche). Pedidos del dueño
// (audios 20-21/10/2026):
//   - masa → mozzarella, sumando REPROCESO: queso que no se vendió y vuelve a fundirse.
//   - crema cruda → crema pasteurizada (y suero → ricota): un subproducto como origen.
// El backend ya acepta cualquier lote como origen: descuenta su stock y lo costea con el
// costo del lote (o el de referencia de la ficha si el lote no tiene, ej. stock inicial).

export interface StockOption {
  id: string;
  code: string;
  label: string;
  remainingQuantity: number;
  productId: string;
  unitCost: number | null;
  entryCost?: ConsumableBatch['entryCost'];
}

export interface InputRow {
  batchId: string;
  liters: number;
}

export const EMPTY_ROW: InputRow = { batchId: '', liters: 0 };

// Lotes con stock agrupados por para qué sirven como origen.
export function useStockSources() {
  const batchesQuery = useQuery({
    queryKey: ['consumable-batches', 'todos'],
    queryFn: () => inventoryApi.consumableBatches(),
  });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });

  return useMemo(() => {
    const toOption = (b: ConsumableBatch): StockOption => ({
      id: b.id,
      code: b.code,
      label: `${b.code} · ${b.productName} (${b.remainingQuantity} ${b.unit})`,
      remainingQuantity: b.remainingQuantity,
      productId: b.productId,
      unitCost: b.unitCost,
      entryCost: b.entryCost,
    });
    const all = batchesQuery.data ?? [];
    return {
      masa: all.filter((b) => b.category === 'intermedio').map(toOption),
      reproceso: all.filter((b) => b.category === 'queso').map(toOption),
      subproductos: all.filter((b) => b.category === 'subproducto').map(toOption),
      products: productsQuery.data ?? [],
    };
  }, [batchesQuery.data, productsQuery.data]);
}

// Filas de "reproceso": lotes de queso que vuelven a la hilada junto con la masa. Se
// descuentan solos del stock y su costo entra al lote nuevo, así el rendimiento da el real.
export function ReprocesoRows({
  rows,
  onChange,
  options,
}: {
  rows: InputRow[];
  onChange: (rows: InputRow[]) => void;
  options: StockOption[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Reproceso (opcional)</p>
          <p className="text-sm text-foreground-muted">Queso en stock que vuelve a fundirse con esta masa.</p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange([...rows, { ...EMPTY_ROW }])}>
          <Plus className="h-4 w-4" /> Agregar reproceso
        </Button>
      </div>
      {rows.length > 0 && options.length === 0 && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">No hay queso en stock para reprocesar.</p>
      )}
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr),140px,auto]">
            <select
              aria-label="Lote de queso para reprocesar"
              className="min-h-touch rounded-md border border-border px-3"
              value={row.batchId}
              onChange={(e) => onChange(rows.map((r, i) => (i === idx ? { ...r, batchId: e.target.value } : r)))}
            >
              <option value="">Elegí el queso a reprocesar</option>
              {options.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="Kg"
              aria-label="Kg de reproceso"
              value={row.liters || ''}
              onChange={(e) => onChange(rows.map((r, i) => (i === idx ? { ...r, liters: Number(e.target.value) } : r)))}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              aria-label="Quitar reproceso"
              className="flex min-h-touch min-w-touch items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Aviso ANTES de abrir la orden: un lote sin costo propio (stock cargado a mano) entra con el
// costo de referencia de la ficha, el del último lote producido de ese producto, o a $0. La
// regla la resuelve el backend (input-cost.ts), la misma que usa el cierre: acá solo se cuenta.
export function SinCostoAviso({ batchIds, options }: { batchIds: string[]; options: StockOption[] }) {
  const sinCosto = options.filter((o) => batchIds.includes(o.id) && o.unitCost == null && o.entryCost);
  if (sinCosto.length === 0) return null;
  return (
    <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
      <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
      <div className="space-y-1">
        {sinCosto.map((o) => {
          const c = o.entryCost!;
          return (
            <p key={o.id}>
              El lote <span className="font-mono">{o.code}</span> se cargó a mano y no tiene costo propio.{' '}
              {c.source === 'ficha' && (
                <>Entra con el costo de referencia del producto: <strong>{formatMoney(c.unitCost)} por kg</strong>.</>
              )}
              {c.source === 'ultimo_lote' && (
                <>
                  Entra con el costo del último lote producido ({c.fromLotCode}): <strong>{formatMoney(c.unitCost)} por kg</strong>.
                </>
              )}
              {c.source === 'sin_costo' && (
                <>
                  <strong>Entra a $0</strong> y el costo por kg va a dar más bajo. Cargale un costo de referencia al producto en
                  Datos maestros → Productos.
                </>
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}

// Aviso de costo DOBLE: la receta tiene como insumo algo que es lo mismo que se elabora (caso
// real: "CREMA DE LECHE PARA PASTEURIZAR" en la receta de crema, cargado antes de que la crema
// cruda pudiera elegirse como origen). Esa crema ya entra con su costo desde el lote.
export function DobleCostoAviso({
  ingredients,
  originProductIds,
  products,
}: {
  ingredients: { productId?: string; productName: string }[];
  originProductIds: string[];
  products: { id: string; name: string; category: string }[];
}) {
  const origenes = products.filter((p) => originProductIds.includes(p.id));
  const dups = insumosDuplicados(ingredients, products, origenes);
  if (dups.length === 0) return null;
  return (
    <div className="flex gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-foreground" role="alert">
      <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" aria-hidden="true" />
      <div className="space-y-1">
        {dups.map((d) => (
          <p key={d.insumo}>
            La receta tiene <strong>{d.insumo}</strong> como insumo
            {d.contra ? <>, y {d.contra} ya entra con su costo desde el lote</> : <>, y eso ya entra con su costo desde el lote</>}.
            El costo se va a contar <strong>dos veces</strong>. Sacalo de la receta (Recetas → Nueva versión) antes de cerrar la orden.
          </p>
        ))}
      </div>
    </div>
  );
}
