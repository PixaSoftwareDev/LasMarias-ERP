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
import { StatusBadge } from '@/components/ui/status-badge';
import { suppliersApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

interface SupplierForm {
  businessName: string;
  taxId?: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

export default function PurchasingPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => suppliersApi.list() });
  const orders = useQuery({ queryKey: ['purchase-orders'], queryFn: () => suppliersApi.listPurchaseOrders() });
  const form = useForm<SupplierForm>({ mode: 'onBlur' });

  const create = useMutation({
    mutationFn: (i: SupplierForm) => suppliersApi.create({ ...i, email: i.email || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Proveedor creado');
      form.reset();
      setShowForm(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error'),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Compras"
        description="Proveedores y órdenes de compra."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Compras' }]}
        action={<Button onClick={() => setShowForm((s) => !s)}><Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo proveedor'}</Button>}
      />

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Nuevo proveedor</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => create.mutateAsync(v))} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Razón social" htmlFor="businessName" required error={form.formState.errors.businessName?.message}>
                <Input {...form.register('businessName', { required: 'Requerido' })} />
              </Field>
              <Field label="CUIT" htmlFor="taxId"><Input {...form.register('taxId')} /></Field>
              <Field label="Contacto" htmlFor="contactName"><Input {...form.register('contactName')} /></Field>
              <Field label="Email" htmlFor="email"><Input type="email" {...form.register('email')} /></Field>
              <Field label="Teléfono" htmlFor="phone"><Input {...form.register('phone')} /></Field>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" loading={create.isPending}>Guardar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-xl font-semibold">Proveedores</h2>
        {suppliers.isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : (
          <DataTable
            data={suppliers.data ?? []}
            getKey={(s) => s.id}
            emptyText="No hay proveedores cargados."
            columns={[
              { key: 'name', header: 'Razón social', render: (s) => s.businessName, primary: true },
              { key: 'tax', header: 'CUIT', render: (s) => s.taxId ?? '—', secondary: true },
              { key: 'contact', header: 'Contacto', render: (s) => s.contactName ?? '—' },
              { key: 'phone', header: 'Teléfono', render: (s) => s.phone ?? '—' },
            ]}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Órdenes de compra</h2>
        {orders.isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : (
          <DataTable
            data={orders.data ?? []}
            getKey={(o) => o.id}
            emptyText="No hay órdenes de compra."
            columns={[
              { key: 'code', header: 'Código', render: (o) => <span className="font-mono text-xs">{o.code}</span>, primary: true },
              { key: 'supplier', header: 'Proveedor', render: (o) => o.supplierName, secondary: true },
              { key: 'ordered', header: 'Fecha', render: (o) => formatDateTime(o.orderedAt) },
              { key: 'total', header: 'Total', render: (o) => `$${o.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`, align: 'right' },
              { key: 'status', header: 'Estado', render: (o) => <StatusBadge status={o.status === 'received' || o.status === 'invoiced' ? 'success' : 'info'}>{o.status}</StatusBadge> },
            ]}
          />
        )}
      </section>
    </div>
  );
}
