'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Download, Save, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { productsApi, salesApi, exchangeRatesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';
import { CURRENCY_OPTIONS, currencySymbol, equivalentArs } from '@/features/currency';
import type { ClientType, Currency } from '@lasmarias/shared-schemas';

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'minorista', label: 'Minorista' },
  { value: 'mayorista', label: 'Mayorista' },
  { value: 'distribuidor', label: 'Distribuidor' },
];

// Listas de precio por tipo de cliente (CLAUDE.md §4.6). Una grilla de productos
// vendibles con su precio editable. Guardar reemplaza los precios vigentes del tipo.
export default function PreciosPage() {
  const queryClient = useQueryClient();
  const [clientType, setClientType] = useState<ClientType>('minorista');
  // precio por productId (string para input controlado).
  const [prices, setPrices] = useState<Record<string, string>>({});
  // Moneda de toda la lista (ej: la lista mayorista en USD).
  const [currency, setCurrency] = useState<Currency>('ARS');

  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const priceListQuery = useQuery({
    queryKey: ['price-list', clientType],
    queryFn: () => salesApi.priceList(clientType),
  });
  const latestRate = useQuery({ queryKey: ['exchange-rate-latest'], queryFn: () => exchangeRatesApi.latest() });

  const sellableProducts = useMemo(
    () => productsQuery.data?.filter((p) => p.category === 'queso' || p.category === 'subproducto') ?? [],
    [productsQuery.data],
  );

  // Al cambiar de tipo o cargar la lista, prellenamos con lo que ya hay.
  useEffect(() => {
    if (!priceListQuery.data) return;
    const map: Record<string, string> = {};
    for (const item of priceListQuery.data) map[item.productId] = String(item.unitPrice);
    setPrices(map);
    // La moneda de la lista la toma del primer ítem cargado (toda la lista comparte moneda).
    setCurrency(priceListQuery.data[0]?.currency ?? 'ARS');
  }, [priceListQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      const items = sellableProducts
        .map((p) => ({ productId: p.id, unitPrice: Number(prices[p.id]) }))
        .filter((i) => Number.isFinite(i.unitPrice) && i.unitPrice >= 0 && (prices[i.productId] ?? '') !== '');
      return salesApi.upsertPriceList({ clientType, currency, items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list', clientType] });
      toast.success('Lista de precios guardada.');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar la lista. Probá de nuevo.'),
  });

  // Export a Excel: una fila por producto con sus precios por tipo de cliente.
  const exportXlsx = useMutation({
    mutationFn: () => salesApi.exportPriceListXlsx(),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo exportar. Probá de nuevo.'),
  });

  const hasAnyPrice = sellableProducts.some((p) => (prices[p.id] ?? '') !== '' && Number(prices[p.id]) >= 0);
  const loading = productsQuery.isLoading || priceListQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/admin"><ArrowLeft className="h-4 w-4" /> Datos maestros</Link>
      </Button>
      <PageHeader
        title="Listas de precios"
        description="El precio de cada producto según el tipo de cliente. Se usa al cargar una venta (editable a mano)."
        action={
          <Button
            variant="secondary"
            onClick={() => exportXlsx.mutate()}
            loading={exportXlsx.isPending}
            loadingText="Generando..."
            disabled={loading || sellableProducts.length === 0}
          >
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
        }
      />

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
          <Field label="Tipo de cliente" htmlFor="clientType">
            <select
              id="clientType"
              className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              value={clientType}
              onChange={(e) => setClientType(e.target.value as ClientType)}
            >
              {CLIENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Moneda de la lista" htmlFor="priceCurrency" hint="Si elegís dólares o euros, al vender se convierte con la cotización del día.">
            <select
              id="priceCurrency"
              className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </CardContent>
      </Card>

      {currency !== 'ARS' && !latestRate.data && !latestRate.isLoading && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          Esta lista está en moneda extranjera pero todavía no cargaste una cotización.{' '}
          <Link href="/admin/cotizacion" className="font-medium underline">Cargá el dólar/euro del día</Link> para poder vender con estos precios.
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Precios</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-40 animate-pulse rounded-md bg-surface-subtle" />
          ) : sellableProducts.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="No hay productos vendibles"
              description="Cargá productos (quesos o subproductos) para poder ponerles precio."
            />
          ) : (
            <div className="space-y-2">
              {sellableProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.name}</p>
                    <p className="font-mono text-xs text-foreground-muted">{p.sku} · por {p.unit}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="relative w-36">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">{currencySymbol(currency)}</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        aria-label={`Precio de ${p.name}`}
                        placeholder="0"
                        className="pl-9 text-right"
                        value={prices[p.id] ?? ''}
                        onChange={(e) => setPrices((cur) => ({ ...cur, [p.id]: e.target.value }))}
                      />
                    </div>
                    {(() => {
                      const eq = equivalentArs(prices[p.id] ?? '', currency, latestRate.data ?? undefined);
                      if (eq != null) return <p className="mt-1 text-xs text-foreground-muted">≈ {formatMoney(eq)}</p>;
                      return null;
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barra de guardado sticky. CLAUDE.md §5.3 */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border-subtle bg-surface-elevated/95 backdrop-blur sm:-mx-6">
        <div className="mx-auto flex w-full max-w-7xl justify-end gap-2 px-4 py-3 sm:px-6">
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            loadingText="Guardando..."
            disabled={loading || !hasAnyPrice}
          >
            <Save className="h-4 w-4" /> Guardar lista
          </Button>
        </div>
      </div>
    </div>
  );
}
