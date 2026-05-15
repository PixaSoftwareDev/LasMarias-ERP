'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { createProductInputSchema, type CreateProductInput } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { productsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

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
            { key: 'status', header: 'Estado', render: (p) => (
              <StatusBadge status={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
            )},
          ]}
        />
      )}
    </div>
  );
}
