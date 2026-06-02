'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { clientsApi, salesApi, settingsApi } from '@/features/api';
import { formatMoney as money, formatQuantity as qty, formatDate } from '@/lib/utils';
import type { SalesOrder } from '@lasmarias/shared-schemas';

// Remito imprimible (CLAUDE.md §4.6). Documento interno A4, NO fiscal. El botón
// "Imprimir" usa window.print(); el chrome de la app se oculta vía CSS de print.
export default function ComprobantePage() {
  const params = useParams<{ id: string }>();
  const orderQuery = useQuery({
    queryKey: ['sales-order', params.id],
    queryFn: () => salesApi.getOrder(params.id),
    enabled: !!params.id,
  });
  const clientsQuery = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => settingsApi.get() });

  if (orderQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <Card className="h-96 animate-pulse bg-surface-subtle" />
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <p className="text-sm text-danger">No se encontró la venta.</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href="/ventas"><ArrowLeft className="h-4 w-4" /> Volver a ventas</Link>
        </Button>
      </div>
    );
  }

  const order: SalesOrder = orderQuery.data;
  const client = clientsQuery.data?.find((c) => c.id === order.clientId);
  const company = settingsQuery.data?.company;

  // Condición de pago del remito. Igual criterio que usa el backend al despachar:
  // si el cliente no tiene plazo (paymentTermDays null) es contado; si tiene plazo,
  // es cuenta corriente y el vencimiento = fecha de despacho + plazo en días.
  const termDays = client?.paymentTermDays ?? null;
  const isContado = termDays == null;
  const dueDate = isContado
    ? null
    : new Date(new Date(order.dispatchedAt).getTime() + termDays * 24 * 60 * 60 * 1000);
  const fmtDate = (d: Date) => formatDate(d);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      {/* Acciones — no se imprimen */}
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/ventas"><ArrowLeft className="h-4 w-4" /> Volver</Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      {/* Documento A4 */}
      <Card className="print-document p-8 text-foreground">
        <div className="flex items-start justify-between border-b border-border-subtle pb-6">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight">{company?.name ?? 'Las Marías'}</p>
            {company?.address && <p className="mt-1 text-xs text-foreground-muted">{company.address}</p>}
            {company?.city && <p className="text-xs text-foreground-muted">{company.city}</p>}
            {company?.taxId && <p className="text-xs text-foreground-muted">CUIT: {company.taxId}</p>}
            {company?.phone && <p className="text-xs text-foreground-muted">Tel: {company.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">Remito</p>
            <p className="font-mono text-sm">{order.code}</p>
            <p className="mt-1 text-xs text-foreground-muted">Documento interno — no válido como factura</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-foreground-muted">Cliente</p>
            <p className="font-medium">{order.clientName}</p>
            {client?.taxId && <p className="text-sm text-foreground-muted">CUIT: {client.taxId}</p>}
            {client?.address && <p className="text-sm text-foreground-muted">{client.address}</p>}
            {client?.city && <p className="text-sm text-foreground-muted">{client.city}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-xs uppercase tracking-wide text-foreground-muted">Fecha</p>
            <p className="font-medium">{fmtDate(new Date(order.dispatchedAt))}</p>
            <p className="mt-3 text-xs uppercase tracking-wide text-foreground-muted">Condición de pago</p>
            <p className="font-medium">
              {isContado ? 'Contado' : `Cuenta corriente${termDays ? ` (a ${termDays} días)` : ''}`}
            </p>
            {dueDate && (
              <>
                <p className="mt-3 text-xs uppercase tracking-wide text-foreground-muted">Vence</p>
                <p className="font-medium">{fmtDate(dueDate)}</p>
              </>
            )}
          </div>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-foreground-muted">
              <th className="py-2 font-medium">Producto</th>
              <th className="py-2 text-right font-medium">Cantidad</th>
              <th className="py-2 text-right font-medium">Precio unit.</th>
              <th className="py-2 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.productId} className="border-b border-border-subtle">
                <td className="py-2.5">
                  <span className="font-medium">{l.productName}</span>
                  <span className="ml-2 font-mono text-xs text-foreground-muted">{l.sku}</span>
                </td>
                <td className="py-2.5 text-right">{qty(l.quantity)} {l.unit}</td>
                <td className="py-2.5 text-right">{money(l.unitPrice)}</td>
                <td className="py-2.5 text-right font-medium">{money(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-4 text-right text-sm font-medium text-foreground-muted">Total</td>
              <td className="pt-4 text-right font-display text-xl font-bold">{money(order.total)}</td>
            </tr>
          </tfoot>
        </table>

        {order.notes && (
          <div className="mt-6 border-t border-border-subtle pt-4">
            <p className="text-xs uppercase tracking-wide text-foreground-muted">Observaciones</p>
            <p className="mt-1 text-sm">{order.notes}</p>
          </div>
        )}

        <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs text-foreground-muted">
          <div className="border-t border-border pt-2">Firma y aclaración (entrega)</div>
          <div className="border-t border-border pt-2">Firma y aclaración (recibe)</div>
        </div>
      </Card>
    </div>
  );
}
