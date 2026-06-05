'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShoppingCart, Plus, Trash2, Truck, FileText, Undo2, TriangleAlert, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { ReturnDialog } from '@/components/sales/return-dialog';
import { clientsApi, inventoryApi, productsApi, salesApi, exchangeRatesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/hooks/use-confirm';
import { formatMoney as money, formatDate } from '@/lib/utils';
import { rateForCurrency } from '@/features/currency';
import { DateRangeFilter } from '@/components/ui/date-range';
import { TableSkeleton } from '@/components/ui/skeleton';
import type { SalesOrder, Currency } from '@lasmarias/shared-schemas';

// Condición de pago del despacho. El tipo vive en el schema como enum inline de
// createSalesOrderInput; lo reflejamos acá para el selector.
type PaymentMode = 'contado' | 'cuenta_corriente';

interface Line {
  productId: string;
  quantity: number;
  unitPrice: number;
}

const EMPTY_LINE: Line = { productId: '', quantity: 1, unitPrice: 0 };

const fefoDate = (iso?: string) => (iso ? formatDate(iso) : null);

// Preview FEFO por línea (CLAUDE.md §4.4). Solo informativo: muestra de qué lote/s
// saldrá la mercadería; el descuento real lo hace el backend al despachar.
// Debounce sobre producto+cantidad para no spamear la API.
function FefoPreview({ productId, quantity }: { productId: string; quantity: number }) {
  const [debounced, setDebounced] = useState<{ productId: string; quantity: number } | null>(null);

  useEffect(() => {
    if (!productId || !(quantity > 0)) {
      setDebounced(null);
      return;
    }
    const t = setTimeout(() => setDebounced({ productId, quantity }), 350);
    return () => clearTimeout(t);
  }, [productId, quantity]);

  const query = useQuery({
    queryKey: ['fefo', debounced?.productId, debounced?.quantity],
    queryFn: () => inventoryApi.fefoSuggestion(debounced!.productId, debounced!.quantity),
    enabled: !!debounced,
  });

  if (!debounced) return null;
  if (query.isLoading) {
    return <p className="mt-2 text-xs text-foreground-subtle">Calculando de qué lote sale…</p>;
  }
  if (query.isError || !query.data) return null;

  const { allocations, shortage } = query.data;

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-border-subtle bg-surface-subtle/60 px-3 py-2.5 text-xs">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
        <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" /> De qué lote sale
      </p>
      {allocations.length === 0 ? (
        <p className="flex items-center gap-1.5 text-amber-700">
          <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          No hay lotes disponibles para este producto.
        </p>
      ) : (
        allocations.map((a) => (
          <p key={a.batchId} className="text-foreground-muted">
            Se tomará <span className="font-medium text-foreground">{a.take.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
            {' del lote '}
            <span className="font-mono text-foreground">{a.batchCode}</span>
            {fefoDate(a.expirationDate) ? <span> (vence {fefoDate(a.expirationDate)})</span> : null}
          </p>
        ))
      )}
      {shortage > 0 && (
        <p className="flex items-center gap-1.5 font-medium text-amber-700">
          <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          Faltan {shortage.toLocaleString('es-AR', { maximumFractionDigits: 2 })} sin stock disponible.
        </p>
      )}
    </div>
  );
}

export default function SalesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const ordersQuery = useQuery({ queryKey: ['sales-orders'], queryFn: () => salesApi.listOrders() });
  const clientsQuery = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const stockQuery = useQuery({ queryKey: ['stock'], queryFn: () => inventoryApi.stock() });

  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [notes, setNotes] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('contado');
  const [returnOrder, setReturnOrder] = useState<SalesOrder | null>(null);
  // Filtro de fechas de la lista de despachos.
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const sellableProducts = useMemo(
    () => productsQuery.data?.filter((p) => p.category === 'queso' || p.category === 'subproducto') ?? [],
    [productsQuery.data],
  );

  const selectedClient = useMemo(
    () => clientsQuery.data?.find((c) => c.id === clientId) ?? null,
    [clientsQuery.data, clientId],
  );

  // Lista de precios del tipo del cliente elegido → para prellenar los precios.
  const priceListQuery = useQuery({
    queryKey: ['price-list', selectedClient?.type],
    queryFn: () => salesApi.priceList(selectedClient!.type),
    enabled: !!selectedClient,
  });
  const latestRate = useQuery({ queryKey: ['exchange-rate-latest'], queryFn: () => exchangeRatesApi.latest() });

  // Moneda en que está cargada la lista de precios del cliente (toda la lista comparte moneda).
  const listCurrency: Currency = priceListQuery.data?.[0]?.currency ?? 'ARS';
  // Cotización (pesos por unidad) para esa moneda. null si falta cargar la del día.
  const listRate = rateForCurrency(latestRate.data ?? undefined, listCurrency);
  const needsRate = listCurrency !== 'ARS' && listRate == null;

  // Precio de lista por producto YA convertido a pesos (la venta trabaja en $). Si la
  // lista está en moneda extranjera y falta la cotización, no prellenamos (queda null).
  const priceByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of priceListQuery.data ?? []) {
      const ars = listCurrency === 'ARS' ? p.unitPrice : listRate != null ? Math.round(p.unitPrice * listRate * 100) / 100 : null;
      if (ars != null) m.set(p.productId, ars);
    }
    return m;
  }, [priceListQuery.data, listCurrency, listRate]);

  // Al elegir cliente: condición de pago default (sin plazo = contado) y prellenado
  // de precios cuando llega la lista. El precio sigue editable a mano (CLAUDE.md §4.6).
  useEffect(() => {
    if (!selectedClient) return;
    setPaymentMode(selectedClient.paymentTermDays == null ? 'contado' : 'cuenta_corriente');
  }, [selectedClient]);

  useEffect(() => {
    if (!priceListQuery.data) return;
    setLines((cur) =>
      cur.map((l) => (l.productId && priceByProduct.has(l.productId) ? { ...l, unitPrice: priceByProduct.get(l.productId)! } : l)),
    );
  }, [priceListQuery.data, priceByProduct]);

  const stockByProduct = useMemo(
    () => new Map((stockQuery.data ?? []).map((s) => [s.productId, s])),
    [stockQuery.data],
  );

  const validLines = useMemo(
    () => lines.filter((l) => l.productId && l.quantity > 0),
    [lines],
  );

  const total = useMemo(
    () => validLines.reduce((acc, l) => acc + l.quantity * l.unitPrice, 0),
    [validLines],
  );

  function resetForm() {
    setShowForm(false);
    setClientId('');
    setLines([{ ...EMPTY_LINE }]);
    setNotes('');
    setPaymentMode('contado');
  }

  const create = useMutation({
    mutationFn: () =>
      salesApi.createOrder({
        clientId,
        lines: validLines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
        notes: notes || undefined,
        paymentMode,
        currency: listCurrency,
      }),
    onSuccess: (o) => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      const cobro = paymentMode === 'contado' ? 'Cobrado al contado.' : 'Quedó en cuenta corriente.';
      // Si quedó en cuenta corriente, ofrecemos saltar a la cuenta del cliente (siguiente paso).
      toast.success(`Venta ${o.code} registrada · ${money(o.total)}. Se descontó el stock. ${cobro}`,
        paymentMode === 'cuenta_corriente'
          ? { action: { label: 'Ver cuenta', onClick: () => router.push('/cuentas') } }
          : undefined,
      );
      resetForm();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo registrar la venta. Probá de nuevo.'),
  });

  // Cuando se elige un producto, traemos su precio de lista (si existe).
  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((cur) =>
      cur.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        if (patch.productId && priceByProduct.has(patch.productId)) {
          next.unitPrice = priceByProduct.get(patch.productId)!;
        }
        return next;
      }),
    );
  }

  function removeLine(idx: number) {
    const prev = lines;
    const removed = lines[idx];
    const next = lines.filter((_, i) => i !== idx);
    setLines(next.length ? next : [{ ...EMPTY_LINE }]);
    if (removed?.productId) {
      toast('Producto quitado de la venta', {
        action: { label: 'Deshacer', onClick: () => setLines(prev) },
      });
    }
  }

  const canSave = !!clientId && validLines.length > 0 && !create.isPending && !needsRate;

  // ¿Alguna línea pide más de lo que hay en stock? (venta quedaría con stock negativo)
  const hasOverStock = useMemo(
    () =>
      validLines.some((l) => {
        const st = stockByProduct.get(l.productId);
        return st != null && l.quantity > st.totalQuantity;
      }),
    [validLines, stockByProduct],
  );

  async function handleRegister() {
    if (hasOverStock) {
      const ok = await confirm({
        title: 'Stock insuficiente',
        message: 'Algún producto supera el stock disponible; el stock puede quedar en negativo. ¿Registrás la venta igual?',
        confirmLabel: 'Registrar igual',
        destructive: true,
      });
      if (!ok) return;
    }
    create.mutate();
  }

  const orders = ordersQuery.data ?? [];
  const filteredOrders = useMemo(
    () =>
      orders.filter((o) => {
        const day = o.dispatchedAt.slice(0, 10);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
        return true;
      }),
    [orders, fromDate, toDate],
  );

  // Total del período mostrado (suma de las ventas que quedan tras el filtro de fechas).
  const periodTotal = useMemo(
    () => filteredOrders.reduce((acc, o) => acc + Number(o.total), 0),
    [filteredOrders],
  );

  return (
    <div className="flex flex-col gap-6 pb-32">
      <PageHeader
        title="Ventas"
        description="Vender mercadería a un cliente. Al confirmar se descuenta el stock."        action={
          <Button onClick={() => (showForm ? resetForm() : setShowForm(true))}>
            <Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nueva venta'}
          </Button>
        }
      />

      {showForm && (
        <>
          {/* Avisos con link cuando falta un dato base (no dejamos al usuario varado). */}
          {!clientsQuery.isLoading && (clientsQuery.data?.filter((c) => c.isActive).length ?? 0) === 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
              No tenés clientes cargados.{' '}
              <Link href="/clientes" className="font-medium underline">Cargá un cliente</Link> para poder vender.
            </div>
          )}
          {!productsQuery.isLoading && sellableProducts.length === 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
              No hay productos para vender (quesos o subproductos).{' '}
              <Link href="/productos" className="font-medium underline">Cargá un producto</Link> primero.
            </div>
          )}
          <Card>
            <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Cliente" htmlFor="clientId" required>
                <select
                  id="clientId"
                  className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">Elegí un cliente</option>
                  {clientsQuery.data?.filter((c) => c.isActive).map((c) => (
                    <option key={c.id} value={c.id}>{c.businessName}</option>
                  ))}
                </select>
              </Field>

              <Field
                label="Condición de pago"
                htmlFor="paymentMode"
                hint={
                  selectedClient
                    ? selectedClient.paymentTermDays == null
                      ? 'Este cliente trabaja al contado.'
                      : `Este cliente trabaja en cuenta corriente (a ${selectedClient.paymentTermDays} días).`
                    : undefined
                }
              >
                <select
                  id="paymentMode"
                  className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  disabled={!selectedClient}
                >
                  <option value="contado">Contado (se cobra ahora)</option>
                  <option value="cuenta_corriente">Cuenta corriente (queda a deber)</option>
                </select>
              </Field>
            </CardContent>
          </Card>

          {selectedClient && listCurrency !== 'ARS' && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${needsRate ? 'border-warning/40 bg-warning/10 text-foreground' : 'border-border-subtle bg-surface-subtle/60 text-foreground-muted'}`}>
              {needsRate ? (
                <>La lista de este cliente está en {listCurrency}, pero todavía no cargaste la cotización del día.{' '}
                <Link href="/admin/cotizacion" className="font-medium underline">Cargá el dólar/euro</Link> para poder vender.</>
              ) : (
                <>Lista en <span className="font-medium text-foreground">{listCurrency}</span> · cotización del día <span className="font-medium text-foreground">{money(listRate!)}</span>. Los precios se muestran ya convertidos a pesos.</>
              )}
            </div>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Productos</CardTitle>
              <Button type="button" size="sm" variant="secondary" onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>
                <Plus className="h-4 w-4" /> Agregar producto
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {lines.map((row, idx) => {
                const stock = row.productId ? stockByProduct.get(row.productId) : undefined;
                const overStock = stock != null && row.quantity > stock.totalQuantity;
                const lineTotal = row.quantity * row.unitPrice;
                const lineUnit = stock?.unit ?? '';
                return (
                  <div key={idx} className="rounded-lg border border-border-subtle p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,90px,110px,auto]">
                      <select
                        aria-label="Producto"
                        className="min-h-touch rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                        value={row.productId}
                        onChange={(e) => updateLine(idx, { productId: e.target.value })}
                      >
                        <option value="">Elegí un producto</option>
                        {sellableProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min={0.1}
                        aria-label="Cantidad"
                        suffix={lineUnit || undefined}
                        value={row.quantity}
                        onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        aria-label="Precio por unidad"
                        prefix="$"
                        placeholder="Precio"
                        value={row.unitPrice}
                        onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) })}
                      />
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        aria-label="Quitar producto"
                        className="flex min-h-touch min-w-touch items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    {row.productId && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                        <span className={`flex items-center gap-1.5 ${overStock ? 'font-medium text-amber-600' : 'text-foreground-muted'}`}>
                          {overStock && <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />}
                          {stock
                            ? overStock
                              ? `Supera el stock — hay ${stock.totalQuantity.toLocaleString('es-AR')} ${stock.unit}`
                              : `Stock disponible: ${stock.totalQuantity.toLocaleString('es-AR')} ${stock.unit}`
                            : 'Sin stock cargado'}
                        </span>
                        <span className="font-display font-bold text-foreground">{money(lineTotal)}</span>
                      </div>
                    )}
                    {row.productId && row.quantity > 0 && (
                      <FefoPreview productId={row.productId} quantity={row.quantity} />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notas</CardTitle></CardHeader>
            <CardContent>
              <textarea
                aria-label="Notas"
                className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                rows={2}
                placeholder="Observaciones de la venta (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Barra de total sticky — siempre visible cuánto suma el despacho. CLAUDE.md §5.4 */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface-elevated/95 backdrop-blur md:left-64">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">Total de la venta</span>
                  <span className="block font-display text-2xl font-bold tracking-tight text-foreground">{money(total)}</span>
                </span>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button variant="ghost" onClick={resetForm}>Cancelar</Button>
                <Button onClick={handleRegister} loading={create.isPending} loadingText="Registrando..." disabled={!canSave}>
                  <Truck className="h-4 w-4" /> Registrar venta
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {!showForm && (
        ordersQuery.isLoading ? (
          <TableSkeleton />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Todavía no hay ventas"
            action={<Button onClick={() => setShowForm(true)}>Hacer la primera venta</Button>}
          />
        ) : (
          <>
          {/* Resumen del período: cuántas ventas suman y cuánto, antes de la tabla. */}
          <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-subtle/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-foreground-muted">
              {filteredOrders.length} {filteredOrders.length === 1 ? 'venta' : 'ventas'}
              {fromDate || toDate ? ' en el período elegido' : ''}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-[11px] uppercase tracking-wide text-foreground-muted">Total facturado</span>
              <span className="font-display text-xl font-bold tracking-tight text-foreground">{money(periodTotal)}</span>
            </span>
          </div>
          <DataTable
            data={filteredOrders}
            getKey={(o) => o.id}
            emptyText="No hay ventas en el período elegido."
            getSearchText={(o: SalesOrder) => `${o.code} ${o.clientName}`}
            searchPlaceholder="Buscar por código o cliente…"
            filters={
              <DateRangeFilter
                from={fromDate}
                to={toDate}
                onFromChange={setFromDate}
                onToChange={setToDate}
                onClear={() => { setFromDate(''); setToDate(''); }}
              />
            }
            columns={[
              { key: 'code', header: 'Código', render: (o: SalesOrder) => <span className="font-mono text-xs">{o.code}</span>, secondary: true, sortValue: (o: SalesOrder) => o.code },
              { key: 'client', header: 'Cliente', render: (o: SalesOrder) => o.clientName, primary: true, sortValue: (o: SalesOrder) => o.clientName },
              { key: 'date', header: 'Fecha', render: (o: SalesOrder) => formatDate(o.dispatchedAt), sortValue: (o: SalesOrder) => new Date(o.dispatchedAt).getTime() },
              { key: 'items', header: 'Items', render: (o: SalesOrder) => o.lines.length, align: 'right', sortValue: (o: SalesOrder) => o.lines.length },
              { key: 'total', header: 'Total', render: (o: SalesOrder) => money(o.total), align: 'right', sortValue: (o: SalesOrder) => Number(o.total) },
              { key: 'pago', header: 'Pago', render: (o: SalesOrder) => o.paymentMode === 'contado' ? 'Contado' : o.paymentMode === 'cuenta_corriente' ? 'Cuenta corriente' : '—', sortValue: (o: SalesOrder) => o.paymentMode ?? '' },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (o: SalesOrder) => (
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/ventas/${o.id}/comprobante`} onClick={(e) => e.stopPropagation()}>
                        <FileText className="h-4 w-4" /> Ver remito
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReturnOrder(o);
                      }}
                    >
                      <Undo2 className="h-4 w-4" /> Devolver
                    </Button>
                  </div>
                ),
              },
            ]}
          />
          </>
        )
      )}

      {returnOrder && (
        <ReturnDialog
          order={returnOrder}
          onClose={() => setReturnOrder(null)}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
            queryClient.invalidateQueries({ queryKey: ['stock'] });
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setReturnOrder(null);
          }}
        />
      )}
    </div>
  );
}
