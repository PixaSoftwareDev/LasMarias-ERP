'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { createClientInputSchema, type CreateClientInput } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/page-header';
import { clientsApi, deliveryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const zonesQuery = useQuery({ queryKey: ['delivery-zones'], queryFn: () => deliveryApi.listZones() });

  const form = useForm<CreateClientInput>({
    resolver: zodResolver(createClientInputSchema),
    mode: 'onBlur',
    defaultValues: { type: 'minorista' },
  });

  const create = useMutation({
    mutationFn: (i: CreateClientInput) => clientsApi.create(i),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Cliente creado');
      form.reset();
      setShowForm(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al crear'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Clientes"
        description="Comercios y compradores del sistema."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Clientes' }]}
        action={<Button onClick={() => setShowForm((s) => !s)}><Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo cliente'}</Button>}
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nuevo cliente</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => create.mutateAsync(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Razón social" htmlFor="businessName" required error={form.formState.errors.businessName?.message}>
                <Input {...form.register('businessName')} />
              </Field>
              <Field label="CUIT" htmlFor="taxId" error={form.formState.errors.taxId?.message}>
                <Input placeholder="20-12345678-9" {...form.register('taxId')} />
              </Field>
              <Field label="Tipo" htmlFor="type" required>
                <select className="min-h-touch w-full rounded-md border border-border px-3" {...form.register('type')}>
                  <option value="minorista">Minorista</option>
                  <option value="mayorista">Mayorista</option>
                  <option value="distribuidor">Distribuidor</option>
                </select>
              </Field>
              <Field label="Zona de reparto" htmlFor="zoneId">
                <select className="min-h-touch w-full rounded-md border border-border px-3" {...form.register('zoneId')}>
                  <option value="">(sin zona)</option>
                  {zonesQuery.data?.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </Field>
              <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
                <Input type="email" {...form.register('email')} />
              </Field>
              <Field label="Teléfono" htmlFor="phone" error={form.formState.errors.phone?.message}>
                <Input {...form.register('phone')} />
              </Field>
              <Field label="Dirección" htmlFor="address" className="sm:col-span-2">
                <Input {...form.register('address')} />
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
          getKey={(c) => c.id}
          emptyText="Todavía no hay clientes."
          columns={[
            { key: 'name', header: 'Razón social', render: (c) => c.businessName, primary: true },
            { key: 'type', header: 'Tipo', render: (c) => <span className="capitalize">{c.type}</span> },
            { key: 'taxId', header: 'CUIT', render: (c) => c.taxId ?? '—', secondary: true },
            { key: 'city', header: 'Ciudad', render: (c) => c.city ?? '—' },
            { key: 'phone', header: 'Teléfono', render: (c) => c.phone ?? '—' },
          ]}
        />
      )}
    </div>
  );
}
