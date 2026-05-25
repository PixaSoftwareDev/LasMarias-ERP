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
import { returnableContainersApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

interface ContainerForm {
  name: string;
  code: string;
}

export default function ReturnableContainersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['returnable-containers'],
    queryFn: () => returnableContainersApi.list(),
  });

  const form = useForm<ContainerForm>({ mode: 'onBlur' });

  const create = useMutation({
    mutationFn: (i: ContainerForm) => returnableContainersApi.create(i),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returnable-containers'] });
      toast.success('Envase registrado');
      form.reset();
      setShowForm(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al guardar'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Envases retornables"
        description="Cajones, tarros y otros envases que salen con cada entrega y deben volver."
        breadcrumbs={[
          { href: '/dashboard', label: 'Inicio' },
          { label: 'Envases retornables' },
        ]}
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo envase'}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nuevo tipo de envase</CardTitle></CardHeader>
          <CardContent>
            <form
              onSubmit={form.handleSubmit((v) => create.mutateAsync(v))}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <Field label="Nombre" htmlFor="name" required error={form.formState.errors.name?.message} className="sm:col-span-2">
                <Input placeholder="Ej: Cajón plástico 20kg" {...form.register('name', { required: 'Ingresá el nombre' })} />
              </Field>
              <Field label="Código" htmlFor="code" required error={form.formState.errors.code?.message}>
                <Input placeholder="Ej: CAJ-20" {...form.register('code', { required: 'Ingresá el código' })} />
              </Field>
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
          data={data as Array<{ id: string; name: string; code: string; isActive: boolean }>}
          getKey={(c) => c.id}
          emptyText="No hay envases registrados todavía."
          columns={[
            { key: 'code', header: 'Código', render: (c) => <span className="font-mono text-xs">{c.code}</span>, secondary: true },
            { key: 'name', header: 'Nombre', render: (c) => c.name, primary: true },
          ]}
        />
      )}
    </div>
  );
}
