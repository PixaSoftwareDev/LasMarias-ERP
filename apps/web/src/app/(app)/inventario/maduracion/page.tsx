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
import { maturationApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

interface RecordForm {
  batchId: string;
  checkedAt: string;
  weightKg: number;
  notes?: string;
}

export default function MaturationPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [batchIdFilter, setBatchIdFilter] = useState('');

  const { data = [], isLoading } = useQuery({
    queryKey: ['maturation-records', batchIdFilter],
    queryFn: () => (batchIdFilter ? maturationApi.listByBatch(batchIdFilter) : Promise.resolve([])),
    enabled: !!batchIdFilter,
  });

  const form = useForm<RecordForm>({ mode: 'onBlur' });

  const create = useMutation({
    mutationFn: (i: RecordForm) =>
      maturationApi.create({
        ...i,
        weightKg: Number(i.weightKg),
        checkedAt: new Date(i.checkedAt).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maturation-records'] });
      toast.success('Pesaje registrado');
      form.reset();
      setShowForm(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al guardar'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Maduración"
        description="Pesajes periódicos de lotes en cámara. Permite seguir la merma real durante el proceso."
        breadcrumbs={[
          { href: '/dashboard', label: 'Inicio' },
          { href: '/inventario', label: 'Inventario' },
          { label: 'Maduración' },
        ]}
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Registrar pesaje'}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nuevo pesaje</CardTitle></CardHeader>
          <CardContent>
            <form
              onSubmit={form.handleSubmit((v) => create.mutateAsync(v))}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <Field label="ID del lote" htmlFor="batchId" required error={form.formState.errors.batchId?.message} className="sm:col-span-2">
                <Input placeholder="UUID del lote (escaneá el QR o pegalo)" {...form.register('batchId', { required: 'Ingresá el ID del lote' })} />
              </Field>
              <Field label="Fecha y hora del pesaje" htmlFor="checkedAt" required error={form.formState.errors.checkedAt?.message}>
                <Input type="datetime-local" {...form.register('checkedAt', { required: 'Ingresá la fecha' })} />
              </Field>
              <Field label="Peso actual (kg)" htmlFor="weightKg" required error={form.formState.errors.weightKg?.message}>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  placeholder="Ej: 48.750"
                  {...form.register('weightKg', { required: 'Ingresá el peso', valueAsNumber: true })}
                />
              </Field>
              <Field label="Notas" htmlFor="notes" className="sm:col-span-2">
                <Input placeholder="Observaciones opcionales" {...form.register('notes')} />
              </Field>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" loading={create.isPending}>Guardar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Buscar por lote</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="ID del lote (UUID)"
              value={batchIdFilter}
              onChange={(e) => setBatchIdFilter(e.target.value)}
              className="max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      {batchIdFilter && (
        isLoading ? (
          <Card className="h-40 animate-pulse bg-surface-subtle" />
        ) : (
          <DataTable
            data={data as Array<{ id: string; checkedAt: string; weightKg: number; notes?: string; createdAt: string }>}
            getKey={(r) => r.id}
            emptyText="No hay registros para este lote."
            columns={[
              { key: 'checkedAt', header: 'Fecha', render: (r) => new Date(r.checkedAt).toLocaleString('es-AR'), primary: true },
              { key: 'weightKg', header: 'Peso (kg)', render: (r) => `${r.weightKg} kg`, align: 'right' as const },
              { key: 'notes', header: 'Notas', render: (r) => r.notes ?? '—' },
            ]}
          />
        )
      )}
    </div>
  );
}
