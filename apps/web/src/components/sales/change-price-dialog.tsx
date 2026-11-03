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
import type { FatPricing, Product, SalesOrder } from '@lasmarias/shared-schemas';

interface Props {
  order: SalesOrder;
  // Catálogo: para saber qué líneas se cobran por % de grasa (crema a granel).
  products: Product[];
  onClose: () => void;
  onDone: () => void;
}

// Un campo vacío NO es $0: hay que escribir el número (Number('') daría 0 sin avisar).
const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// Corregir el precio de una venta ya cargada. Caso del dueño: la crema a granel se retira y
// se cobra según el % de grasa del análisis, que llega días después. Para esos productos se
// carga el % y el precio por kg de grasa (la lista) y el precio por kg sale solo. El backend
// recalcula el importe, el cargo de la cuenta corriente y el cobro al contado. El stock no se toca.
export function ChangePriceDialog({ order, products, onClose, onDone }: Props) {
  const porGrasa = order.lines.map(
    (l) => l.fatPct != null || !!products.find((p) => p.id === l.productId)?.pricedByFat,
  );
  const [precios, setPrecios] = useState<string[]>(order.lines.map((l) => String(l.unitPrice)));
  const [pcts, setPcts] = useState<string[]>(order.lines.map((l) => (l.fatPct != null ? String(l.fatPct) : '')));
  // Base: la que quedó congelada; si la venta salió "al 100%" (sin análisis), el precio cargado
  // ES el precio por kg de grasa, así que se prellena con él.
  const [bases, setBases] = useState<string[]>(
    order.lines.map((l, i) => (l.fatBasePrice != null ? String(l.fatBasePrice) : porGrasa[i] && l.fatPct == null ? String(l.unitPrice) : '')),
  );
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setAt = (set: (f: (cur: string[]) => string[]) => void, i: number, v: string) =>
    set((cur) => cur.map((x, j) => (j === i ? v : x)));

  // Por línea: el % y la base (si se cobra por grasa) y el precio resultante.
  const fat: (FatPricing | null)[] = order.lines.map((_, i) => {
    if (!porGrasa[i]) return null;
    const pct = num(pcts[i]!);
    const basePrice = num(bases[i]!);
    return Number.isFinite(pct) && Number.isFinite(basePrice) ? { pct, basePrice } : null;
  });
  const numeros = order.lines.map((_, i) => {
    const f = fat[i];
    return f ? round4((f.basePrice * f.pct) / 100) : num(precios[i]!);
  });
  const errorLinea = (i: number): string | undefined => {
    if (porGrasa[i]) {
      const pct = num(pcts[i]!);
      const base = num(bases[i]!);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return 'Cargá el % de grasa del análisis (entre 0 y 100).';
      if (!Number.isFinite(base) || base < 0) return 'Cargá el precio por kg de grasa (puede ser 0).';
      return undefined;
    }
    return !Number.isFinite(numeros[i]!) || numeros[i]! < 0 ? 'Escribí el precio (puede ser 0).' : undefined;
  };
  const invalido = order.lines.some((_, i) => errorLinea(i) !== undefined);
  const cobrado = (i: number) => {
    const l = order.lines[i]!;
    return l.priceBasis === 'bulto' ? (l.bultos ?? 0) : l.quantity;
  };
  const nuevoTotal = numeros.reduce(
    (acc, n, i) => acc + (Number.isFinite(n) ? Math.round(n * cobrado(i) * 100) / 100 : 0),
    0,
  );
  // Registrar el % de grasa de una venta que se cargó con el precio ya calculado a mano también
  // es un cambio (queda en el remito), aunque el precio dé igual.
  const sinCambio =
    numeros.every((n, i) => n === order.lines[i]!.unitPrice) &&
    fat.every(
      (f, i) =>
        (f?.pct ?? null) === (order.lines[i]!.fatPct ?? null) &&
        (f?.basePrice ?? null) === (order.lines[i]!.fatBasePrice ?? null),
    );

  const mutation = useMutation({
    mutationFn: () =>
      salesApi.updateOrderPrices(order.id, {
        unitPrices: numeros,
        ...(fat.some(Boolean) && { fat }),
        reason: motivo || undefined,
      }),
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
          {order.lines.map((l, i) => {
            const unidad = l.priceBasis === 'bulto' ? 'bulto' : l.unit;
            const detalle = `${cobrado(i).toLocaleString('es-AR')} ${l.priceBasis === 'bulto' ? 'bultos' : l.unit} · antes ${money(l.unitPrice)}`;
            if (!porGrasa[i]) {
              return (
                <Field
                  key={i}
                  label={`${l.productName} — precio por ${unidad} en pesos`}
                  htmlFor={`price-${i}`}
                  hint={detalle}
                  error={errorLinea(i)}
                >
                  <Input
                    id={`price-${i}`}
                    inputMode="decimal"
                    prefix="$"
                    value={precios[i]}
                    onChange={(e) => setAt(setPrecios, i, e.target.value)}
                  />
                </Field>
              );
            }
            return (
              <div key={i} className="space-y-2 rounded-lg border border-border-subtle p-3">
                <p className="text-sm font-medium text-foreground">{l.productName}</p>
                <p className="text-xs text-foreground-muted">
                  {detalle}
                  {l.fatPct != null && ` (${l.fatPct}% grasa)`}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field label="% de grasa del análisis" htmlFor={`fat-${i}`}>
                    <Input
                      id={`fat-${i}`}
                      inputMode="decimal"
                      suffix="%"
                      placeholder="Ej: 59"
                      value={pcts[i]}
                      onChange={(e) => setAt(setPcts, i, e.target.value)}
                    />
                  </Field>
                  <Field label="Precio por kg de grasa" htmlFor={`base-${i}`} hint="El de la lista de precios.">
                    <Input
                      id={`base-${i}`}
                      inputMode="decimal"
                      prefix="$"
                      value={bases[i]}
                      onChange={(e) => setAt(setBases, i, e.target.value)}
                    />
                  </Field>
                </div>
                {errorLinea(i) ? (
                  <p className="text-xs font-medium text-red-600">{errorLinea(i)}</p>
                ) : (
                  <p className="text-sm text-foreground-muted">
                    {money(fat[i]!.basePrice)} × {fat[i]!.pct}% ={' '}
                    <span className="font-display font-bold text-foreground">{money(numeros[i]!)}</span> por {unidad}
                  </p>
                )}
              </div>
            );
          })}
          <Field label="Motivo (opcional)" htmlFor="price-reason" hint="Queda anotado en la venta. Ej: análisis del comprador.">
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
