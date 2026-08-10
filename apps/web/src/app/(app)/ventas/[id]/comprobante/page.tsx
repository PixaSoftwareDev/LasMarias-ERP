'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { clientsApi, salesApi, settingsApi } from '@/features/api';
import { formatMoney as money, formatQuantity as qty, formatDate } from '@/lib/utils';
import type { SalesOrder } from '@lasmarias/shared-schemas';

// Qué se muestra en el remito antes de imprimirlo. Son preferencias de impresión:
// no cambian la venta, solo el papel. Se recuerdan en el navegador para no
// reconfigurarlas en cada remito.
type OpcionesRemito = {
  precios: boolean;
  bultos: boolean;
  datosCliente: boolean;
  condicionPago: boolean;
  observaciones: boolean;
  firmas: boolean;
};

const OPCIONES_POR_DEFECTO: OpcionesRemito = {
  precios: true,
  bultos: true,
  datosCliente: true,
  condicionPago: true,
  observaciones: true,
  firmas: true,
};

const STORAGE_KEY = 'remito-opciones';

const ETIQUETAS: { key: keyof OpcionesRemito; label: string }[] = [
  { key: 'precios', label: 'Precios e importes' },
  { key: 'bultos', label: 'Bultos' },
  { key: 'datosCliente', label: 'CUIT y domicilio del cliente' },
  { key: 'condicionPago', label: 'Condición de pago y vencimiento' },
  { key: 'observaciones', label: 'Observaciones' },
  { key: 'firmas', label: 'Espacio para firmas' },
];

