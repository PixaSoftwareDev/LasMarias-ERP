'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Boxes, Gauge, History, NotebookPen, Plus, Recycle, Trash2 } from 'lucide-react';
import type { IngredientBasis, ByproductDestination } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/page-header';
import { productsApi, recipesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

interface FormValues {
  baseYieldKgPerLiter: number;
  baselineFatPercent: number;
  baselineProteinPercent: number;
  standardWastePercent: number;
  yieldSensitivityFat: number;
  yieldSensitivityProtein: number;
  notes?: string;
}

// Categorías de productos que pueden usarse como insumo de una receta.
const INGREDIENT_CATEGORIES = ['materia_prima', 'insumo', 'envase', 'intermedio'];

const BASIS_OPTIONS: { value: IngredientBasis; label: string }[] = [
  { value: 'per_liter_milk', label: 'por litro de leche' },
  { value: 'per_kg_product', label: 'por kg de producto' },
  { value: 'fixed_per_order', label: 'fijo por orden' },
];

const BYPRODUCT_BASIS_OPTIONS: { value: 'per_liter_milk' | 'per_kg_product'; label: string }[] = [
  { value: 'per_liter_milk', label: 'por litro de leche' },
  { value: 'per_kg_product', label: 'por kg de producto' },
];

const DESTINATION_OPTIONS: { value: ByproductDestination; label: string }[] = [
  { value: 'product', label: 'Otro producto' },
  { value: 'sale', label: 'Venta (ej. chanchería)' },
  { value: 'discard', label: 'Descarte' },
];

interface IngredientRow {
  productId: string;
  quantity: string;
  unit: 'kg' | 'litro' | 'unidad' | 'gramo';
  basis: IngredientBasis;
  unitCost: string;
}

interface ByproductRow {
  name: string;
  expectedYield: string;
  unit: 'kg' | 'litro';
  basis: 'per_liter_milk' | 'per_kg_product';
  destination: ByproductDestination;
  referenceValuePerUnit: string;
}

const emptyIngredient: IngredientRow = { productId: '', quantity: '', unit: 'kg', basis: 'per_liter_milk', unitCost: '' };
const emptyByproduct: ByproductRow = {
  name: '',
  expectedYield: '',
  unit: 'litro',
  basis: 'per_liter_milk',
  destination: 'sale',
  referenceValuePerUnit: '',
};

// Mismo lenguaje visual que <Input>: altura táctil, fondo elevado y foco con ring primario.
const selectClass =
  'flex min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1';

const fmtDate = (iso: string) => formatDate(iso);

export default function NewRecipeVersionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const recipeId = params.id;
  const queryClient = useQueryClient();

  const recipe = useQuery({ queryKey: ['recipe', recipeId], queryFn: () => recipesApi.get(recipeId) });
  const products = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });

  const form = useForm<FormValues>({
    mode: 'onBlur',
    defaultValues: { baselineFatPercent: 3.4, baselineProteinPercent: 3.2, standardWastePercent: 0, yieldSensitivityFat: 0, yieldSensitivityProtein: 0 },
  });

  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [byproducts, setByproducts] = useState<ByproductRow[]>([]);
  // Para no pisar la edición del usuario si refetchea: precargamos una sola vez.
  const [prefilled, setPrefilled] = useState(false);

  const active = recipe.data?.activeVersion;

  // Precarga de la versión activa: rendimiento, sensibilidades, insumos y subproductos.
  useEffect(() => {
    if (!active || prefilled) return;
    form.reset({
      baseYieldKgPerLiter: active.baseYieldKgPerLiter,
      baselineFatPercent: active.baselineFatPercent,
      baselineProteinPercent: active.baselineProteinPercent,
      standardWastePercent: active.standardWastePercent,
      yieldSensitivityFat: active.yieldSensitivityFat,
      yieldSensitivityProtein: active.yieldSensitivityProtein,
      notes: '',
    });
    setIngredients(
      active.ingredients.map((i) => ({
        productId: i.productId,
        quantity: String(i.quantity),
        unit: i.unit,
        basis: i.basis,
        unitCost: i.unitCost == null ? '' : String(i.unitCost),
      })),
    );
    setByproducts(
      active.byproducts.map((b) => ({
        name: b.name,
        expectedYield: String(b.expectedYield),
        unit: b.unit,
        basis: b.basis,
        destination: b.destination,
        referenceValuePerUnit: b.referenceValuePerUnit == null ? '' : String(b.referenceValuePerUnit),
      })),
    );
    setPrefilled(true);
  }, [active, prefilled, form]);

  const ingredientProducts = products.data?.filter((p) => INGREDIENT_CATEGORIES.includes(p.category)) ?? [];

  const save = useMutation({
    mutationFn: (i: FormValues) =>
      recipesApi.createVersion(recipeId, {
        baseYieldKgPerLiter: Number(i.baseYieldKgPerLiter),
        baselineFatPercent: Number(i.baselineFatPercent),
        baselineProteinPercent: Number(i.baselineProteinPercent),
        standardWastePercent: Number(i.standardWastePercent),
        yieldSensitivityFat: Number(i.yieldSensitivityFat),
        yieldSensitivityProtein: Number(i.yieldSensitivityProtein),
        notes: i.notes?.trim() ? i.notes.trim() : undefined,
        ingredients: ingredients.map((r) => ({
          productId: r.productId,
          quantity: Number(r.quantity),
          unit: r.unit,
          basis: r.basis,
          unitCost: r.unitCost === '' ? undefined : Number(r.unitCost),
        })),
        byproducts: byproducts.map((r) => ({
          name: r.name.trim(),
          expectedYield: Number(r.expectedYield),
          unit: r.unit,
          basis: r.basis,
          destination: r.destination,
          referenceValuePerUnit: r.referenceValuePerUnit === '' ? undefined : Number(r.referenceValuePerUnit),
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] });
      toast.success('Nueva versión guardada. La anterior quedó archivada.');
      router.push('/recetas');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar la versión. Probá de nuevo.'),
  });

  function validateAndSubmit(v: FormValues) {
    for (const [idx, r] of ingredients.entries()) {
      if (!r.productId) { toast.error(`Insumo ${idx + 1}: elegí el producto`); return; }
      if (!(Number(r.quantity) > 0)) { toast.error(`Insumo ${idx + 1}: la cantidad tiene que ser mayor a 0`); return; }
      if (r.unitCost !== '' && !(Number(r.unitCost) >= 0)) { toast.error(`Insumo ${idx + 1}: el costo no es válido`); return; }
    }
    for (const [idx, r] of byproducts.entries()) {
      if (!r.name.trim()) { toast.error(`Subproducto ${idx + 1}: ingresá el nombre`); return; }
      if (!(Number(r.expectedYield) > 0)) { toast.error(`Subproducto ${idx + 1}: el rendimiento tiene que ser mayor a 0`); return; }
      if (r.referenceValuePerUnit !== '' && !(Number(r.referenceValuePerUnit) >= 0)) {
        toast.error(`Subproducto ${idx + 1}: el valor de recupero no es válido`);
        return;
      }
    }
    save.mutateAsync(v);
  }

  function updateIngredient(idx: number, patch: Partial<IngredientRow>) {
    setIngredients((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function updateByproduct(idx: number, patch: Partial<ByproductRow>) {
    setByproducts((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  if (recipe.isLoading) {
    return (
      <Card className="h-40 animate-pulse bg-surface-subtle" />
    );
  }

  if (recipe.isError || !recipe.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Receta no encontrada" />
        <Button variant="secondary" onClick={() => router.push('/recetas')}>Volver a recetas</Button>
      </div>
    );
  }

  const versions = recipe.data.versions ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Nueva versión — ${recipe.data.name}`}
        description="Editá lo que cambia y guardá. La versión anterior queda archivada y los lotes ya producidos conservan la versión con la que se hicieron."      />

      <form onSubmit={form.handleSubmit(validateAndSubmit)} className="flex flex-col gap-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-primary-700" aria-hidden="true" />Rendimiento base</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Rendimiento (kg de producto por litro)" htmlFor="baseYieldKgPerLiter" required hint="Ej: 0.10 = 100 kg de queso cada 1000 L">
              <Input type="number" step="0.001" inputMode="decimal" {...form.register('baseYieldKgPerLiter', { valueAsNumber: true, required: true, min: 0.0001 })} />
            </Field>
            <Field label="Merma estándar (%)" htmlFor="standardWastePercent">
              <Input type="number" step="0.1" inputMode="decimal" {...form.register('standardWastePercent', { valueAsNumber: true })} />
            </Field>
            <Field label="Grasa base (%)" htmlFor="baselineFatPercent">
              <Input type="number" step="0.01" inputMode="decimal" {...form.register('baselineFatPercent', { valueAsNumber: true })} />
            </Field>
            <Field label="Proteína base (%)" htmlFor="baselineProteinPercent">
              <Input type="number" step="0.01" inputMode="decimal" {...form.register('baselineProteinPercent', { valueAsNumber: true })} />
            </Field>
            <Field label="Sensibilidad a la grasa" htmlFor="yieldSensitivityFat" hint="Cuánto sube/baja el rendimiento por cada % de grasa">
              <Input type="number" step="0.01" inputMode="decimal" {...form.register('yieldSensitivityFat', { valueAsNumber: true })} />
            </Field>
            <Field label="Sensibilidad a la proteína" htmlFor="yieldSensitivityProtein" hint="Cuánto sube/baja el rendimiento por cada % de proteína">
              <Input type="number" step="0.01" inputMode="decimal" {...form.register('yieldSensitivityProtein', { valueAsNumber: true })} />
            </Field>
          </CardContent>
        </Card>

        {/* Insumos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-primary-700" aria-hidden="true" />Insumos</CardTitle>
              <Button type="button" size="sm" variant="secondary" onClick={() => setIngredients((r) => [...r, { ...emptyIngredient }])}>
                <Plus className="h-4 w-4" /> Agregar insumo
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-foreground-muted">
              Cargá lo que se consume al elaborar: leche, fermento, cuajo, sal, mano de obra, energía, envase. El costo unitario hace que el costeo sea real.
            </p>
            {ingredients.length === 0 && (
              <p className="rounded-md bg-surface-subtle px-3 py-2 text-xs text-foreground-muted">
                Esta versión no tiene insumos. Podés guardarla así, pero el costo solo reflejará la leche.
              </p>
            )}
            {ingredients.map((row, idx) => (
              <div key={idx} className="rounded-lg border border-border-subtle bg-surface-subtle/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Insumo {idx + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIngredients((r) => r.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4" /> Quitar
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Producto" htmlFor={`ing-product-${idx}`} required>
                    <select
                      className={selectClass}
                      value={row.productId}
                      onChange={(e) => updateIngredient(idx, { productId: e.target.value })}
                    >
                      <option value="">Elegí el insumo</option>
                      {ingredientProducts.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Base de cálculo" htmlFor={`ing-basis-${idx}`} required>
                    <select
                      className={selectClass}
                      value={row.basis}
                      onChange={(e) => updateIngredient(idx, { basis: e.target.value as IngredientBasis })}
                    >
                      {BASIS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Cantidad" htmlFor={`ing-qty-${idx}`} required>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      placeholder="0"
                      value={row.quantity}
                      onChange={(e) => updateIngredient(idx, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Unidad" htmlFor={`ing-unit-${idx}`} required>
                    <select
                      className={selectClass}
                      value={row.unit}
                      onChange={(e) => updateIngredient(idx, { unit: e.target.value as IngredientRow['unit'] })}
                    >
                      <option value="kg">kg</option>
                      <option value="litro">litro</option>
                      <option value="unidad">unidad</option>
                      <option value="gramo">gramo</option>
                    </select>
                  </Field>
                  <Field label="Costo unitario ($)" htmlFor={`ing-cost-${idx}`} hint="Por unidad del insumo (opcional)">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0"
                      value={row.unitCost}
                      onChange={(e) => updateIngredient(idx, { unitCost: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Subproductos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2"><Recycle className="h-5 w-5 text-primary-700" aria-hidden="true" />Subproductos</CardTitle>
              <Button type="button" size="sm" variant="secondary" onClick={() => setByproducts((r) => [...r, { ...emptyByproduct }])}>
                <Plus className="h-4 w-4" /> Agregar subproducto
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs text-foreground-muted">
              Lo que sale además del producto principal: suero, ricota. El valor de recupero descuenta su valor del costo del queso.
            </p>
            {byproducts.length === 0 && (
              <p className="rounded-md bg-surface-subtle px-3 py-2 text-xs text-foreground-muted">
                Esta versión no tiene subproductos.
              </p>
            )}
            {byproducts.map((row, idx) => (
              <div key={idx} className="rounded-lg border border-border-subtle bg-surface-subtle/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Subproducto {idx + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setByproducts((r) => r.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4" /> Quitar
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Nombre" htmlFor={`bp-name-${idx}`} required>
                    <Input
                      placeholder="Suero / Ricota"
                      value={row.name}
                      onChange={(e) => updateByproduct(idx, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Destino" htmlFor={`bp-dest-${idx}`} required>
                    <select
                      className={selectClass}
                      value={row.destination}
                      onChange={(e) => updateByproduct(idx, { destination: e.target.value as ByproductDestination })}
                    >
                      {DESTINATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Rendimiento esperado" htmlFor={`bp-yield-${idx}`} required>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      placeholder="0"
                      value={row.expectedYield}
                      onChange={(e) => updateByproduct(idx, { expectedYield: e.target.value })}
                    />
                  </Field>
                  <Field label="Unidad" htmlFor={`bp-unit-${idx}`} required>
                    <select
                      className={selectClass}
                      value={row.unit}
                      onChange={(e) => updateByproduct(idx, { unit: e.target.value as ByproductRow['unit'] })}
                    >
                      <option value="kg">kg</option>
                      <option value="litro">litro</option>
                    </select>
                  </Field>
                  <Field label="Base de cálculo" htmlFor={`bp-basis-${idx}`} required>
                    <select
                      className={selectClass}
                      value={row.basis}
                      onChange={(e) => updateByproduct(idx, { basis: e.target.value as ByproductRow['basis'] })}
                    >
                      {BYPRODUCT_BASIS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Valor de recupero ($/unidad)" htmlFor={`bp-value-${idx}`} hint="Opcional. Cuánto vale lo recuperado.">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      placeholder="0"
                      value={row.referenceValuePerUnit}
                      onChange={(e) => updateByproduct(idx, { referenceValuePerUnit: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><NotebookPen className="h-5 w-5 text-primary-700" aria-hidden="true" />Nota del cambio</CardTitle></CardHeader>
          <CardContent>
            <Field label="¿Qué cambió en esta versión?" htmlFor="notes" hint="Opcional. Ej: subimos el cuajo y bajamos la merma.">
              <Input {...form.register('notes')} />
            </Field>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Guardar nueva versión</Button>
        </div>
      </form>

      {/* Historial de versiones */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-secondary-700" aria-hidden="true" />Historial de versiones</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {versions.length === 0 ? (
            <p className="text-sm text-foreground-muted">Todavía no hay versiones registradas.</p>
          ) : (
            versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-subtle/40 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">v{v.versionNumber}</span>
                  {v.isActive && <StatusBadge status="success">Activa</StatusBadge>}
                </div>
                <div className="flex items-center gap-3 text-xs text-foreground-muted">
                  <span>{v.ingredients.length} insumos</span>
                  <span>{fmtDate(v.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
