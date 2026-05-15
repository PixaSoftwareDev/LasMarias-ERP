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
import { hrApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import type { CreateEmployeeInput } from '@lasmarias/shared-schemas';

export default function HrPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const employees = useQuery({ queryKey: ['employees'], queryFn: () => hrApi.listEmployees() });
  const today = new Date().toISOString().slice(0, 10);
  const attendance = useQuery<unknown[]>({ queryKey: ['attendance-day', today], queryFn: () => hrApi.attendanceDay(today) as Promise<unknown[]> });

  const form = useForm<CreateEmployeeInput>({ mode: 'onBlur' });

  const create = useMutation({
    mutationFn: (i: CreateEmployeeInput) => hrApi.createEmployee(i),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Empleado creado');
      form.reset();
      setShowForm(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Asistencia y RRHH"
        description="Empleados y marcaciones biométricas del día."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Asistencia' }]}
        action={<Button onClick={() => setShowForm((s) => !s)}><Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo empleado'}</Button>}
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nuevo empleado</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => create.mutateAsync(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="firstName" required error={form.formState.errors.firstName?.message}>
                <Input {...form.register('firstName', { required: 'Requerido' })} />
              </Field>
              <Field label="Apellido" htmlFor="lastName" required error={form.formState.errors.lastName?.message}>
                <Input {...form.register('lastName', { required: 'Requerido' })} />
              </Field>
              <Field label="DNI" htmlFor="documentNumber"><Input {...form.register('documentNumber')} /></Field>
              <Field label="ID en lector biométrico" htmlFor="externalId" hint="Lo manda el lector ZKTeco">
                <Input {...form.register('externalId')} />
              </Field>
              <Field label="Sector" htmlFor="sector"><Input {...form.register('sector')} /></Field>
              <Field label="Turno" htmlFor="shift">
                <select className="min-h-touch w-full rounded-md border border-border px-3" {...form.register('shift')}>
                  <option value="">—</option>
                  <option value="morning">Mañana</option>
                  <option value="afternoon">Tarde</option>
                  <option value="night">Noche</option>
                  <option value="rotating">Rotativo</option>
                </select>
              </Field>
              <Field label="Costo por hora ($)" htmlFor="hourlyCost"><Input type="number" step="0.01" {...form.register('hourlyCost', { valueAsNumber: true })} /></Field>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" loading={create.isPending}>Guardar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-xl font-semibold">Empleados activos</h2>
        {employees.isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : (
          <DataTable
            data={employees.data ?? []}
            getKey={(e) => e.id}
            emptyText="No hay empleados cargados."
            columns={[
              { key: 'name', header: 'Nombre', render: (e) => `${e.firstName} ${e.lastName}`, primary: true },
              { key: 'sector', header: 'Sector', render: (e) => e.sector ?? '—' },
              { key: 'shift', header: 'Turno', render: (e) => e.shift ?? '—' },
              { key: 'external', header: 'ID biométrico', render: (e) => e.externalId ?? '—' },
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Marcaciones de hoy</h2>
        {attendance.isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : (
          <DataTable
            data={(attendance.data as Array<{ id: string; employeeName: string; type: string; timestamp: string; source: string }> | undefined) ?? []}
            getKey={(e) => e.id}
            emptyText="No hay marcaciones todavía hoy."
            columns={[
              { key: 'employee', header: 'Empleado', render: (e) => e.employeeName, primary: true },
              { key: 'type', header: 'Tipo', render: (e) => e.type === 'in' ? 'Entrada' : 'Salida' },
              { key: 'when', header: 'Hora', render: (e) => new Date(e.timestamp).toLocaleTimeString('es-AR') },
              { key: 'source', header: 'Origen', render: (e) => e.source === 'biometric' ? 'Lector' : 'Manual' },
            ]}
          />
        )}
      </section>
    </div>
  );
}
