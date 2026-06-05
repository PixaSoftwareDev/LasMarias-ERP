'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Plus, Power, Snowflake } from 'lucide-react';
import {
  createWarehouseInputSchema,
  type CreateWarehouseInput,
  type Warehouse,
} from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { RowActions } from '@/components/ui/row-actions';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { inventoryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/hooks/use-confirm';

// Cámaras y sectores físicos donde se almacenan los lotes (CLAUDE.md §4.4).
const KIND_LABEL: Record<Warehouse['kind'], string> = {
  cold_chamber: 'Cámara de frío',
  sector: 'Sector',
  dry_storage: 'Depósito seco',
  maturation: 'Maduración',
  silo: 'Silo de leche',
};

const EMPTY: CreateWarehouseInput = { code: '', name: '', kind: 'cold_chamber' };

export default function WarehousesPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);

  // includeInactive=true: la pantalla de gestión muestra también las desactivadas
  // para poder reactivarlas. Los selectores de la app siguen usando ['warehouses'].
  const { data = [], isLoading } = useQuery({
    queryKey: ['warehouses', 'all'],
    queryFn: () => inventoryApi.listWarehouses(true),
  });

  const form = useForm<CreateWarehouseInput>({
    resolver: zodResolver(createWarehouseInputSchema),
    mode: 'onBlur',
    defaultValues: EMPTY,
  });

  // Precarga del form al pasar a modo edición.
  useEffect(() => {
    if (editing) {
      form.reset({
        code: editing.code,
        name: editing.name,
        kind: editing.kind,
        targetTemperatureCelsius: editing.targetTemperatureCelsius,
        capacityLiters: editing.capacityLiters,
      });
    }
  }, [editing, form]);

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    form.reset(EMPTY);
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['warehouses'] });

  const save = useMutation({
    mutationFn: (i: CreateWarehouseInput) =>
      editing ? inventoryApi.updateWarehouse(editing.id, i) : inventoryApi.createWarehouse(i),
    onSuccess: () => {
      invalidate();
      toast.success(editing ? 'Cámara actualizada' : 'Cámara creada');
      closeForm();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      inventoryApi.updateWarehouse(id, { isActive }),
    onSuccess: (_, vars) => {
      invalidate();
      toast.success(vars.isActive ? 'Cámara activada' : 'Cámara desactivada');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo actualizar. Probá de nuevo.'),
  });

  async function onDeactivate(w: Warehouse) {
    const ok = await confirm({
      title: `Desactivar ${w.name}`,
      message: 'No aparecerá al asignar lotes a una cámara. La podés reactivar cuando quieras.',
      confirmLabel: 'Desactivar',
      destructive: true,
    });
    if (ok) toggleActive.mutate({ id: w.id, isActive: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/admin"><ArrowLeft className="h-4 w-4" /> Datos maestros</Link>
      </Button>
      <PageHeader
        title="Cámaras y sectores"
        description="Lugares físicos donde se almacenan los lotes: cámaras de frío, depósitos, maduración y silos de leche (con su capacidad en litros)."
        action={
          <Button onClick={() => (showForm ? closeForm() : setShowForm(true))}>
            <Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nueva cámara'}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{editing ? 'Editar cámara' : 'Nueva cámara'}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => save.mutateAsync(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Código" htmlFor="code" required error={form.formState.errors.code?.message}>
                <Input autoFocus placeholder="CF-01" {...form.register('code')} />
              </Field>
              <Field label="Nombre" htmlFor="name" required error={form.formState.errors.name?.message}>
                <Input placeholder="Cámara de frío 1" {...form.register('name')} />
              </Field>
              <Field label="Tipo" htmlFor="kind" required error={form.formState.errors.kind?.message}>
                <select id="kind" className="min-h-touch w-full rounded-md border border-border px-3" {...form.register('kind')}>
                  <option value="cold_chamber">Cámara de frío</option>
                  <option value="sector">Sector</option>
                  <option value="dry_storage">Depósito seco</option>
                  <option value="maturation">Maduración</option>
                  <option value="silo">Silo de leche</option>
                </select>
              </Field>
              {form.watch('kind') === 'silo' ? (
                <Field label="Capacidad (litros)" htmlFor="capacityLiters" required error={form.formState.errors.capacityLiters?.message} hint="Para mostrar el nivel del silo.">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    placeholder="Ej: 10000"
                    {...form.register('capacityLiters', { setValueAs: (v) => (v === '' || v === null || Number.isNaN(Number(v)) ? undefined : Number(v)) })}
                  />
                </Field>
              ) : (
                <Field label="Temperatura objetivo (°C)" htmlFor="targetTemperatureCelsius" error={form.formState.errors.targetTemperatureCelsius?.message} hint="Opcional">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="Ej: 4"
                    {...form.register('targetTemperatureCelsius', { setValueAs: (v) => (v === '' || v === null || Number.isNaN(Number(v)) ? undefined : Number(v)) })}
                  />
                </Field>
              )}
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={closeForm}>Cancelar</Button>
                <Button type="submit" loading={save.isPending}>Guardar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Snowflake}
          title="Sin cámaras cargadas"
          description="Creá tu primera cámara o sector para poder asignar lotes a un lugar físico."
        />
      ) : (
        <DataTable
          data={data}
          getKey={(w) => w.id}
          getSearchText={(w) => `${w.code} ${w.name}`}
          searchPlaceholder="Buscar por nombre o código…"
          columns={[
            { key: 'code', header: 'Código', render: (w) => <span className="font-mono text-xs">{w.code}</span>, secondary: true, sortValue: (w) => w.code },
            { key: 'name', header: 'Nombre', render: (w) => w.name, primary: true, sortValue: (w) => w.name },
            { key: 'kind', header: 'Tipo', render: (w) => KIND_LABEL[w.kind], sortValue: (w) => KIND_LABEL[w.kind] },
            { key: 'temp', header: 'Temp. / Capacidad', align: 'right', render: (w) => (
              w.kind === 'silo'
                ? (typeof w.capacityLiters === 'number' ? `${w.capacityLiters.toLocaleString('es-AR')} L` : '—')
                : (typeof w.targetTemperatureCelsius === 'number' ? `${w.targetTemperatureCelsius} °C` : '—')
            ) },
            { key: 'status', header: 'Estado', render: (w) => (
              <StatusBadge status={w.isActive ? 'success' : 'neutral'}>{w.isActive ? 'Activa' : 'Inactiva'}</StatusBadge>
            )},
            { key: 'actions', header: '', align: 'right', render: (w) => (
              <RowActions
                label={`Acciones de ${w.name}`}
                actions={[
                  { label: 'Editar', icon: Pencil, onClick: () => { setEditing(w); setShowForm(true); } },
                  w.isActive
                    ? { label: 'Desactivar', icon: Power, onClick: () => onDeactivate(w), destructive: true }
                    : { label: 'Activar', icon: Power, onClick: () => toggleActive.mutate({ id: w.id, isActive: true }) },
                ]}
              />
            )},
          ]}
        />
      )}
    </div>
  );
}
