'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { clientsApi, inventoryApi, productsApi, salesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

interface Line {
  productId: string;
  quantity: number;
}

const money = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function NewSalesOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const clientsQuery = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const stockQuery = useQuery({ queryKey: ['stock'], queryFn: () => inventoryApi.stock() });

  const [clientId, setClientId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: 1 }]);
  const [notes, setNotes] = useState('');

  const sellableProducts = useMemo(
    () => productsQuery.data?.filter((p) => p.category === 'queso' || p.category === 'subproducto') ?? [],
    [productsQuery.data],
  );

  const stockByProduct = useMemo(
    () => new Map((stockQuery.data ?? []).map((s) => [s.productId, s])),
    [stockQuery.data],
  );

  // Sugerencia automática de fecha de reparto a partir de la zona del cliente.
  useEffect(() => {
    if (!clientId) return;
    const c = clientsQuery.data?.find((x) => x.id === clientId);
    if (c?.zoneId) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/delivery/next-date?zoneId=${c.zoneId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('lm.accessToken')}` },
      })
        .then((r) => r.text())
        .then((d) => setDeliveryDate(d.replace(/"/g, '')))
        .catch(() => undefined);
    }
  }, [clientId, clientsQuery.data]);

  // Cotización en vivo: precios + total mientras se arma el pedido.
  const validLines = useMemo(() => lines.filter((l) => l.productId && l.quantity > 0), [lines]);
  const quoteQuery = useQuery({
    queryKey: ['sales-quote', clientId, JSON.stringify(validLines)],
    queryFn: () => salesApi.quote({ clientId, lines: validLines }),
    enabled: !!clientId && validLines.length > 0,
    placeholderData: (prev) => prev,
  });
  const quote = quoteQuery.data;
  const priceFor = (productId: string) => quote?.lines.find((ql) => ql.productId === productId);

  const create = useMutation({
    mutationFn: () =>
      salesApi.createOrder({
        clientId,
        deliveryDate: deliveryDate || undefined,
        lines: validLines,
        notes: notes || undefined,
      }),
    onSuccess: (o) => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success(`Pedido ${o.code} creado · ${money(o.total)} · reparto ${new Date(o.deliveryDate).toLocaleDateString('es-AR')}`);
      router.push('/ventas');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo crear el pedido. Probá de nuevo.'),
  });

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((cur) => cur.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx: number) {
    const prev = lines;
    const removed = lines[idx];
    const next = lines.filter((_, i) => i !== idx);
    setLines(next.length ? next : [{ productId: '', quantity: 1 }]);
    if (removed?.productId) {
      toast('Producto quitado del pedido', {
        action: { label: 'Deshacer', onClick: () => setLines(prev) },
      });
    }
  }

  const canSave = !!clientId && validLines.length > 0 && !create.isPending;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pb-32 sm:p-6">
      <PageHeader
        title="Nuevo pedido"
        description="Elegí el cliente y los productos. La fecha de reparto se sugiere según la zona."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { href: '/ventas', label: 'Ventas' }, { label: 'Nuevo' }]}
        action={<Button asChild variant="ghost"><Link href="/ventas"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>}
      />

      <Card>
        <CardHeader><CardTitle>Datos del pedido</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="clientId" required>
            <select
              id="clientId"
              className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Elegí un cliente</option>
              {clientsQuery.data?.map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
            </select>
          </Field>
          <Field label="Fecha de reparto" htmlFor="deliveryDate" hint="Si el cliente tiene zona, se sugiere automáticamente">
            <Input id="deliveryDate" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Productos</CardTitle>
          <Button type="button" size="sm" variant="secondary" onClick={() => setLines([...lines, { productId: '', quantity: 1 }])}>
            <Plus className="h-4 w-4" /> Agregar producto
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((row, idx) => {
            const stock = row.productId ? stockByProduct.get(row.productId) : undefined;
            const ql = priceFor(row.productId);
            const overStock = stock != null && row.quantity > stock.totalQuantity;
            return (
              <div key={idx} className="rounded-lg border border-border-subtle p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,110px,auto]">
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
                    value={row.quantity}
                    onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
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
                    <span className={overStock ? 'font-medium text-amber-600' : 'text-foreground-muted'}>
                      {stock
                        ? overStock
                          ? `⚠ Supera el stock — hay ${stock.totalQuantity.toLocaleString('es-AR')} ${stock.unit}`
                          : `Stock disponible: ${stock.totalQuantity.toLocaleString('es-AR')} ${stock.unit}`
                        : 'Sin stock cargado'}
                    </span>
                    <span className="text-foreground-muted">
                      {ql?.unitPrice != null
                        ? <>{money(ql.unitPrice)} c/u · <span className="font-semibold text-foreground">{money(ql.subtotal ?? 0)}</span></>
                        : 'Sin precio en la lista'}
                    </span>
                  </div>
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
            placeholder="Observaciones del pedido (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </CardContent>
      </Card>

      {quote && quote.missingPrices.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>Faltan precios para: <strong>{quote.missingPrices.join(', ')}</strong>. El total puede estar incompleto — cargá la lista de precios en Administración.</span>
        </div>
      )}

      {/* Barra de total sticky — el vendedor siempre ve cuánto suma el pedido. CLAUDE.md §5.4 */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface-elevated/95 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-foreground-muted">Total del pedido</p>
            <p className="font-display text-2xl font-bold tracking-tight text-foreground">
              {quote ? money(quote.total) : '—'}
              {quoteQuery.isFetching && <span className="ml-2 align-middle text-xs font-normal text-foreground-subtle">actualizando…</span>}
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="ghost" onClick={() => router.back()}>Cancelar</Button>
            <Button block onClick={() => create.mutate()} loading={create.isPending} loadingText="Guardando..." disabled={!canSave}>
              Guardar pedido
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
