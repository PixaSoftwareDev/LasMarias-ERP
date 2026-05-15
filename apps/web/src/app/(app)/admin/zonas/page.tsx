'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import {
  createDeliveryZoneInputSchema,
  type CreateDeliveryZoneInput,
  type Weekday,
} from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { PageHeader } from '@/components/page-header';
import { deliveryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

const WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 'mon', label: 'Lun' },
  { value: 'tue', label: 'Mar' },
  { value: 'wed', label: 'Mié' },
  { value: 'thu', label: 'Jue' },
  { value: 'fri', label: 'Vie' },
  { value: 'sat', label: 'Sáb' },
  { value: 'sun', label: 'Dom' },
];

export default function ZonesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ['delivery-zones'], queryFn: () => deliveryApi.listZones() });

  const form = useForm<CreateDeliveryZoneInput>({
    resolver: zodResolver(createDeliveryZoneInputSchema),
    mode: 'onBlur',
    defaultValues: { deliveryDays: [], cutoffTime: '14:00' },
  });
  const selectedDays = form.watch('deliveryDays') ?? [];

  const create = useMutation({
    mutationFn: (i: CreateDeliveryZoneInput) => deliveryApi.createZone(i),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-zones'] });
      toast.success('Zona creada');
      form.reset({ deliveryDays: [], cutoffTime: '14:00' });
      setShowForm(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error'),
  });

  function toggleDay(d: Weekday) {
    const cur = form.getValues('deliveryDays') ?? [];
    form.setValue('deliveryDays', cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d], { shouldValidate: true });
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Zonas de reparto"
        description="Días recurrentes, hora de corte y excepciones por zona."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { href: '/admin', label: 'Administración' }, { label: 'Zonas' }]}
        action={<Button onClick={() => setShowForm((s) => !s)}><Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nueva zona'}</Button>}
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nueva zona</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => create.mutateAsync(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="name" required error={form.formState.errors.name?.message}>
                <Input placeholder="Pergamino centro" {...form.register('name')} />
              </Field>
              <Field label="Hora de corte" htmlFor="cutoffTime" required hint="Pedidos cargados después de esta hora pasan al próximo reparto" error={form.formState.errors.cutoffTime?.message}>
                <Input type="time" {...form.register('cutoffTime')} />
              </Field>
              <Field label="Días de reparto" htmlFor="deliveryDays" required error={form.formState.errors.deliveryDays?.message} className="sm:col-span-2">
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((w) => (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => toggleDay(w.value)}
                      className={`min-h-touch min-w-touch rounded-md border px-4 py-2 text-sm ${selectedDays.includes(w.value) ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-border bg-surface-elevated'}`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Descripción" htmlFor="description" className="sm:col-span-2">
                <Input {...form.register('description')} />
              </Field>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" loading={create.isPending}>Guardar zona</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : (
        <DataTable
          data={data}
          getKey={(z) => z.id}
          emptyText="No hay zonas configuradas."
          columns={[
            { key: 'name', header: 'Nombre', render: (z) => z.name, primary: true },
            { key: 'days', header: 'Días', render: (z) => z.deliveryDays.map((d) => WEEKDAYS.find((w) => w.value === d)?.label).join(', '), secondary: true },
            { key: 'cutoff', header: 'Cutoff', render: (z) => z.cutoffTime },
          ]}
        />
      )}
    </div>
  );
}
