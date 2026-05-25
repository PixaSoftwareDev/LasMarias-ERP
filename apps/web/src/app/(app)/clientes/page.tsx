'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { createClientInputSchema, type Client, type CreateClientInput } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/page-header';
import { clientsApi, deliveryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

const TYPE_LABELS: Record<string, string> = {
  minorista: 'Minorista',
  mayorista: 'Mayorista',
  distribuidor: 'Distribuidor',
};

function ClientForm({
  title,
  initial,
  zones,
  onSave,
  onCancel,
  isPending,
}: {
  title: string;
  initial?: Partial<CreateClientInput>;
  zones: { id: string; name: string }[];
  onSave: (v: CreateClientInput) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const form = useForm<CreateClientInput>({
    resolver: zodResolver(createClientInputSchema),
    mode: 'onBlur',
    defaultValues: { type: 'minorista', ...initial },
  });

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
          <Field label="Razón social" htmlFor="businessName" required error={form.formState.errors.businessName?.message} className="sm:col-span-2">
            <Input placeholder="Ej: Almacén El Lechero SRL" {...form.register('businessName')} />
          </Field>
          <Field label="CUIT" htmlFor="taxId" error={form.formState.errors.taxId?.message} hint="Ej: 20-12345678-9">
            <Input placeholder="20-12345678-9" {...form.register('taxId')} />
          </Field>
          <Field label="Tipo de cliente" htmlFor="type" required>
            <select className="flex min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600" {...form.register('type')}>
              <option value="minorista">Minorista</option>
              <option value="mayorista">Mayorista</option>
              <option value="distribuidor">Distribuidor</option>
            </select>
          </Field>
          <Field label="Zona de reparto" htmlFor="zoneId" hint="Determina qué días se le reparte automáticamente">
            <select className="flex min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600" {...form.register('zoneId')}>
              <option value="">(sin zona asignada)</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input type="email" placeholder="contacto@empresa.com" {...form.register('email')} />
          </Field>
          <Field label="Teléfono" htmlFor="phone">
            <Input placeholder="Ej: 011-4444-5678" {...form.register('phone')} />
          </Field>
          <Field label="Dirección" htmlFor="address" className="sm:col-span-2">
            <Input placeholder="Ej: Av. Constitución 1240, Pergamino" {...form.register('address')} />
          </Field>
          <Field label="Ciudad" htmlFor="city">
            <Input placeholder="Ej: Pergamino" {...form.register('city')} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" loading={isPending}>{initial ? 'Guardar cambios' : 'Crear cliente'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const { data = [], isLoading } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const zonesQuery = useQuery({ queryKey: ['delivery-zones'], queryFn: () => deliveryApi.listZones() });
  const zones = zonesQuery.data ?? [];

  const create = useMutation({
    mutationFn: (i: CreateClientInput) => clientsApi.create(i),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Cliente creado');
      setShowCreate(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo crear el cliente'),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateClientInput> }) => clientsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Cliente actualizado');
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Clientes"
        description="Los comercios y compradores. Hacé clic en una fila para editar."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Clientes' }]}
        action={
          !showCreate && !editing ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Nuevo cliente
            </Button>
          ) : undefined
        }
      />

      {showCreate && (
        <ClientForm
          title="Nuevo cliente"
          zones={zones}
          onSave={(v) => create.mutateAsync(v)}
          onCancel={() => setShowCreate(false)}
          isPending={create.isPending}
        />
      )}

      {editing && (
        <ClientForm
          title={`Editando: ${editing.businessName}`}
          initial={{
            businessName: editing.businessName,
            taxId: editing.taxId,
            type: editing.type,
            email: editing.email,
            phone: editing.phone,
            address: editing.address,
            city: editing.city,
            zoneId: editing.zoneId,
          }}
          zones={zones}
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
          getKey={(c) => c.id}
          onRowClick={(c) => { setEditing(c); setShowCreate(false); }}
          searchFn={(c, q) =>
            c.businessName.toLowerCase().includes(q) ||
            (c.taxId ?? '').toLowerCase().includes(q) ||
            (c.city ?? '').toLowerCase().includes(q)
          }
          searchPlaceholder="Buscar por nombre, CUIT o ciudad..."
          emptyText="No hay clientes todavía. Usá el botón 'Nuevo cliente' para agregar el primero."
          columns={[
            { key: 'name', header: 'Razón social', render: (c) => c.businessName, primary: true },
            { key: 'type', header: 'Tipo', render: (c) => TYPE_LABELS[c.type] ?? c.type, secondary: true },
            { key: 'taxId', header: 'CUIT', render: (c) => c.taxId ?? '—' },
            { key: 'city', header: 'Ciudad', render: (c) => c.city ?? '—' },
            { key: 'phone', header: 'Teléfono', render: (c) => c.phone ?? '—' },
          ]}
        />
      )}
    </div>
  );
}
