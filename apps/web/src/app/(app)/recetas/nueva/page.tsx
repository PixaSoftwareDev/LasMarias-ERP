'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { productsApi, recipesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

interface FormValues {
  productId: string;
  name: string;
  description?: string;
  baseYieldKgPerLiter: number;
  baselineFatPercent: number;
  baselineProteinPercent: number;
  standardWastePercent: number;
}

export default function NewRecipePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const form = useForm<FormValues>({
    mode: 'onBlur',
    defaultValues: { baselineFatPercent: 3.4, baselineProteinPercent: 3.2, standardWastePercent: 0 },
  });

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
          ingredients: [],
          byproducts: [],
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Receta creada');
      router.push('/recetas');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al crear'),
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Nueva receta"
        description="Versión inicial. Después podés agregar ingredientes y subproductos editando la receta."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { href: '/recetas', label: 'Recetas' }, { label: 'Nueva' }]}
      />

      <form onSubmit={form.handleSubmit((v) => create.mutateAsync(v))} className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Datos generales</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Producto principal" htmlFor="productId" required error={form.formState.errors.productId?.message}>
              <select className="min-h-touch w-full rounded-md border border-border px-3" {...form.register('productId', { required: 'Elegí el producto' })}>
                <option value="">Elegí el producto</option>
                {products.data?.filter((p) => p.category === 'queso' || p.category === 'subproducto').map((p) => (
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
          <CardHeader><CardTitle>Rendimiento base</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Rendimiento (kg de producto por litro)" htmlFor="baseYieldKgPerLiter" required hint="Ej: 0.10 = 100 kg de queso cada 1000 L">
              <Input type="number" step="0.001" inputMode="decimal" {...form.register('baseYieldKgPerLiter', { valueAsNumber: true, required: true, min: 0.0001 })} />
            </Field>
            <Field label="Merma estándar (%)" htmlFor="standardWastePercent">
              <Input type="number" step="0.1" {...form.register('standardWastePercent', { valueAsNumber: true })} />
            </Field>
            <Field label="Grasa base (%)" htmlFor="baselineFatPercent">
              <Input type="number" step="0.01" {...form.register('baselineFatPercent', { valueAsNumber: true })} />
            </Field>
            <Field label="Proteína base (%)" htmlFor="baselineProteinPercent">
              <Input type="number" step="0.01" {...form.register('baselineProteinPercent', { valueAsNumber: true })} />
            </Field>
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
