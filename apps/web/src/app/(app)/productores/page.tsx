'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/page-header';
import { producersApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import type { ProducerDto } from '@/features/receptions/types';

interface FormValues {
  name: string;
  phone?: string;
  city?: string;
  agreedPricePerLiter?: number;
  renspa?: string;
  notes?: string;
}

function ProducerForm({
  initial,
  onSave,
  onCancel,
  isPending,
  title,
}: {
  initial?: Partial<FormValues>;
  onSave: (v: FormValues) => void;
  onCancel: () => void;
  isPending: boolean;
  title: string;
}) {
  const form = useForm<FormValues>({ mode: 'onBlur', defaultValues: initial ?? {} });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle>{title}</CardTitle>
        <button type="button" onClick={onCancel} className="text-foreground-muted hover:text-foreground" aria-label="Cerrar">
          <X className="h-5 w-5" />
        </button>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSave)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre del tambo" htmlFor="name" required error={form.formState.errors.name?.message} className="sm:col-span-2">
            <Input placeholder="Ej: Tambo La Esperanza" {...form.register('name', { required: 'Ingresá el nombre' })} />
          </Field>

          <Field label="Ciudad" htmlFor="city">
            <Input placeholder="Ej: Pergamino" {...form.register('city')} />
          </Field>

          <Field label="Teléfono" htmlFor="phone">
            <Input placeholder="Ej: 2477-421234" {...form.register('phone')} />
          </Field>

          <Field
            label="Precio por litro de leche ($)"
            htmlFor="agreedPricePerLiter"
            hint="Con este número el sistema calcula automáticamente cuánto pagarle a este tambo cada mes. Si cambia, lo podés actualizar acá."
          >
            <Input
              type="number"
              step="0.0001"
              inputMode="decimal"
              placeholder="Ej: 650.50"
              {...form.register('agreedPricePerLiter', { valueAsNumber: true })}
            />
          </Field>

          <Field
            label="RENSPA"
            htmlFor="renspa"
            hint="Número SENASA del tambo. Formato: 11.111.1.00111/01"
          >
            <Input placeholder="Ej: 11.111.1.00111/01" {...form.register('renspa')} />
          </Field>

          <Field label="Notas" htmlFor="notes" className="sm:col-span-2">
            <Input placeholder="Observaciones sobre este productor..." {...form.register('notes')} />
          </Field>

          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" loading={isPending}>{initial ? 'Guardar cambios' : 'Crear productor'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ProducersPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ProducerDto | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ['producers'], queryFn: () => producersApi.list() });

  const create = useMutation({
    mutationFn: (i: FormValues) => producersApi.create({
      name: i.name,
      phone: i.phone || undefined,
      city: i.city || undefined,
      agreedPricePerLiter: i.agreedPricePerLiter ? Number(i.agreedPricePerLiter) : undefined,
      renspa: i.renspa || undefined,
      notes: i.notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      toast.success('Productor creado correctamente');
      setShowCreate(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo crear el productor'),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormValues }) =>
      producersApi.update(id, {
        name: data.name,
        phone: data.phone || undefined,
        city: data.city || undefined,
        agreedPricePerLiter: data.agreedPricePerLiter ? Number(data.agreedPricePerLiter) : undefined,
        renspa: data.renspa || undefined,
        notes: data.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      toast.success('Productor actualizado');
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Productores de leche"
        description="Los tambos que entregan leche cruda a la planta. Hacé clic en cualquier fila para editar."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Productores' }]}
        action={
          !showCreate && !editing ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Nuevo productor
            </Button>
          ) : undefined
        }
      />

      {showCreate && (
        <ProducerForm
          title="Nuevo productor"
          onSave={(v) => create.mutateAsync(v)}
          onCancel={() => setShowCreate(false)}
          isPending={create.isPending}
        />
      )}

      {editing && (
        <ProducerForm
          title={`Editando: ${editing.name}`}
          initial={{
            name: editing.name,
            phone: editing.phone,
            city: editing.city,
            agreedPricePerLiter: editing.agreedPricePerLiter,
            renspa: editing.renspa,
            notes: editing.notes,
          }}
          onSave={(v) => update.mutateAsync({ id: editing.id, data: v })}
          onCancel={() => setEditing(null)}
          isPending={update.isPending}
        />
      )}

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => <Card key={i} className="h-20 animate-pulse bg-surface-subtle" />)}
        </div>
      ) : (
        <DataTable
          data={data}
          getKey={(p) => p.id}
          onRowClick={(p) => { setEditing(p); setShowCreate(false); }}
          searchFn={(p, q) => p.name.toLowerCase().includes(q) || (p.city ?? '').toLowerCase().includes(q)}
          searchPlaceholder="Buscar por nombre o ciudad..."
          emptyText="No hay productores cargados todavía. Usá el botón 'Nuevo productor' para agregar el primero."
          columns={[
            { key: 'name', header: 'Nombre', render: (p) => p.name, primary: true },
            { key: 'city', header: 'Ciudad', render: (p) => p.city ?? '—', secondary: true },
            { key: 'phone', header: 'Teléfono', render: (p) => p.phone ?? '—' },
            { key: 'renspa', header: 'RENSPA', render: (p) => p.renspa ?? '—' },
            {
              key: 'price',
              header: 'Precio/litro',
              render: (p) => p.agreedPricePerLiter
                ? <span className="font-medium text-primary-700">${p.agreedPricePerLiter.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                : <span className="text-warning text-xs">Sin precio — tocá para cargar</span>,
              align: 'right',
            },
          ]}
        />
      )}
    </div>
  );
}
