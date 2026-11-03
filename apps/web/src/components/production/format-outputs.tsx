'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OutputFields } from '@/components/production/output-fields';
import type { Product } from '@lasmarias/shared-schemas';

// Otros formatos de la misma elaboración (pedido del dueño, 27/10/2026): de una tachada de
// mozzarella salen 26 planchas y, con lo que queda, uno o dos cilindros. Acá se cargan esos
// kg "aparte" sin abrir otra orden: cada formato genera su lote y hereda el mismo costo/kg.
export interface FormatRow {
  productId: string;
  kg?: number;
  bultos?: number;
}

export function FormatOutputs({
  rows,
  onChange,
  products,
  principalProductId,
}: {
  rows: FormatRow[];
  onChange: (rows: FormatRow[]) => void;
  products: Product[];
  principalProductId: string;
}) {
  const principal = products.find((p) => p.id === principalProductId);
  // Candidatos: misma categoría que el principal (queso con queso), activos, sin repetir.
  // Un producto ya elegido (orden vieja con un formato hoy inactivo) sigue apareciendo.
  const elegidosAntes = new Set(rows.map((r) => r.productId));
  const candidatos = products.filter(
    (p) =>
      (p.isActive || elegidosAntes.has(p.id)) &&
      p.id !== principalProductId &&
      (!principal || p.category === principal.category),
  );
  const elegidos = new Set(rows.map((r) => r.productId));
  const update = (i: number, patch: Partial<FormatRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => {
        const product = products.find((p) => p.id === row.productId);
        return (
          <div key={i} className="rounded-lg border border-border-subtle p-3">
            <div className="flex items-center gap-2">
              <select
                aria-label="Formato"
                className="min-h-touch min-w-0 flex-1 rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                value={row.productId}
                onChange={(e) => update(i, { productId: e.target.value })}
              >
                <option value="">Elegí el formato</option>
                {candidatos
                  .filter((p) => p.id === row.productId || !elegidos.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                aria-label="Quitar formato"
                className="flex min-h-touch min-w-touch items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {product && (
              <div className="mt-3">
                <OutputFields
                  output={{ productId: product.id, productName: product.name, quantity: 0, unit: product.unit }}
                  product={product}
                  kg={row.kg}
                  bultos={row.bultos}
                  placeholder="Ej: 40"
                  onKg={(v) => update(i, { kg: v })}
                  onBultos={(v) => update(i, { bultos: v })}
                />
              </div>
            )}
          </div>
        );
      })}
      <div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={candidatos.length === 0 || rows.some((r) => !r.productId)}
          onClick={() => onChange([...rows, { productId: '' }])}
        >
          <Plus className="h-4 w-4" /> Agregar formato
        </Button>
        {candidatos.length === 0 && (
          <p className="mt-2 text-xs text-foreground-muted">No hay otro producto de la misma categoría en Productos.</p>
        )}
      </div>
    </div>
  );
}
