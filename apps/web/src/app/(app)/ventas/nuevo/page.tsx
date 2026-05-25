'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { clientsApi, productsApi, salesApi, deliveryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

interface Line {
  productId: string;
  quantity: number;
}

const SELLABLE_CATEGORIES = ['queso', 'subproducto'] as const;

export default function NewSalesOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const clientsQuery = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });

  const [clientId, setClientId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: 1 }]);
  const [notes, setNotes] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);

  const sellableProducts = useMemo(
    () => productsQuery.data?.filter((p) => SELLABLE_CATEGORIES.includes(p.category as typeof SELLABLE_CATEGORIES[number])) ?? [],
    [productsQuery.data],
  );

  const selectedClient = clientsQuery.data?.find((c) => c.id === clientId);

  // Sugerencia automática de fecha de reparto usando el api client centralizado
  useEffect(() => {
    if (!selectedClient?.zoneId) return;
    deliveryApi
      .nextDate(selectedClient.zoneId)
      .then((d) => setDeliveryDate(typeof d === 'string' ? d.replace(/"/g, '') : String(d)))
      .catch(() => toast.error('No se pudo calcular la fecha de reparto para esta zona'));
  }, [selectedClient?.zoneId]);

  // Cálculo de totales en tiempo real
  const lineTotals = useMemo(() => {
    return lines.map((l) => {
      const product = productsQuery.data?.find((p) => p.id === l.productId);
      return { product, quantity: l.quantity };
    });
  }, [lines, productsQuery.data]);

  const validLines = lines.filter((l) => l.productId && l.quantity > 0);
  const canSubmit = !!clientId && validLines.length > 0;

  const create = useMutation({
    mutationFn: () =>
      salesApi.createOrder({
        clientId,
        deliveryDate: deliveryDate || undefined,
        lines: validLines,
        discountPercent: discountPercent || undefined,
        notes: notes || undefined,
      }),
    onSuccess: (o) => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      const fecha = new Date(o.deliveryDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
      toast.success(`Pedido ${o.code} creado — reparto el ${fecha}`);
      router.push('/ventas');
    },
    onError: (e) => {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error('No se pudo crear el pedido. Verificá la conexión e intentá de nuevo.');
    },
  });

  function updateLine(idx: number, field: keyof Line, value: string | number) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pb-32 sm:p-6">
      <PageHeader
        title="Nuevo pedido"
        description="La fecha de reparto se sugiere automáticamente según la zona del cliente."
        breadcrumbs={[
          { href: '/dashboard', label: 'Inicio' },
          { href: '/ventas', label: 'Ventas' },
          { label: 'Nuevo pedido' },
        ]}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/ventas"><ArrowLeft className="h-4 w-4" /> Volver</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader><CardTitle>Cliente y fecha</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="clientId" required>
            <select
              id="clientId"
              className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base"
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setDeliveryDate(''); }}
            >
              <option value="">Elegí un cliente</option>
              {clientsQuery.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.businessName}</option>
              ))}
            </select>
          </Field>

          <Field
            label="Fecha de reparto"
            htmlFor="deliveryDate"
            hint={selectedClient?.zoneId ? 'Fecha sugerida según zona del cliente' : 'Cargá manualmente si el cliente no tiene zona'}
          >
            <Input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </Field>

          {selectedClient && !selectedClient.zoneId && (
            <p className="sm:col-span-2 text-sm text-warning-600 bg-warning-50 rounded-md px-3 py-2">
              Este cliente no tiene zona de reparto asignada. La fecha no se sugiere automáticamente.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Items</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setLines((prev) => [...prev, { productId: '', quantity: 1 }])}
          >
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {lines.length === 0 && (
            <p className="text-sm text-foreground-muted text-center py-4">No hay items. Agregá al menos uno.</p>
          )}
          {lines.map((row, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,120px,auto] items-end">
              <Field label={idx === 0 ? 'Producto' : ''} htmlFor={`product-${idx}`}>
                <select
                  id={`product-${idx}`}
                  className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base"
                  value={row.productId}
                  onChange={(e) => updateLine(idx, 'productId', e.target.value)}
                >
                  <option value="">Elegí un producto</option>
                  {sellableProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={idx === 0 ? 'Cantidad (kg)' : ''} htmlFor={`qty-${idx}`}>
                <Input
                  id={`qty-${idx}`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={0.1}
                  value={row.quantity}
                  onChange={(e) => updateLine(idx, 'quantity', Number(e.target.value))}
                />
              </Field>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                aria-label="Quitar item"
              >
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
          ))}

          {/* Descuento */}
          <div className="border-t border-border-subtle pt-3">
            <Field label="Descuento (%)" htmlFor="discount" hint="Opcional — aplica sobre el total">
              <Input
                id="discount"
                type="number"
                inputMode="decimal"
                step="0.5"
                min={0}
                max={100}
                value={discountPercent || ''}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                className="max-w-32"
              />
            </Field>
          </div>

          {/* Resumen de totales */}
          {validLines.length > 0 && (
            <div className="rounded-md bg-surface-subtle p-4 space-y-1">
              {lineTotals.filter((l) => l.product && l.quantity > 0).map((l, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-foreground-muted">{l.product!.name} × {l.quantity} {l.product!.unit}</span>
                  <span className="font-medium">—</span>
                </div>
              ))}
              {discountPercent > 0 && (
                <div className="flex justify-between text-sm text-warning-600 border-t border-border-subtle pt-1 mt-1">
                  <span>Descuento {discountPercent}%</span>
                  <span>aplicado</span>
                </div>
              )}
              <p className="text-xs text-foreground-muted pt-1">El precio final lo confirma el servidor según la lista de precios vigente.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Notas</CardTitle></CardHeader>
        <CardContent>
          <textarea
            className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base"
            rows={2}
            placeholder="Observaciones para el repartidor, instrucciones especiales..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface-elevated/95 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="text-sm text-foreground-muted hidden sm:block">
            {!clientId && <span className="text-warning-600">Seleccioná un cliente para continuar.</span>}
            {clientId && validLines.length === 0 && <span className="text-warning-600">Agregá al menos un producto.</span>}
            {canSubmit && deliveryDate && <span>Reparto: {new Date(deliveryDate + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button type="button" variant="ghost" size="md" onClick={() => router.back()}>Cancelar</Button>
            <Button
              size="md"
              block
              loading={create.isPending}
              loadingText="Guardando..."
              disabled={!canSubmit}
              onClick={() => create.mutate()}
            >
              Guardar pedido
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
