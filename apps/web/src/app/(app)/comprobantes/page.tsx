'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { invoicesApi } from '@/features/api';
import { formatDateTime } from '@/lib/utils';
import type { Invoice } from '@lasmarias/shared-schemas';

function statusBadge(s: Invoice['status']): { variant: Status; label: string } {
  switch (s) {
    case 'draft': return { variant: 'neutral', label: 'Borrador' };
    case 'issued': return { variant: 'info', label: 'Emitido' };
    case 'paid': return { variant: 'success', label: 'Pagado' };
    case 'cancelled': return { variant: 'danger', label: 'Anulado' };
  }
}

export default function InvoicesPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ['invoices'], queryFn: () => invoicesApi.list() });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Comprobantes"
        description="Facturas y cuenta corriente de clientes."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { label: 'Comprobantes' }]}
      />

      {isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : data.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Todavía no hay comprobantes"
          description="Los comprobantes se emiten desde un pedido en estado preparado, cargado o entregado."
        />
      ) : (
        <DataTable
          data={data}
          getKey={(i) => i.id}
          columns={[
            { key: 'number', header: 'Número', render: (i) => <span className="font-mono text-xs">{i.number}</span>, primary: true },
            { key: 'client', header: 'Cliente', render: (i) => i.clientName, secondary: true },
            { key: 'issued', header: 'Emisión', render: (i) => formatDateTime(i.issuedAt) },
            { key: 'due', header: 'Vence', render: (i) => i.dueDate ? new Date(i.dueDate).toLocaleDateString('es-AR') : '—' },
            { key: 'total', header: 'Total', render: (i) => `$${i.total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`, align: 'right' },
            { key: 'paid', header: 'Pagado', render: (i) => `$${i.paidAmount.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`, align: 'right' },
            { key: 'status', header: 'Estado', render: (i) => { const s = statusBadge(i.status); return <StatusBadge status={s.variant}>{s.label}</StatusBadge>; } },
          ]}
        />
      )}
    </div>
  );
}
