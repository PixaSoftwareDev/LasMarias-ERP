'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, GitBranch, Lock, Package, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { ProductionCostPanel } from '@/components/production-cost-panel';
import { productionApi, inventoryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import type { ProductionOrder } from '@lasmarias/shared-schemas';

// Pantalla de cierre de orden (CLAUDE.md §4.3): se cargan las salidas reales por producto
// y al cerrar se muestra el panel de costo. El cierre es definitivo.

export default function CloseProductionPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const queryClient = useQueryClient();

  const orderQuery = useQuery({
    queryKey: ['production-order', id],
    queryFn: () => productionApi.get(id),
  });
  const order = orderQuery.data;

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => inventoryApi.listWarehouses(),
  });

  // Cantidad real por producto (kg). La indexamos por productId.
  const [quantities, setQuantities] = useState<Record<string, number | undefined>>({});
  // Cámara/sector destino de los lotes de producto generados al cerrar (opcional).
  const [warehouseId, setWarehouseId] = useState<string>('');
  // La orden cerrada (con costBreakdown) tras un cierre exitoso.
  const [closedOrder, setClosedOrder] = useState<ProductionOrder | null>(null);

  // Si la orden ya está cerrada, mostramos directo su panel de costo.
  useEffect(() => {
    if (order && order.status === 'closed' && !closedOrder) {
      setClosedOrder(order);
    }
  }, [order, closedOrder]);

  const close = useMutation({
    mutationFn: () =>
      productionApi.close(id, {
        actualOutputs: (order?.expectedOutputs ?? []).map((o) => ({
          productId: o.productId,
          quantity: Number(quantities[o.productId] ?? 0),
          isPrincipal: o.isPrincipal,
        })),
        warehouseId: warehouseId || undefined,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      queryClient.invalidateQueries({ queryKey: ['production-order', id] });
      setClosedOrder(r);
      toast.success(`Orden ${r.code} cerrada`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cerrar la orden'),
  });

  const principal = useMemo(
    () => (order?.expectedOutputs ?? []).filter((o) => o.isPrincipal),
    [order],
  );
  const byproducts = useMemo(
    () => (order?.expectedOutputs ?? []).filter((o) => !o.isPrincipal),
    [order],
  );

  const canClose = principal.some((o) => Number(quantities[o.productId] ?? 0) > 0);

  if (orderQuery.isLoading) {
    return <Card className="h-64 animate-pulse bg-surface-subtle" />;
  }

  if (!order) {
    return <Card className="p-8 text-center text-sm text-foreground-muted">No se encontró la orden.</Card>;
  }

  // Vista de orden ya cerrada: panel de costo + confirmación.
  if (closedOrder) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={`Orden ${closedOrder.code}`}
          description="Orden cerrada. El detalle de costo es definitivo."          action={
            <Button asChild variant="ghost">
              <Link href="/produccion">
                <ArrowLeft className="h-4 w-4" /> Volver
              </Link>
            </Button>
          }
        />

        {close.isSuccess && (
          <div className="flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50 p-3 text-sm text-primary-700">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>Producción cargada y orden cerrada. Se generaron los lotes de cada producto.</span>
          </div>
        )}

        {closedOrder.costBreakdown ? (
          <ProductionCostPanel breakdown={closedOrder.costBreakdown} />
        ) : (
          <Card className="p-6 text-center text-sm text-foreground-muted">
            Esta orden no tiene desglose de costo disponible.
          </Card>
        )}

        {/* Entrada natural a la trazabilidad: seguir cada lote producido. */}
        {closedOrder.actualOutputs.some((o) => o.batchId) && (
          <Card>
            <CardHeader>
              <CardTitle>Seguí estos lotes</CardTitle>
              <p className="text-sm text-foreground-muted">Mirá el recorrido completo: de qué leche salió y a qué clientes llegó.</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {closedOrder.actualOutputs
                .filter((o) => o.batchId)
                .map((o) => (
                  <div key={o.batchId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle px-3 py-2">
                    <span className="text-sm">
                      <span className="font-medium text-foreground">{o.productName}</span>{' '}
                      <span className="font-mono text-xs text-foreground-muted">{o.batchCode}</span>
                    </span>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/trazabilidad?lote=${o.batchId}`}>
                        <GitBranch className="h-4 w-4" /> Ver recorrido
                      </Link>
                    </Button>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

        {/* Siguiente paso del pipeline: el producto ya está en stock, listo para vender. */}
        <Card className="border-primary-200 bg-primary-50/40">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground">
              <span className="font-medium">¿Qué sigue?</span> El producto ya entró al stock. Podés despacharlo cuando quieras.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/inventario"><Package className="h-4 w-4" /> Ver en stock</Link>
              </Button>
              <Button asChild>
                <Link href="/ventas"><ShoppingCart className="h-4 w-4" /> Vender</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Vista de cierre: cargar salidas reales.
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Cargar producción — ${order.code}`}
        description={`Receta: ${order.recipeName}. Anotá los kilos reales de cada producto y cerrá la orden.`}        action={
          <Button asChild variant="ghost">
            <Link href="/produccion">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Producto principal</CardTitle>
          <p className="text-sm text-foreground-muted">Lo que se elaboró en esta orden.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {principal.map((o) => (
            <Field
              key={o.productId}
              label={`${o.productName} — kg producidos`}
              htmlFor={`out-${o.productId}`}
              hint={`Esperado: ${o.quantity.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${o.unit}`}
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                placeholder="Ej: 120"
                value={quantities[o.productId] ?? ''}
                onChange={(e) =>
                  setQuantities((q) => ({
                    ...q,
                    [o.productId]: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
              />
            </Field>
          ))}
        </CardContent>
      </Card>

      {byproducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Subproductos</CardTitle>
            <p className="text-sm text-foreground-muted">
              Ricota, suero u otros. Cargá lo que realmente se obtuvo (su valor baja el costo del producto principal).
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {byproducts.map((o) => (
              <Field
                key={o.productId}
                label={`${o.productName} — ${o.unit} obtenidos`}
                htmlFor={`out-${o.productId}`}
                hint={`Esperado: ${o.quantity.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${o.unit}`}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={0}
                  placeholder="Ej: 15"
                  value={quantities[o.productId] ?? ''}
                  onChange={(e) =>
                    setQuantities((q) => ({
                      ...q,
                      [o.productId]: e.target.value === '' ? undefined : Number(e.target.value),
                    }))
                  }
                />
              </Field>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cámara / sector destino</CardTitle>
          <p className="text-sm text-foreground-muted">Opcional. Dónde se guardan los lotes de producto al cerrar la orden.</p>
        </CardHeader>
        <CardContent>
          <Field label="Cámara / sector" htmlFor="warehouseId" hint="Si no elegís, los lotes quedan sin asignar.">
            <select
              id="warehouseId"
              className="flex min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {(warehousesQuery.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="hidden text-sm text-foreground-muted sm:flex sm:items-center sm:gap-1.5">
          <Lock className="h-4 w-4" aria-hidden="true" />
          Cerrar la orden es definitivo.
        </p>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button variant="ghost" onClick={() => router.push('/produccion')}>
            Cancelar
          </Button>
          <Button
            onClick={() => close.mutate()}
            loading={close.isPending}
            loadingText="Cerrando..."
            disabled={!canClose}
          >
            Cerrar orden
          </Button>
        </div>
      </div>
    </div>
  );
}
