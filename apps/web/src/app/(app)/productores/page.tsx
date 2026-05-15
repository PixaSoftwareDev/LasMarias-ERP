'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/page-header';
import { producersApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

interface FormValues {
  name: string;
  phone?: string;
  city?: string;
  agreedPricePerLiter?: number;
}

export default function ProducersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ['producers'], queryFn: () => producersApi.list() });

  const form = useForm<FormValues>({ mode: 'onBlur' });

  const create = useMutation({
    mutationFn: (i: FormValues) =>
      producersApi.create({
        name: i.name,
        phone: i.phone || undefined,
        city: i.city || undefined,
        agreedPricePerLiter: i.agreedPricePerLiter ? Number(i.agreedPricePerLiter) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      toast.success('Productor creado');
      form.reset();
      setShowForm(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al crear'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Productores de leche"
        description="Tambos que entregan leche cruda a la planta."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Productores' }]}
        action={<Button onClick={() => setShowForm((s) => !s)}><Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo productor'}</Button>}
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nuevo productor</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => create.mutateAsync(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="name" required error={form.formState.errors.name?.message} className="sm:col-span-2">
                <Input placeholder="Tambo La Esperanza" {...form.register('name', { required: 'Ingresá el nombre' })} />
              </Field>
              <Field label="Ciudad" htmlFor="city">
                <Input {...form.register('city')} />
              </Field>
              <Field label="Teléfono" htmlFor="phone">
                <Input {...form.register('phone')} />
              </Field>
              <Field label="Precio acordado ($/litro)" htmlFor="agreedPricePerLiter" hint="Usado para liquidación mensual">
                <Input type="number" step="0.0001" inputMode="decimal" {...form.register('agreedPricePerLiter', { valueAsNumber: true })} />
              </Field>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" loading={create.isPending}>Guardar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : (
        <DataTable
          data={data}
          getKey={(p) => p.id}
          emptyText="No hay productores cargados todavía."
          columns={[
            { key: 'name', header: 'Nombre', render: (p) => p.name, primary: true },
            { key: 'city', header: 'Ciudad', render: (p) => p.city ?? '—' },
            { key: 'phone', header: 'Teléfono', render: (p) => p.phone ?? '—' },
            { key: 'price', header: 'Precio/L', render: (p) => p.agreedPricePerLiter ? `$${p.agreedPricePerLiter}` : '—', align: 'right' },
          ]}
        />
      )}
    </div>
  );
}
