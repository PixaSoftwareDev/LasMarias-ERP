'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, Plus, X } from 'lucide-react';
import { createProductInputSchema, type CreateProductInput, type Product } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { productsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

interface PresentationForm {
  name: string;
  sku: string;
  netWeightG?: number;
}

function PresentationsPanel({ product, onClose }: { product: Product; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: presentations = [], isLoading } = useQuery({
    queryKey: ['presentations', product.id],
    queryFn: () => productsApi.listPresentations(product.id),
  });

  const form = useForm<PresentationForm>({ mode: 'onBlur' });

  const create = useMutation({
    mutationFn: (i: PresentationForm) =>
      productsApi.createPresentation(product.id, {
        name: i.name,
        sku: i.sku,
        netWeightG: i.netWeightG || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presentations', product.id] });
      toast.success('Presentación creada');
      form.reset();
      setShowForm(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al guardar'),
  });

  return (
    <Card className="border-primary-200 bg-surface-subtle">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">Presentaciones — {product.name}</CardTitle>
          <p className="text-sm text-foreground-muted mt-0.5">
            Variantes de envase del mismo producto (400g, 1kg, 4kg…)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> Nueva
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {showForm && (
          <form
            onSubmit={form.handleSubmit((v) => create.mutateAsync(v))}
            className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-elevated p-4 sm:grid-cols-3"
          >
            <Field label="Nombre" htmlFor="pname" required error={form.formState.errors.name?.message}>
              <Input placeholder="Ej: Horma 1kg" {...form.register('name', { required: 'Requerido' })} />
            </Field>
            <Field label="SKU" htmlFor="psku" required error={form.formState.errors.sku?.message}>
              <Input placeholder="QC-001-1K" {...form.register('sku', { required: 'Requerido' })} />
            </Field>
            <Field label="Peso neto (g)" htmlFor="pweight" hint="Opcional">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="1000"
                {...form.register('netWeightG', { valueAsNumber: true, setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : Number(v)) })}
              />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" size="sm" loading={create.isPending}>Guardar</Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-surface-subtle" />
        ) : presentations.length === 0 ? (
          <p className="py-4 text-center text-sm text-foreground-muted">
            Este producto no tiene presentaciones cargadas todavía.
          </p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {presentations.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">{p.name}</span>
                  <span className="font-mono text-xs text-foreground-muted">{p.sku}</span>
                  {p.netWeightG && (
                    <span className="text-xs text-foreground-muted">{p.netWeightG >= 1000 ? `${p.netWeightG / 1000}kg` : `${p.netWeightG}g`}</span>
                  )}
                </div>
                <StatusBadge status={p.isActive ? 'success' : 'neutral'}>
                  {p.isActive ? 'Activa' : 'Inactiva'}
                </StatusBadge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });

  const form = useForm<CreateProductInput>({
    resolver: zodResolver(createProductInputSchema),
    mode: 'onBlur',
    defaultValues: { category: 'queso', unit: 'kg', trackBatches: true },
  });

  const create = useMutation({
    mutationFn: (i: CreateProductInput) => productsApi.create(i),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Producto creado');
      form.reset();
      setShowForm(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al crear'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Productos"
        description="Catálogo de productos terminados, materias primas e insumos."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Productos' }]}
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo producto'}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nuevo producto</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => create.mutateAsync(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="SKU" htmlFor="sku" required error={form.formState.errors.sku?.message}>
                <Input placeholder="QC-001" {...form.register('sku')} />
              </Field>
              <Field label="Nombre" htmlFor="name" required error={form.formState.errors.name?.message}>
                <Input placeholder="Queso cremoso 1kg" {...form.register('name')} />
              </Field>
              <Field label="Categoría" htmlFor="category" required error={form.formState.errors.category?.message}>
                <select id="category" className="min-h-touch w-full rounded-md border border-border px-3" {...form.register('category')}>
                  <option value="queso">Queso</option>
                  <option value="subproducto">Subproducto</option>
                  <option value="materia_prima">Materia prima</option>
                  <option value="envase">Envase</option>
                  <option value="insumo">Insumo</option>
                </select>
              </Field>
              <Field label="Unidad" htmlFor="unit" required error={form.formState.errors.unit?.message}>
                <select id="unit" className="min-h-touch w-full rounded-md border border-border px-3" {...form.register('unit')}>
                  <option value="kg">kg</option>
                  <option value="litro">litro</option>
                  <option value="unidad">unidad</option>
                </select>
              </Field>
              <Field label="Alícuota IVA (%)" htmlFor="ivaRatePercent" hint="0% leche fluida · 10.5% quesos · 21% dulce de leche" error={form.formState.errors.ivaRatePercent?.message}>
                <Input type="number" step="0.01" inputMode="decimal" placeholder="10.5" {...form.register('ivaRatePercent', { valueAsNumber: true })} />
              </Field>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" className="h-5 w-5" defaultChecked {...form.register('trackBatches')} />
                <span className="text-sm">Trabajar por lote (trazabilidad)</span>
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" loading={create.isPending}>Guardar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card className="h-40 animate-pulse bg-surface-subtle" />
      ) : (
        <DataTable
          data={data}
          getKey={(p) => p.id}
          emptyText="Todavía no hay productos cargados."
          columns={[
            { key: 'sku', header: 'SKU', render: (p) => <span className="font-mono text-xs">{p.sku}</span>, secondary: true },
            { key: 'name', header: 'Nombre', render: (p) => p.name, primary: true },
            { key: 'category', header: 'Categoría', render: (p) => <span className="capitalize">{p.category.replace('_', ' ')}</span> },
            { key: 'unit', header: 'Unidad', render: (p) => p.unit },
            { key: 'iva', header: 'IVA', render: (p) => `${p.ivaRatePercent}%`, align: 'right' as const },
            { key: 'status', header: 'Estado', render: (p) => (
              <StatusBadge status={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
            )},
            { key: 'presentations', header: '', render: (p) => (
              <button
                onClick={() => setSelectedProduct(selectedProduct?.id === p.id ? null : p)}
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
              >
                Presentaciones
                <ChevronRight className={`h-4 w-4 transition-transform ${selectedProduct?.id === p.id ? 'rotate-90' : ''}`} />
              </button>
            )},
          ]}
        />
      )}

      {selectedProduct && (
        <PresentationsPanel
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
