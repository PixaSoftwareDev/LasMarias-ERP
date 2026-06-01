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
import { productsApi, salesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import type { ClientType } from '@lasmarias/shared-schemas';

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'minorista', label: 'Minorista' },
  { value: 'mayorista', label: 'Mayorista' },
  { value: 'distribuidor', label: 'Distribuidor' },
];

// Descarga un CSV generado en el cliente (BOM para que Excel respete los acentos).
function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const csvCell = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;

// Listas de precio por tipo de cliente (CLAUDE.md §4.6). Una grilla de productos
// vendibles con su precio editable. Guardar reemplaza los precios vigentes del tipo.
export default function PreciosPage() {
  const queryClient = useQueryClient();
  const [clientType, setClientType] = useState<ClientType>('minorista');
  // precio por productId (string para input controlado).
  const [prices, setPrices] = useState<Record<string, string>>({});

  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const priceListQuery = useQuery({
    queryKey: ['price-list', clientType],
    queryFn: () => salesApi.priceList(clientType),
  });

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
  }, [priceListQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      const items = sellableProducts
        .map((p) => ({ productId: p.id, unitPrice: Number(prices[p.id]) }))
        .filter((i) => Number.isFinite(i.unitPrice) && i.unitPrice >= 0 && (prices[i.productId] ?? '') !== '');
      return salesApi.upsertPriceList({ clientType, items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list', clientType] });
      toast.success('Lista de precios guardada.');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar la lista. Probá de nuevo.'),
  });

  // Export para compartir: trae las 3 listas y arma una tabla por producto.
  const exportCsv = useMutation({
    mutationFn: async () => {
      const [min, may, dist] = await Promise.all([
        salesApi.priceList('minorista'),
        salesApi.priceList('mayorista'),
        salesApi.priceList('distribuidor'),
      ]);
      const toMap = (arr: { productId: string; unitPrice: number }[]) =>
        new Map(arr.map((i) => [i.productId, i.unitPrice]));
      const mm = toMap(min);
      const my = toMap(may);
      const dd = toMap(dist);
      const lines = [['Producto', 'SKU', 'Minorista', 'Mayorista', 'Distribuidor'].map(csvCell).join(',')];
      for (const p of sellableProducts) {
        lines.push(
          [csvCell(p.name), csvCell(p.sku), mm.get(p.id) ?? '', my.get(p.id) ?? '', dd.get(p.id) ?? ''].join(','),
        );
      }
      downloadCsv('listas-de-precios.csv', lines.join('\r\n'));
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo exportar. Probá de nuevo.'),
  });

  const hasAnyPrice = sellableProducts.some((p) => (prices[p.id] ?? '') !== '' && Number(prices[p.id]) >= 0);
  const loading = productsQuery.isLoading || priceListQuery.isLoading;

  return (
    <div className="flex flex-col gap-6 pb-28">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/admin"><ArrowLeft className="h-4 w-4" /> Datos maestros</Link>
      </Button>
      <PageHeader
        title="Listas de precios"
        description="El precio de cada producto según el tipo de cliente. Se usa al tomar un despacho (editable a mano)."
        action={
          <Button
            variant="secondary"
            onClick={() => exportCsv.mutate()}
            loading={exportCsv.isPending}
            loadingText="Generando..."
            disabled={loading || sellableProducts.length === 0}
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
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
        </CardContent>
      </Card>

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
                  <div className="relative w-36 flex-shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted">$</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      aria-label={`Precio de ${p.name}`}
                      placeholder="0"
                      className="pl-7 text-right"
                      value={prices[p.id] ?? ''}
                      onChange={(e) => setPrices((cur) => ({ ...cur, [p.id]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barra de guardado sticky. CLAUDE.md §5.3 */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface-elevated/95 backdrop-blur md:left-64">
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
