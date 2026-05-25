'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { invoicesApi } from '@/features/api';
import { formatDateTime } from '@/lib/utils';
import type { Invoice } from '@lasmarias/shared-schemas';

interface AccountsReceivableRow {
  invoiceId: string;
  number: string;
  clientName: string;
  total: number;
  paid: number;
  pending: number;
  dueDate?: string;
  daysOverdue: number;
}

function statusBadge(s: Invoice['status']): { variant: Status; label: string } {
  switch (s) {
    case 'draft':     return { variant: 'neutral', label: 'Borrador' };
    case 'issued':    return { variant: 'info',    label: 'Emitido' };
    case 'paid':      return { variant: 'success', label: 'Pagado' };
    case 'cancelled': return { variant: 'danger',  label: 'Anulado' };
  }
}

export default function InvoicesPage() {
  const invoicesQuery = useQuery({ queryKey: ['invoices'], queryFn: () => invoicesApi.list() });
  const arQuery = useQuery({
    queryKey: ['accounts-receivable'],
    queryFn: () => invoicesApi.accountsReceivable() as Promise<AccountsReceivableRow[]>,
  });

  const overdue = arQuery.data?.filter((r) => r.daysOverdue > 0) ?? [];
  const totalPending = arQuery.data?.reduce((sum, r) => sum + r.pending, 0) ?? 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Comprobantes"
        description="Facturas y cuenta corriente de clientes."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Comprobantes' }]}
      />

      {/* Resumen de cuentas por cobrar */}
      {arQuery.data && arQuery.data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground-muted">Total a cobrar</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                ${totalPending.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-foreground-muted">{arQuery.data.length} comprobante{arQuery.data.length !== 1 ? 's' : ''} pendiente{arQuery.data.length !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>

          <Card className={overdue.length > 0 ? 'border-danger/40' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-foreground-muted">
                {overdue.length > 0 && <AlertTriangle className="h-4 w-4 text-danger" aria-hidden="true" />}
                Vencidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${overdue.length > 0 ? 'text-danger' : 'text-foreground'}`}>
                {overdue.length > 0
                  ? `$${overdue.reduce((s, r) => s + r.pending, 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
                  : '—'}
              </p>
              <p className="text-xs text-foreground-muted">
                {overdue.length > 0 ? `${overdue.length} factura${overdue.length !== 1 ? 's' : ''} vencida${overdue.length !== 1 ? 's' : ''}` : 'Sin vencidos'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-foreground-muted">Clientes morosos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">
                {new Set(overdue.map((r) => r.clientName)).size || '—'}
              </p>
              <p className="text-xs text-foreground-muted">con facturas vencidas</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabla de cuentas por cobrar si hay saldo pendiente */}
      {arQuery.data && arQuery.data.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Cuentas por cobrar</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              data={arQuery.data}
              getKey={(r) => r.invoiceId}
              columns={[
                { key: 'number', header: 'Número', render: (r) => <span className="font-mono text-xs">{r.number}</span>, secondary: true },
                { key: 'client', header: 'Cliente', render: (r) => r.clientName, primary: true },
                { key: 'due', header: 'Vence', render: (r) => r.dueDate ? new Date(r.dueDate).toLocaleDateString('es-AR') : '—' },
                {
                  key: 'overdue',
                  header: 'Mora',
                  align: 'right',
                  render: (r) =>
                    r.daysOverdue > 0 ? (
                      <span className="font-semibold text-danger">{r.daysOverdue}d</span>
                    ) : (
                      <span className="text-foreground-muted">Al día</span>
                    ),
                },
                { key: 'pending', header: 'Pendiente', render: (r) => `$${r.pending.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, align: 'right' },
              ]}
            />
          </CardContent>
        </Card>
      )}

      {/* Historial completo de comprobantes */}
      <Card>
        <CardHeader><CardTitle>Todos los comprobantes</CardTitle></CardHeader>
        <CardContent className="p-0">
          {invoicesQuery.isLoading ? (
            <div className="h-40 animate-pulse bg-surface-subtle" />
          ) : invoicesQuery.data?.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Receipt}
                title="Todavía no hay comprobantes"
                description="Los comprobantes se emiten desde un pedido en estado preparado, cargado o entregado."
              />
            </div>
          ) : (
            <DataTable
              data={invoicesQuery.data ?? []}
              getKey={(i) => i.id}
              columns={[
                { key: 'number', header: 'Número', render: (i) => <span className="font-mono text-xs">{i.number}</span>, primary: true },
                { key: 'client', header: 'Cliente', render: (i) => i.clientName, secondary: true },
                { key: 'issued', header: 'Emisión', render: (i) => formatDateTime(i.issuedAt) },
                { key: 'due', header: 'Vence', render: (i) => i.dueDate ? new Date(i.dueDate).toLocaleDateString('es-AR') : '—' },
                { key: 'total', header: 'Total', render: (i) => `$${i.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, align: 'right' },
                { key: 'paid', header: 'Pagado', render: (i) => `$${i.paidAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`, align: 'right' },
                { key: 'status', header: 'Estado', render: (i) => { const s = statusBadge(i.status); return <StatusBadge status={s.variant}>{s.label}</StatusBadge>; } },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
