'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { ArrowLeft, Milk, Pencil, Plus, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { RowActions } from '@/components/ui/row-actions';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { producersApi, exchangeRatesApi, settingsApi } from '@/features/api';
import { ivaFactor } from '@lasmarias/shared-schemas';
import type { ProducerDto } from '@/features/receptions/types';
import { ApiError } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';
import { useConfirm } from '@/hooks/use-confirm';

interface FormValues {
  name: string;
  taxId?: string;
  phone?: string;
  city?: string;
  address?: string;
  agreedPricePerLiter?: number;
  priceCurrency?: 'ARS' | 'USD' | 'EUR';
  priceIvaMode?: 'sin_iva' | 'con_iva';
  notes?: string;
}

const emptyDefaults: FormValues = { name: '', taxId: '', phone: '', city: '', address: '', notes: '', priceCurrency: 'ARS', priceIvaMode: 'sin_iva' };

export default function ProducersPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProducerDto | null>(null);
  const { data = [], isLoading } = useQuery({ queryKey: ['producers'], queryFn: () => producersApi.list() });
  const latestRate = useQuery({ queryKey: ['exchange-rate-latest'], queryFn: () => exchangeRatesApi.latest() });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => settingsApi.get() });
  const ivaRate = settingsQuery.data?.company.ivaRate ?? 21;

  const form = useForm<FormValues>({ mode: 'onBlur', defaultValues: emptyDefaults });
  const watchPrice = form.watch('agreedPricePerLiter');
  const watchCurrency = form.watch('priceCurrency') ?? 'ARS';
  const watchIva = form.watch('priceIvaMode') ?? 'sin_iva';
  // Precio efectivo por litro en pesos: convertido (si es USD/EUR) y con IVA si corresponde.
  const priceArsEquiv = (() => {
    if (!watchPrice) return null;
    let ars = Number(watchPrice);
    if (watchCurrency !== 'ARS') {
      if (!latestRate.data) return null;
      ars *= watchCurrency === 'USD' ? latestRate.data.usd : latestRate.data.eur;
    } else if (watchIva !== 'con_iva') {
      // En pesos y sin IVA no hay nada para previsualizar (el precio ya es el final).
      return null;
    }
    return ars * ivaFactor(watchIva, ivaRate);
  })();

  useEffect(() => {
    if (editing) {
      form.reset({
        name: editing.name,
        taxId: editing.taxId ?? '',
        phone: editing.phone ?? '',
        city: editing.city ?? '',
        agreedPricePerLiter: editing.agreedPricePerLiter,
        priceCurrency: editing.priceCurrency ?? 'ARS',
        priceIvaMode: editing.priceIvaMode ?? 'sin_iva',
      });
    }
  }, [editing, form]);

  // Al abrir el formulario (sobre todo al "Editar" desde una fila de más abajo) llevamos
  // la vista al tope para que se vea. Scroll instantáneo y diferido: el suave lo pisa el
  // foco que el menú de acciones (Radix) devuelve al cerrarse, y parecía que "no pasa nada".
  useEffect(() => {
    if (!showForm) return;
    const t = setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 120);
    return () => clearTimeout(t);
  }, [showForm, editing]);

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
        priceCurrency: i.priceCurrency ?? 'ARS',
        priceIvaMode: i.priceIvaMode ?? 'sin_iva',
      };
      return editing ? producersApi.update(editing.id, body) : producersApi.create(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      toast.success(editing ? 'Productor actualizado' : 'Productor creado');
      closeForm();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => producersApi.update(id, { isActive }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      toast.success(vars.isActive ? 'Productor activado' : 'Productor desactivado');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo actualizar. Probá de nuevo.'),
  });

  async function onDeactivate(p: ProducerDto) {
    const ok = await confirm({
      title: `Desactivar ${p.name}`,
      message: 'No aparecerá al cargar nuevas recepciones de leche. Lo podés reactivar cuando quieras.',
      confirmLabel: 'Desactivar',
      destructive: true,
    });
    if (ok) toggleActive.mutate({ id: p.id, isActive: false });
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
                <Input autoFocus placeholder="Tambo La Esperanza" {...form.register('name', { required: 'Ingresá el nombre' })} />
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
              <Field
                label="Precio acordado por litro"
                htmlFor="agreedPricePerLiter"
                hint={
                  priceArsEquiv != null
                    ? `≈ ${formatMoney(priceArsEquiv)} /L ${watchIva === 'con_iva' ? 'con IVA' : '(con la última cotización)'}`.trim()
                    : 'Precio de la leche. Si es en USD/EUR, se convierte a $ al recibir.'
                }
              >
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input type="number" step="0.0001" inputMode="decimal" suffix="/L" placeholder="Ej: 320" className="flex-1" {...form.register('agreedPricePerLiter', { valueAsNumber: true })} />
                  <select
                    aria-label="Moneda del precio"
                    className="min-h-touch w-full sm:w-24 rounded-md border border-border bg-surface-elevated px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                    {...form.register('priceCurrency')}
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </Field>
              <Field
                label="IVA del precio"
                htmlFor="priceIvaMode"
                hint={watchIva === 'con_iva' ? `Se le suma el ${ivaRate}% al recibir.` : 'El precio va directo, sin sumar IVA.'}
              >
                <select
                  id="priceIvaMode"
                  className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                  {...form.register('priceIvaMode')}
                >
                  <option value="sin_iva">Sin IVA</option>
                  <option value="con_iva">Con IVA (+{ivaRate}%)</option>
                </select>
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

      {isLoading ? <TableSkeleton /> : (
        <DataTable
          data={data}
          getKey={(p) => p.id}
          emptyIcon={Milk}
          emptyTitle="No hay tambos cargados todavía"
          emptyDescription="Cargá tu primer tambo para poder registrar recepciones de leche y sus pagos."
          getSearchText={(p) => `${p.name} ${p.city ?? ''}`}
          searchPlaceholder="Buscar por nombre o ciudad…"
          columns={[
            { key: 'name', header: 'Nombre', render: (p) => p.name, primary: true, sortValue: (p) => p.name },
            { key: 'city', header: 'Ciudad', render: (p) => p.city ?? '—', sortValue: (p) => p.city ?? '' },
            { key: 'phone', header: 'Teléfono', render: (p) => p.phone ?? '—' },
            { key: 'price', header: 'Precio/L', render: (p) => p.agreedPricePerLiter ? `$${p.agreedPricePerLiter}` : '—', align: 'right', sortValue: (p) => Number(p.agreedPricePerLiter ?? 0) },
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