// Fecha (Date) → "aaaa-mm-dd" en hora local, para el <input type="date">.
function aInputDate(d: Date) {
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// "aaaa-mm-dd" → Date local (evita el corrimiento de un día que da new Date(str)).
function deInputDate(s: string) {
  const [y = 1970, m = 1, d = 1] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Remito imprimible (CLAUDE.md §4.6). Documento interno A4, NO fiscal. El botón
// "Imprimir" usa window.print(); el chrome de la app se oculta vía CSS de print.
export default function ComprobantePage() {
  const params = useParams<{ id: string }>();
  const [opciones, setOpciones] = useState<OpcionesRemito>(OPCIONES_POR_DEFECTO);
  const [fecha, setFecha] = useState<string>('');

  // Preferencias guardadas del navegador (si están rotas, seguimos con las por defecto).
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(STORAGE_KEY);
      if (guardado) setOpciones({ ...OPCIONES_POR_DEFECTO, ...JSON.parse(guardado) });
    } catch {
      /* preferencias ilegibles: usamos las por defecto */
    }
  }, []);

  const cambiarOpcion = (key: keyof OpcionesRemito, valor: boolean) => {
    setOpciones((prev) => {
      const siguiente = { ...prev, [key]: valor };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(siguiente));
      } catch {
        /* sin localStorage: la preferencia vale solo para esta pantalla */
      }
      return siguiente;
    });
  };

  const orderQuery = useQuery({
    queryKey: ['sales-order', params.id],
    queryFn: () => salesApi.getOrder(params.id),
    enabled: !!params.id,
  });
  const clientsQuery = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => settingsApi.get() });

  // Fecha que se imprime: arranca con la del despacho y el usuario puede corregirla.
  const dispatchedAt = orderQuery.data?.dispatchedAt;
  useEffect(() => {
    if (dispatchedAt) setFecha(aInputDate(new Date(dispatchedAt)));
  }, [dispatchedAt]);

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
  // Preferimos la forma de pago guardada en la venta; si no está (ventas viejas), la derivamos del cliente.
  const isContado = order.paymentMode ? order.paymentMode === 'contado' : termDays == null;
  // Solo mostramos vencimiento si es cuenta corriente Y el cliente tiene plazo definido.
  // El vencimiento se cuenta desde la fecha que sale impresa (si el usuario la corrigió, acompaña).
  const fechaRemito = fecha ? deInputDate(fecha) : new Date(order.dispatchedAt);
  const dueDate =
    isContado || termDays == null
      ? null
      : new Date(fechaRemito.getTime() + termDays * 24 * 60 * 60 * 1000);
  const fmtDate = (d: Date) => formatDate(d);
  // La columna de bultos aparece solo si el despacho los tiene (remitos viejos: no)
  // y si el usuario no la ocultó.
  const hayBultos = opciones.bultos && order.lines.some((l) => l.bultos != null);
  const verPrecios = opciones.precios;
  const columnasAntesDelTotal = 1 + (hayBultos ? 1 : 0) + 1; // producto + bultos? + cantidad

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

      {/* Qué se imprime — no sale en el papel. Solo cambia el remito, no la venta. */}
      <Card className="no-print mb-4 p-4">
        <p className="text-sm font-medium">Antes de imprimir</p>
        <p className="mt-1 text-xs text-foreground-muted">
          Elegí qué datos aparecen en el papel. No cambia la venta ni el stock.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ETIQUETAS.map(({ key, label }) => (
            <label key={key} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-border-subtle px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#059669]"
                checked={opciones[key]}
                onChange={(e) => cambiarOpcion(key, e.target.checked)}
              />
              <span>Mostrar {label.toLowerCase()}</span>
            </label>
          ))}
        </div>

        <div className="mt-4">
          <label htmlFor="fecha-remito" className="text-sm font-medium">
            Fecha del remito
          </label>
          <input
            id="fecha-remito"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 block h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm sm:w-56"
          />
          <p className="mt-1 text-xs text-foreground-muted">
            Se usa solo para este papel. La venta sigue registrada el{' '}
            {fmtDate(new Date(order.dispatchedAt))}.
          </p>
        </div>
      </Card>

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
            {opciones.datosCliente && (
              <>
                {client?.taxId && <p className="text-sm text-foreground-muted">CUIT: {client.taxId}</p>}
                {client?.address && <p className="text-sm text-foreground-muted">{client.address}</p>}
                {client?.city && <p className="text-sm text-foreground-muted">{client.city}</p>}
              </>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs uppercase tracking-wide text-foreground-muted">Fecha</p>
            <p className="font-medium">{fmtDate(fechaRemito)}</p>
            {opciones.condicionPago && (
              <>
                <p className="mt-3 text-xs uppercase tracking-wide text-foreground-muted">Condición de pago</p>
                <p className="font-medium">
                  {isContado ? 'Contado' : `Cuenta corriente${termDays ? ` (a ${termDays} días)` : ''}`}
                </p>
              </>
            )}
            {opciones.condicionPago && dueDate && (
              <>
                <p className="mt-3 text-xs uppercase tracking-wide text-foreground-muted">Vence</p>
                <p className="font-medium">{fmtDate(dueDate)}</p>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-foreground-muted">
              <th className="py-2 font-medium">Producto</th>
              <th className="py-2 text-right font-medium">Cantidad</th>
              {hayBultos && <th className="py-2 text-right font-medium">Bultos</th>}
              {verPrecios && <th className="py-2 text-right font-medium">Precio unit.</th>}
              {verPrecios && <th className="py-2 text-right font-medium">Subtotal</th>}
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
                {hayBultos && <td className="py-2.5 text-right">{l.bultos != null ? l.bultos : '—'}</td>}
                {verPrecios && (
                  <td className="py-2.5 text-right">
                    {money(l.unitPrice)}
                    <span className="block text-xs text-foreground-muted">
                      por {l.priceBasis === 'bulto' ? 'bulto' : l.unit}
                    </span>
                  </td>
                )}
                {verPrecios && <td className="py-2.5 text-right font-medium">{money(l.subtotal)}</td>}
              </tr>
            ))}
          </tbody>
          {verPrecios && (
            <tfoot>
              <tr>
                <td colSpan={columnasAntesDelTotal + 1} className="pt-4 text-right text-sm font-medium text-foreground-muted">Total</td>
                <td className="pt-4 text-right font-display text-xl font-bold">{money(order.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>

        {verPrecios && order.currency && order.currency !== 'ARS' && (
          <p className="mt-2 text-right text-xs text-foreground-muted">
            Precios cotizados en {order.currency} · cotización usada {money(order.exchangeRate ?? 0)} por {order.currency}.
          </p>
        )}

        {opciones.observaciones && order.notes && (
          <div className="mt-6 border-t border-border-subtle pt-4">
            <p className="text-xs uppercase tracking-wide text-foreground-muted">Observaciones</p>
            <p className="mt-1 text-sm">{order.notes}</p>
          </div>
        )}

        {opciones.firmas && (
          <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs text-foreground-muted">
            <div className="border-t border-border pt-2">Firma y aclaración (entrega)</div>
            <div className="border-t border-border pt-2">Firma y aclaración (recibe)</div>
          </div>
        )}
      </Card>
    </div>
  );
}
