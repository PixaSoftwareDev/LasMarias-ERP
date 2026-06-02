'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, Power } from 'lucide-react';
import { createClientInputSchema, type CreateClientInput, type Client } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { RowActions } from '@/components/ui/row-actions';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { clientsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const { data = [], isLoading } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });

  const form = useForm<CreateClientInput>({
    resolver: zodResolver(createClientInputSchema),
    mode: 'onBlur',
    defaultValues: { type: 'minorista' },
  });

  useEffect(() => {
    if (editing) {
      form.reset({
        businessName: editing.businessName,
        taxId: editing.taxId,
        type: editing.type,
        email: editing.email,
        phone: editing.phone,
        address: editing.address,
        city: editing.city,
        notes: editing.notes,
      });
    }
  }, [editing, form]);

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    form.reset({ type: 'minorista' });
  }

  const save = useMutation({
    mutationFn: (i: CreateClientInput) => (editing ? clientsApi.update(editing.id, i) : clientsApi.create(i)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(editing ? 'Cliente actualizado' : 'Cliente creado');
      closeForm();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al guardar'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => clientsApi.update(id, { isActive }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(vars.isActive ? 'Cliente activado' : 'Cliente desactivado');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al actualizar'),
  });

  function onDeactivate(c: Client) {
    if (!window.confirm(`¿Desactivar "${c.businessName}"? No aparecerá al tomar nuevos pedidos.`)) return;
    toggleActive.mutate({ id: c.id, isActive: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/admin"><ArrowLeft className="h-4 w-4" /> Datos maestros</Link>
      </Button>
      <PageHeader
        title="Clientes"
        description="Comercios y compradores del sistema."        action={<Button onClick={() => (showForm ? closeForm() : setShowForm(true))}><Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo cliente'}</Button>}
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{editing ? 'Editar cliente' : 'Nuevo cliente'}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => save.mutateAsync(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <Button type="button" variant="ghost" onClick={closeForm}>Cancelar</Button>
                <Button type="submit" loading={save.isPending}>Guardar</Button>
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
          getSearchText={(c) => `${c.businessName} ${c.taxId ?? ''} ${c.city ?? ''}`}
          searchPlaceholder="Buscar por razón social, CUIT o ciudad…"
          columns={[
            { key: 'name', header: 'Razón social', render: (c) => c.businessName, primary: true, sortValue: (c) => c.businessName },
            { key: 'type', header: 'Tipo', render: (c) => <span className="capitalize">{c.type}</span>, sortValue: (c) => c.type },
            { key: 'taxId', header: 'CUIT', render: (c) => c.taxId ?? '—', secondary: true },
            { key: 'city', header: 'Ciudad', render: (c) => c.city ?? '—', sortValue: (c) => c.city ?? '' },
            { key: 'phone', header: 'Teléfono', render: (c) => c.phone ?? '—' },
            { key: 'status', header: 'Estado', render: (c) => (
              <StatusBadge status={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
            )},
            { key: 'actions', header: '', align: 'right', render: (c) => (
              <RowActions
                label={`Acciones de ${c.businessName}`}
                actions={[
                  { label: 'Editar', icon: Pencil, onClick: () => { setEditing(c); setShowForm(true); } },
                  c.isActive
                    ? { label: 'Desactivar', icon: Power, onClick: () => onDeactivate(c), destructive: true }
                    : { label: 'Activar', icon: Power, onClick: () => toggleActive.mutate({ id: c.id, isActive: true }) },
                ]}
              />
            )},
          ]}
        />
      )}
    </div>
  );
}
