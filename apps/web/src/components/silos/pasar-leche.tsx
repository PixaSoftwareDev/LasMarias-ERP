'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, X } from 'lucide-react';
import { toast } from 'sonner';
import type { SiloLevel } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { inventoryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

// Pasar leche de un silo a otro (pedido del dueño, 16/11/2026): lo que sobró en un tanque
// se pasa a otro. Sale primero la leche más vieja; el costo y el tambo viajan con ella.

const litros = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 });
const SELECT =
  'flex min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

export function PasarLeche({ silos, onClose }: { silos: SiloLevel[]; onClose: () => void }) {
  const qc = useQueryClient();
  const conLeche = silos.filter((s) => s.currentLiters > 0);
  const [fromId, setFromId] = useState(conLeche[0]?.id ?? '');
  const [toId, setToId] = useState('');
  const [cantidad, setCantidad] = useState('');

  const from = silos.find((s) => s.id === fromId);
  const to = silos.find((s) => s.id === toId);
  const n = Number(cantidad);
  const lugar = to && to.capacityLiters > 0 ? Math.max(0, to.capacityLiters - to.currentLiters) : Infinity;

  // Avisos en vivo, antes de apretar el botón.
  const errorLitros =
    cantidad === ''
      ? undefined
      : !(n > 0)
        ? 'Cargá los litros que pasás.'
        : from && n > from.currentLiters + 1e-6
          ? `En el ${from.name} hay ${litros(from.currentLiters)} L.`
          : n > lugar + 1e-6
            ? `En el ${to!.name} entran ${litros(lugar)} L.`
            : undefined;
  const listo = !!from && !!to && from.id !== to.id && n > 0 && !errorLitros;

  const pasar = useMutation({
    mutationFn: () => inventoryApi.transferSilo({ fromWarehouseId: fromId, toWarehouseId: toId, liters: n }),
    onSuccess: (r) => {
      toast.success(`Listo: ${litros(r.liters)} L pasaron del ${r.fromName} al ${r.toName}.`);
      qc.invalidateQueries({ queryKey: ['silos'] });
      qc.invalidateQueries({ queryKey: ['milk-batches'] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'No se pudo pasar la leche. Probá de nuevo.'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Pasar leche de un silo a otro</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (listo && !pasar.isPending) pasar.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <Field label="Desde" htmlFor="pasar-desde">
              <select className={SELECT} value={fromId} onChange={(e) => setFromId(e.target.value)}>
                <option value="">Elegí un silo</option>
                {conLeche.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {litros(s.currentLiters)} L
                  </option>
                ))}
              </select>
            </Field>
            <ArrowRight className="mx-auto hidden h-5 w-5 text-foreground-muted sm:mb-3 sm:block" aria-hidden="true" />
            <Field label="Hacia" htmlFor="pasar-hacia">
              <select className={SELECT} value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Elegí un silo</option>
                {silos
                  .filter((s) => s.id !== fromId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.capacityLiters > 0 ? `entran ${litros(Math.max(0, s.capacityLiters - s.currentLiters))} L` : `${litros(s.currentLiters)} L`}
                    </option>
                  ))}
              </select>
            </Field>
          </div>

          <Field label="Litros" htmlFor="pasar-litros" error={errorLitros}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              suffix="L"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </Field>
          {from && from.currentLiters > 0 && (
            <button
              type="button"
              className="-mt-2 self-start text-sm font-medium text-primary-700 underline-offset-2 hover:underline"
              onClick={() => setCantidad(String(Math.min(from.currentLiters, lugar)))}
            >
              Pasar todo ({litros(Math.min(from.currentLiters, lugar))} L)
            </button>
          )}

          <Button type="submit" className="w-full sm:w-auto sm:self-end" disabled={!listo || pasar.isPending}>
            {pasar.isPending ? 'Pasando…' : 'Pasar leche'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
