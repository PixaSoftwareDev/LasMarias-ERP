'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Save, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { productsApi, clientsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

// Precios particulares de UN cliente: override sobre la lista por tipo. En pesos.
// Vacío = ese producto sigue la lista por tipo de cliente.
export default function ClientPricesPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const queryClient = useQueryClient();

  const clientsQuery = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const client = clientsQuery.data?.find((c) => c.id === clientId);
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const pricesQuery = useQuery({ queryKey: ['client-prices', clientId], queryFn: () => clientsApi.prices(clientId) });

  // precio por productId (string para input controlado).
  const [prices, setPrices] = useState<Record<string, string>>({});

  const sellableProducts = useMemo(
    () =>
      productsQuery.data?.filter(
        (p) => p.category === 'queso' || p.category === 'subproducto' || p.category === 'intermedio',
      ) ?? [],
    [productsQuery.data],
  );

  useEffect(() => {
    if (!pricesQuery.data) return;
    const map: Record<string, string> = {};
    for (const item of pricesQuery.data) map[item.productId] = String(item.unitPrice);
    setPrices(map);
  }, [pricesQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      const items = sellableProducts
        .map((p) => ({ productId: p.id, unitPrice: Number(prices[p.id]) }))
        .filter((i) => Number.isFinite(i.unitPrice) && i.unitPrice >= 0 && (prices[i.productId] ?? '') !== '');
      return clientsApi.upsertPrices(clientId, { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-prices', clientId] });
      toast.success('Precios particulares guardados.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });

  const hasAnyPrice = sellableProducts.some((p) => (prices[p.id] ?? '') !== '' && Number(prices[p.id]) >= 0);
  const loading = productsQuery.isLoading || pricesQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/clientes"><ArrowLeft className="h-4 w-4" /> Clientes</Link>
      </Button>
      <PageHeader
        title={`Precios particulares${client ? ` — ${client.businessName}` : ''}`}
        description="Precio especial para este cliente. Lo que dejes vacío sigue la lista por tipo de cliente."
      />

      <Card>
        <CardHeader><CardTitle>Precios (en pesos)</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-40 animate-pulse rounded-md bg-surface-subtle" />
          ) : sellableProducts.length === 0 ? (
            <EmptyState icon={Tags} title="No hay productos vendibles" description="Cargá productos para poder ponerles un precio especial." />
          ) : (
            <div className="space-y-2">
              {sellableProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.name}</p>
                    <p className="font-mono text-xs text-foreground-muted">{p.sku} · por {p.unit}</p>
                  </div>
                  <div className="relative w-36 flex-shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">$</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      aria-label={`Precio especial de ${p.name}`}
                      placeholder="lista por tipo"
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

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border-subtle bg-surface-elevated/95 backdrop-blur sm:-mx-6">
        <div className="mx-auto flex w-full max-w-7xl justify-end gap-2 px-4 py-3 sm:px-6">
          <Button onClick={() => save.mutate()} loading={save.isPending} loadingText="Guardando..." disabled={loading || !hasAnyPrice}>
            <Save className="h-4 w-4" /> Guardar precios
          </Button>
        </div>
      </div>
    </div>
  );
}
