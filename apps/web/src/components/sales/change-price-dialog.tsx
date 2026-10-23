'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeDollarSign, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { ApiError } from '@/lib/api-client';
import { salesApi } from '@/features/api';
import { formatMoney as money } from '@/lib/utils';
import type { SalesOrder } from '@lasmarias/shared-schemas';

interface Props {
  order: SalesOrder;
  onClose: () => void;
  onDone: () => void;
}

// Corregir el precio de una venta ya cargada. Caso del dueño: la crema a granel se retira y
// se cobra según el % de grasa del análisis, que llega días después. El backend recalcula el
// importe, el cargo de la cuenta corriente y el cobro al contado. El stock no se toca.
export function ChangePriceDialog({ order, onClose, onDone }: Props) {
  const [precios, setPrecios] = useState<string[]>(order.lines.map((l) => String(l.unitPrice)));
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Un campo vacío NO es $0: hay que escribir el precio (Number('') daría 0 sin avisar).
  const numeros = precios.map((p) => (p.trim() === '' ? NaN : Number(p.replace(',', '.'))));
  const invalido = numeros.some((n) => !Number.isFinite(n) || n < 0);
  const cobrado = (i: number) => {
    const l = order.lines[i]!;
    return l.priceBasis === 'bulto' ? (l.bultos ?? 0) : l.quantity;
  };
  const nuevoTotal = numeros.reduce((acc, n, i) => acc + (Number.isFinite(n) ? Math.round(n * cobrado(i) * 100) / 100 : 0), 0);
  const sinCambio = numeros.every((n, i) => n === order.lines[i]!.unitPrice);

  const mutation = useMutation({
    mutationFn: () => salesApi.updateOrderPrices(order.id, { unitPrices: numeros, reason: motivo || undefined }),
    onSuccess: (o) => {
      toast.success(`Venta ${o.code} corregida: ahora suma ${money(o.total)}.`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo corregir el precio. Probá de nuevo.'),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-price-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-surface-elevated shadow-md sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border-subtle p-4 sm:p-6">
          <div>
            <h2 id="change-price-title" className="font-display text-xl font-semibold text-foreground">
              Corregir precio
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Venta <span className="font-mono">{order.code}</span> · {order.clientName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-md text-foreground-muted hover:bg-surface-subtle"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
          {order.lines.map((l, i) => (
            <Field
              key={i}
              label={`${l.productName} — precio por ${l.priceBasis === 'bulto' ? 'bulto' : l.unit} en pesos`}
              htmlFor={`price-${i}`}
              hint={`${cobrado(i).toLocaleString('es-AR')} ${l.priceBasis === 'bulto' ? 'bultos' : l.unit} · antes ${money(l.unitPrice)}`}
              error={!Number.isFinite(numeros[i]!) || numeros[i]! < 0 ? 'Escribí el precio (puede ser 0).' : undefined}
            >
              <Input
                id={`price-${i}`}
                inputMode="decimal"
                prefix="$"
                value={precios[i]}
                onChange={(e) => setPrecios((cur) => cur.map((p, j) => (j === i ? e.target.value : p)))}
              />
            </Field>
          ))}
          <Field label="Motivo (opcional)" htmlFor="price-reason" hint="Queda anotado en la venta. Ej: análisis 42% de grasa.">
            <Input id="price-reason" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          <div className="flex items-baseline justify-between rounded-md bg-surface-subtle px-3 py-2">
            <span className="text-sm text-foreground-muted">Total nuevo (antes {money(order.total)})</span>
            <span className="font-display text-xl font-bold text-foreground">{money(nuevoTotal)}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle p-4 sm:px-6">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            loadingText="Guardando..."
            disabled={invalido || sinCambio}
          >
            <BadgeDollarSign className="h-4 w-4" /> Guardar precio
          </Button>
        </div>
      </div>
    </div>
  );
}
