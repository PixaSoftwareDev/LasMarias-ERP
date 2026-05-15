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
import { clientsApi, productsApi, salesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

interface Line {
  productId: string;
  quantity: number;
}

export default function NewSalesOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const clientsQuery = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });

  const [clientId, setClientId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: 1 }]);
  const [notes, setNotes] = useState('');

  const sellableProducts = useMemo(
    () => productsQuery.data?.filter((p) => p.category === 'queso' || p.category === 'subproducto') ?? [],
    [productsQuery.data],
  );

  // Sugerencia automática de fecha de reparto a partir de la zona del cliente
  useEffect(() => {
    if (!clientId) return;
    const c = clientsQuery.data?.find((x) => x.id === clientId);
    if (c?.zoneId) {
      // El backend hace el cálculo si lo dejamos vacío en createOrder; acá solo intentamos pre-rellenar.
      // Llamada manual al endpoint de next-date (opcional, ahorra ida-vuelta).
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/delivery/next-date?zoneId=${c.zoneId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('lm.accessToken')}` },
      })
        .then((r) => r.text())
        .then((d) => setDeliveryDate(d.replace(/"/g, '')))
        .catch(() => undefined);
    }
  }, [clientId, clientsQuery.data]);

  const create = useMutation({
    mutationFn: () =>
      salesApi.createOrder({
        clientId,
        deliveryDate: deliveryDate || undefined,
        lines: lines.filter((l) => l.productId && l.quantity > 0),
        notes: notes || undefined,
      }),
    onSuccess: (o) => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success(`Pedido ${o.code} creado para ${new Date(o.deliveryDate).toLocaleDateString('es-AR')}`);
      router.push('/ventas');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error al crear pedido'),
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Nuevo pedido"
        description="Carga rápida con cliente y items. La fecha de reparto se sugiere según la zona."
        breadcrumbs={[{ href: '/dashboard', label: 'Inicio' }, { href: '/ventas', label: 'Ventas' }, { label: 'Nuevo' }]}
        action={<Button asChild variant="ghost"><Link href="/ventas"><ArrowLeft className="h-4 w-4" /> Volver</Link></Button>}
      />

      <Card>
        <CardHeader><CardTitle>Datos</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="clientId" required>
            <select className="min-h-touch w-full rounded-md border border-border px-3" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Elegí un cliente</option>
              {clientsQuery.data?.map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
            </select>
          </Field>
          <Field label="Fecha de reparto" htmlFor="deliveryDate" hint="Si el cliente tiene zona, se sugiere automáticamente">
            <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </Field>

          <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Items</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setLines([...lines, { productId: '', quantity: 1 }])}>
                <Plus className="h-4 w-4" /> Agregar item
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((row, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,120px,auto]">
                  <select className="min-h-touch rounded-md border border-border px-3" value={row.productId} onChange={(e) => {
                    const next = [...lines]; next[idx]!.productId = e.target.value; setLines(next);
                  }}>
                    <option value="">Producto</option>
                    {sellableProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Input type="number" inputMode="decimal" step="0.1" min={0.1} value={row.quantity} onChange={(e) => {
                    const next = [...lines]; next[idx]!.quantity = Number(e.target.value); setLines(next);
                  }} />
                  <Button type="button" size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Field label="Notas" htmlFor="notes" className="sm:col-span-2">
            <textarea className="w-full rounded-md border border-border px-3 py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!clientId || lines.every((l) => !l.productId)}>
          Guardar pedido
        </Button>
      </div>
    </div>
  );
}
