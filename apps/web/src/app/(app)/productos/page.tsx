'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft, Package, Pencil, Plus, Power } from 'lucide-react';
import { createProductInputSchema, type CreateProductInput, type Product } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { RowActions } from '@/components/ui/row-actions';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { productsApi, inventoryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/hooks/use-confirm';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockInicial, setStockInicial] = useState('');

  const { data = [], isLoading } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });

  const form = useForm<CreateProductInput>({
    resolver: zodResolver(createProductInputSchema),
    mode: 'onBlur',
    defaultValues: { category: 'queso', unit: 'kg', trackBatches: true },
  });

  // Precarga del form al pasar a modo edición.
  useEffect(() => {
    if (editing) {
      form.reset({
        sku: editing.sku,
        name: editing.name,
        description: editing.description,
        category: editing.category,
        unit: editing.unit,
        trackBatches: editing.trackBatches,
        minStockLevel: editing.minStockLevel,
      });
    }
  }, [editing, form]);

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setStockInicial('');
    form.reset({ category: 'queso', unit: 'kg', trackBatches: true });
  }

  const save = useMutation({
    mutationFn: async (i: CreateProductInput) => {
      if (editing) return productsApi.update(editing.id, i);
      const product = await productsApi.create(i);
      const qty = Number(stockInicial);
      if (qty > 0) {
        await inventoryApi.addStockEntry({ productId: product.id, quantity: qty });
      }
      return product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      toast.success(editing ? 'Producto actualizado' : 'Producto creado');
      closeForm();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => productsApi.update(id, { isActive }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(vars.isActive ? 'Producto activado' : 'Producto desactivado');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo actualizar. Probá de nuevo.'),
  });

  async function onDeactivate(p: Product) {
    const ok = await confirm({
      title: `Desactivar ${p.name}`,
      message: 'Dejará de aparecer para usarse en nuevas operaciones. Lo podés reactivar cuando quieras.',
      confirmLabel: 'Desactivar',
      destructive: true,
    });
    if (ok) toggleActive.mutate({ id: p.id, isActive: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/admin"><ArrowLeft className="h-4 w-4" /> Datos maestros</Link>
      </Button>
      <PageHeader
        title="Productos"
        description="Catálogo de productos terminados, materias primas e insumos."        action={
          <Button onClick={() => (showForm ? closeForm() : setShowForm(true))}>
            <Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo producto'}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{editing ? 'Editar producto' : 'Nuevo producto'}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => save.mutateAsync(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="SKU" htmlFor="sku" required error={form.formState.errors.sku?.message}>
                <Input autoFocus placeholder="QC-001" {...form.register('sku')} />
              </Field>
              <Field label="Nombre" htmlFor="name" required error={form.formState.errors.name?.message}>
                <Input placeholder="Queso cremoso 1kg" {...form.register('name')} />
              </Field>
              <Field label="Categoría" htmlFor="category" required error={form.formState.errors.category?.message}>
                <select id="category" className="min-h-touch w-full rounded-md border border-border px-3" {...form.register('category')}>
                  <option value="queso">Queso</option>
                  <option value="intermedio">Masa (intermedio)</option>
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
              <Field label="Stock mínimo" htmlFor="minStockLevel" error={form.formState.errors.minStockLevel?.message} hint="Opcional. Avisa cuando el stock baja de este valor (útil en insumos, envases y materia prima).">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  placeholder="Ej: 50"
                  {...form.register('minStockLevel', { setValueAs: (v) => (v === '' || v === null || Number.isNaN(Number(v)) ? undefined : Number(v)) })}
                />
              </Field>
              {!editing && (
                <Field
                  label="Stock inicial"
                  htmlFor="stockInicial"
                  hint="Opcional. Cantidad en planta al momento de crear el producto."
                  error={undefined}
                >
                  <Input
                    id="stockInicial"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    placeholder="0"
                    value={stockInicial}
                    onChange={(e) => setStockInicial(e.target.value)}
                  />
                </Field>
              )}
              <label className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" className="h-5 w-5" {...form.register('trackBatches')} />
                <span className="text-sm">Trabajar por lote (trazabilidad)</span>
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={closeForm}>Cancelar</Button>
                <Button type="submit" loading={save.isPending}>Guardar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <DataTable
          data={data}
          getKey={(p) => p.id}
          emptyIcon={Package}
          emptyTitle="Todavía no hay productos cargados"
          emptyDescription="Creá tu primer producto para poder usarlo en recetas, producción y ventas."
          getSearchText={(p) => `${p.sku} ${p.name} ${p.category}`}
          searchPlaceholder="Buscar por nombre, SKU o categoría…"
          columns={[
            { key: 'sku', header: 'SKU', render: (p) => <span className="font-mono text-xs">{p.sku}</span>, secondary: true, sortValue: (p) => p.sku },
            { key: 'name', header: 'Nombre', render: (p) => p.name, primary: true, sortValue: (p) => p.name },
            { key: 'category', header: 'Categoría', render: (p) => <span className="capitalize">{p.category.replace('_', ' ')}</span>, sortValue: (p) => p.category },
            { key: 'unit', header: 'Unidad', render: (p) => p.unit, sortValue: (p) => p.unit },
            { key: 'status', header: 'Estado', render: (p) => (
              <StatusBadge status={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
            )},
            { key: 'actions', header: '', align: 'right', render: (p) => (
              <RowActions
                label={`Acciones de ${p.name}`}
                actions={[
                  { label: 'Editar', icon: Pencil, onClick: () => { setEditing(p); setShowForm(true); } },
                  p.isActive
                    ? { label: 'Desactivar', icon: Power, onClick: () => onDeactivate(p), destructive: true }
                    : { label: 'Activar', icon: Power, onClick: () => toggleActive.mutate({ id: p.id, isActive: true }) },
                ]}
              />
            )},
          ]}
        />
      )}
    </div>
  );
}
