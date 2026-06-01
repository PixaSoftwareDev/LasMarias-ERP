'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { RowActions } from '@/components/ui/row-actions';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { producersApi } from '@/features/api';
import type { ProducerDto } from '@/features/receptions/types';
import { ApiError } from '@/lib/api-client';

interface FormValues {
  name: string;
  taxId?: string;
  phone?: string;
  city?: string;
  address?: string;
  agreedPricePerLiter?: number;
  notes?: string;
}

const emptyDefaults: FormValues = { name: '', taxId: '', phone: '', city: '', address: '', notes: '' };

export default function ProducersPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProducerDto | null>(null);
  const { data = [], isLoading } = useQuery({ queryKey: ['producers'], queryFn: () => producersApi.list() });

  const form = useForm<FormValues>({ mode: 'onBlur', defaultValues: emptyDefaults });

  useEffect(() => {
    if (editing) {
      form.reset({
        name: editing.name,
        taxId: editing.taxId ?? '',
        phone: editing.phone ?? '',
        city: editing.city ?? '',
        agreedPricePerLiter: editing.agreedPricePerLiter,
      });
    }
  }, [editing, form]);

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    form.reset(emptyDefaults);
  }

  const save = useMutation({
    mutationFn: (i: FormValues) => {
      const body = {
        name: i.name,
        taxId: i.taxId || undefined,
        phone: i.phone || undefined,
        city: i.city || undefined,
        address: i.address || undefined,
        notes: i.notes || undefined,
        agreedPricePerLiter: i.agreedPricePerLiter ? Number(i.agreedPricePerLiter) : undefined,
      };
      return editing ? producersApi.update(editing.id, body) : producersApi.create(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      toast.success(editing ? 'Productor actualizado' : 'Productor creado');
      closeForm();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al guardar'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => producersApi.update(id, { isActive }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      toast.success(vars.isActive ? 'Productor activado' : 'Productor desactivado');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al actualizar'),
  });

  function onDeactivate(p: ProducerDto) {
    if (!window.confirm(`¿Desactivar "${p.name}"? No aparecerá al cargar nuevas recepciones de leche.`)) return;
    toggleActive.mutate({ id: p.id, isActive: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/admin"><ArrowLeft className="h-4 w-4" /> Datos maestros</Link>
      </Button>
      <PageHeader
        title="Productores de leche"
        description="Tambos que entregan leche cruda a la planta."        action={<Button onClick={() => (showForm ? closeForm() : setShowForm(true))}><Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo productor'}</Button>}
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{editing ? 'Editar productor' : 'Nuevo productor'}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => save.mutateAsync(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="name" required error={form.formState.errors.name?.message} className="sm:col-span-2">
                <Input placeholder="Tambo La Esperanza" {...form.register('name', { required: 'Ingresá el nombre' })} />
              </Field>
              <Field label="CUIT" htmlFor="taxId">
                <Input placeholder="20-12345678-9" {...form.register('taxId')} />
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
              <Field label="Dirección" htmlFor="address" className="sm:col-span-2">
                <Input {...form.register('address')} />
              </Field>
              <Field label="Notas" htmlFor="notes" className="sm:col-span-2">
                <Input {...form.register('notes')} />
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
          getKey={(p) => p.id}
          emptyText="No hay productores cargados todavía."
          columns={[
            { key: 'name', header: 'Nombre', render: (p) => p.name, primary: true },
            { key: 'city', header: 'Ciudad', render: (p) => p.city ?? '—' },
            { key: 'phone', header: 'Teléfono', render: (p) => p.phone ?? '—' },
            { key: 'price', header: 'Precio/L', render: (p) => p.agreedPricePerLiter ? `$${p.agreedPricePerLiter}` : '—', align: 'right' },
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
