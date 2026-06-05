'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Boxes, FileText, Gauge, Plus, Recycle, Trash2 } from 'lucide-react';
import type { IngredientBasis, ByproductDestination, Currency } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { productsApi, recipesApi, exchangeRatesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';
import { CURRENCY_OPTIONS, currencySymbol, equivalentArs } from '@/features/currency';

interface FormValues {
  productId: string;
  name: string;
  description?: string;
  baseYieldKgPerLiter: number;
  baselineFatPercent: number;
  baselineProteinPercent: number;
  standardWastePercent: number;
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
  currency: Currency;
}

interface ByproductRow {
  name: string;
  expectedYield: string;
  unit: 'kg' | 'litro';
  basis: 'per_liter_milk' | 'per_kg_product';
  destination: ByproductDestination;
  referenceValuePerUnit: string;
}

const emptyIngredient: IngredientRow = { productId: '', quantity: '', unit: 'kg', basis: 'per_liter_milk', unitCost: '', currency: 'ARS' };
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

export default function NewRecipePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  // Última cotización cargada, para mostrar el equivalente en pesos al cargar costos en USD/EUR.
  const latestRate = useQuery({ queryKey: ['exchange-rate-latest'], queryFn: () => exchangeRatesApi.latest() });
  const form = useForm<FormValues>({
    mode: 'onBlur',
    defaultValues: { baselineFatPercent: 3.4, baselineProteinPercent: 3.2, standardWastePercent: 0 },
  });

  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [byproducts, setByproducts] = useState<ByproductRow[]>([]);
  // Campos de filas dinámicas que el usuario ya visitó (para validar en vivo, no recién al guardar).
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (key: string) => setTouched((s) => (s.has(key) ? s : new Set(s).add(key)));

  // Mensajes de error por campo (CLAUDE.md §7 — avisar antes de guardar, mensajes claros).
  function ingError(r: IngredientRow, field: 'productId' | 'quantity' | 'unitCost'): string | undefined {
    if (field === 'productId') return r.productId ? undefined : 'Elegí el insumo';
    if (field === 'quantity') return Number(r.quantity) > 0 ? undefined : 'Tiene que ser mayor a 0';
    return r.unitCost === '' || Number(r.unitCost) >= 0 ? undefined : 'El costo no puede ser negativo';
  }
  function bpError(r: ByproductRow, field: 'name' | 'expectedYield' | 'referenceValuePerUnit'): string | undefined {
    if (field === 'name') return r.name.trim() ? undefined : 'Ingresá el nombre';
    if (field === 'expectedYield') return Number(r.expectedYield) > 0 ? undefined : 'Tiene que ser mayor a 0';
    return r.referenceValuePerUnit === '' || Number(r.referenceValuePerUnit) >= 0 ? undefined : 'No puede ser negativo';
  }
  // Error a mostrar: sólo si el campo ya fue visitado.
  const shownIng = (idx: number, r: IngredientRow, field: 'productId' | 'quantity' | 'unitCost') =>
    touched.has(`ing-${idx}-${field}`) ? ingError(r, field) : undefined;
  const shownBp = (idx: number, r: ByproductRow, field: 'name' | 'expectedYield' | 'referenceValuePerUnit') =>
    touched.has(`bp-${idx}-${field}`) ? bpError(r, field) : undefined;

  const ingredientProducts = products.data?.filter((p) => INGREDIENT_CATEGORIES.includes(p.category)) ?? [];

  const create = useMutation({
    mutationFn: (i: FormValues) =>
      recipesApi.create({
        productId: i.productId,
        name: i.name,
        description: i.description,
        initialVersion: {
          baseYieldKgPerLiter: Number(i.baseYieldKgPerLiter),
          baselineFatPercent: Number(i.baselineFatPercent),
          baselineProteinPercent: Number(i.baselineProteinPercent),
          standardWastePercent: Number(i.standardWastePercent),
          yieldSensitivityFat: 0,
          yieldSensitivityProtein: 0,
          ingredients: ingredients.map((r) => ({
            productId: r.productId,
            quantity: Number(r.quantity),
            unit: r.unit,
            basis: r.basis,
            unitCost: r.unitCost === '' ? undefined : Number(r.unitCost),
            currency: r.currency,
          })),
          byproducts: byproducts.map((r) => ({
            name: r.name.trim(),
            expectedYield: Number(r.expectedYield),
            unit: r.unit,
            basis: r.basis,
            destination: r.destination,
            referenceValuePerUnit: r.referenceValuePerUnit === '' ? undefined : Number(r.referenceValuePerUnit),
          })),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Receta creada');
      router.push('/recetas');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo crear la receta. Probá de nuevo.'),
  });

  function validateAndSubmit(v: FormValues) {
    // Insumos: producto + cantidad > 0 obligatorios; costo opcional pero válido si se carga.
    for (const [idx, r] of ingredients.entries()) {
      if (!r.productId) { toast.error(`Insumo ${idx + 1}: elegí el producto`); return; }
      if (!(Number(r.quantity) > 0)) { toast.error(`Insumo ${idx + 1}: la cantidad tiene que ser mayor a 0`); return; }
      if (r.unitCost !== '' && !(Number(r.unitCost) >= 0)) { toast.error(`Insumo ${idx + 1}: el costo no es válido`); return; }
    }
    // Subproductos: nombre + rendimiento > 0 obligatorios; valor de recupero opcional.
    for (const [idx, r] of byproducts.entries()) {
      if (!r.name.trim()) { toast.error(`Subproducto ${idx + 1}: ingresá el nombre`); return; }
      if (!(Number(r.expectedYield) > 0)) { toast.error(`Subproducto ${idx + 1}: el rendimiento tiene que ser mayor a 0`); return; }
      if (r.referenceValuePerUnit !== '' && !(Number(r.referenceValuePerUnit) >= 0)) {
        toast.error(`Subproducto ${idx + 1}: el valor de recupero no es válido`);
        return;
      }
    }
    create.mutateAsync(v);
  }

  function updateIngredient(idx: number, patch: Partial<IngredientRow>) {
    setIngredients((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function updateByproduct(idx: number, patch: Partial<ByproductRow>) {
    setByproducts((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nueva receta"
        description="Cargá el rendimiento, los insumos con su costo y los subproductos. Así el costo se calcula completo, no solo la leche."      />

      <form onSubmit={form.handleSubmit(validateAndSubmit)} className="flex flex-col gap-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary-700" aria-hidden="true" />Datos generales</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Producto principal" htmlFor="productId" required error={form.formState.errors.productId?.message}>
              <select className={selectClass} {...form.register('productId', { required: 'Elegí el producto' })}>
                <option value="">Elegí el producto</option>
                {products.data?.filter((p) => p.category === 'queso' || p.category === 'subproducto' || p.category === 'intermedio').map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Nombre de la receta" htmlFor="name" required error={form.formState.errors.name?.message}>
              <Input placeholder="Cremoso clásico" {...form.register('name', { required: 'Ingresá el nombre' })} />
            </Field>
            <Field label="Descripción" htmlFor="description" className="sm:col-span-2">
              <Input {...form.register('description')} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-primary-700" aria-hidden="true" />Rendimiento base</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Lo obligatorio, siempre visible. */}
            <Field label="Rendimiento (kg de producto por litro)" htmlFor="baseYieldKgPerLiter" required hint="Ej: 0.10 = 100 kg de queso cada 1000 L">
              <Input type="number" step="0.001" inputMode="decimal" {...form.register('baseYieldKgPerLiter', { valueAsNumber: true, required: true, min: 0.0001 })} />
            </Field>

            {/* Lo opcional/avanzado, plegado para no abrumar. */}
            <details className="group rounded-lg border border-border-subtle bg-surface-subtle/40">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
                <span>Datos avanzados (opcional)</span>
                <span className="text-xs text-foreground-muted group-open:hidden">Mostrar</span>
                <span className="hidden text-xs text-foreground-muted group-open:inline">Ocultar</span>
              </summary>
              <div className="grid grid-cols-1 gap-5 px-4 pb-4 sm:grid-cols-3">
                <Field label="Merma estándar (%)" htmlFor="standardWastePercent" hint="Pérdida esperada del proceso.">
                  <Input type="number" step="0.1" inputMode="decimal" {...form.register('standardWastePercent', { valueAsNumber: true })} />
                </Field>
                <Field label="Grasa base (%)" htmlFor="baselineFatPercent" hint="Materia grasa de referencia de la leche.">
                  <Input type="number" step="0.01" inputMode="decimal" {...form.register('baselineFatPercent', { valueAsNumber: true })} />
                </Field>
                <Field label="Proteína base (%)" htmlFor="baselineProteinPercent" hint="Proteína de referencia de la leche.">
                  <Input type="number" step="0.01" inputMode="decimal" {...form.register('baselineProteinPercent', { valueAsNumber: true })} />
                </Field>
              </div>
            </details>
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
                Todavía no agregaste insumos. La receta puede crearse sin insumos, pero el costo solo reflejará la leche.
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
                  <Field label="Producto" htmlFor={`ing-product-${idx}`} required error={shownIng(idx, row, 'productId')}>
                    <select
                      className={selectClass}
                      value={row.productId}
                      onChange={(e) => updateIngredient(idx, { productId: e.target.value })}
                      onBlur={() => touch(`ing-${idx}-productId`)}
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
                  <Field label="Cantidad" htmlFor={`ing-qty-${idx}`} required error={shownIng(idx, row, 'quantity')}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      placeholder="0"
                      invalid={!!shownIng(idx, row, 'quantity')}
                      value={row.quantity}
                      onChange={(e) => updateIngredient(idx, { quantity: e.target.value })}
                      onBlur={() => touch(`ing-${idx}-quantity`)}
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
                  <Field label="Costo unitario" htmlFor={`ing-cost-${idx}`} hint="Por unidad del insumo (opcional)" error={shownIng(idx, row, 'unitCost')}>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        prefix={currencySymbol(row.currency)}
                        placeholder="0"
                        className="flex-1"
                        invalid={!!shownIng(idx, row, 'unitCost')}
                        value={row.unitCost}
                        onChange={(e) => updateIngredient(idx, { unitCost: e.target.value })}
                        onBlur={() => touch(`ing-${idx}-unitCost`)}
                      />
                      <select
                        className={`${selectClass} w-28 flex-none`}
                        aria-label="Moneda del costo"
                        value={row.currency}
                        onChange={(e) => updateIngredient(idx, { currency: e.target.value as Currency })}
                      >
                        {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value}</option>)}
                      </select>
                    </div>
                    {(() => {
                      const eq = equivalentArs(row.unitCost, row.currency, latestRate.data ?? undefined);
                      if (eq != null) return <p className="mt-1 text-xs text-foreground-muted">≈ {formatMoney(eq)} /unidad (cotización del día)</p>;
                      if (row.currency !== 'ARS' && Number(row.unitCost) > 0)
                        return <p className="mt-1 text-xs text-warning-700">Cargá la cotización del día para ver el equivalente en pesos.</p>;
                      return null;
                    })()}
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
                Todavía no agregaste subproductos.
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
                  <Field label="Nombre" htmlFor={`bp-name-${idx}`} required error={shownBp(idx, row, 'name')}>
                    <Input
                      placeholder="Suero / Ricota"
                      invalid={!!shownBp(idx, row, 'name')}
                      value={row.name}
                      onChange={(e) => updateByproduct(idx, { name: e.target.value })}
                      onBlur={() => touch(`bp-${idx}-name`)}
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
                  <Field label="Rendimiento esperado" htmlFor={`bp-yield-${idx}`} required error={shownBp(idx, row, 'expectedYield')}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      placeholder="0"
                      invalid={!!shownBp(idx, row, 'expectedYield')}
                      value={row.expectedYield}
                      onChange={(e) => updateByproduct(idx, { expectedYield: e.target.value })}
                      onBlur={() => touch(`bp-${idx}-expectedYield`)}
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
                  <Field label="Valor de recupero" htmlFor={`bp-value-${idx}`} hint="Opcional. Cuánto vale lo recuperado, por unidad." error={shownBp(idx, row, 'referenceValuePerUnit')}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      prefix="$"
                      placeholder="0"
                      invalid={!!shownBp(idx, row, 'referenceValuePerUnit')}
                      value={row.referenceValuePerUnit}
                      onChange={(e) => updateByproduct(idx, { referenceValuePerUnit: e.target.value })}
                      onBlur={() => touch(`bp-${idx}-referenceValuePerUnit`)}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" loading={create.isPending}>Crear receta</Button>
        </div>
      </form>
    </div>
  );
}
