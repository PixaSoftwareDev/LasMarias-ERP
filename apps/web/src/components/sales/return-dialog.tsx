'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Undo2, X } from 'lucide-react';
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

// Fecha (Date) → "aaaa-mm-dd" en hora local, para el <input type="date">.
function aInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Devolución de un despacho (CLAUDE.md §4.6 — devoluciones con ajuste de stock y
// nota de crédito). El usuario elige cuánto devolver de cada producto (hasta lo
// despachado). El backend repone stock y acredita en cuenta corriente.
export function ReturnDialog({ order, onClose, onDone }: Props) {
  // qty a devolver por productId (string para input controlado).
  const [qty, setQty] = useState<Record<string, string>>({});
  // Bultos a devolver por productId. Solo se pide en las líneas que salieron con bultos.
  const [bultos, setBultos] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  // Fecha real de la devolución: hoy por defecto, editable (se cargan atrasadas). No puede
  // ser futura ni anterior a la venta.
  const hoy = aInputDate(new Date());
  const diaVenta = aInputDate(new Date(order.dispatchedAt));
  const [fecha, setFecha] = useState(hoy);
  const fechaError =
    fecha > hoy ? 'La fecha no puede ser futura.' : fecha < diaVenta ? 'No puede ser anterior a la venta.' : undefined;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lines = useMemo(
    () =>
      order.lines
        .map((l) => {
          const raw = qty[l.productId] ?? '';
          const quantity = Number(raw);
          return { line: l, raw, quantity };
        }),
    [order.lines, qty],
  );

  const selected = lines.filter((l) => l.quantity > 0);
  const overMax = lines.some((l) => l.quantity > l.line.quantity);
  // Si la línea se cobró por bulto, se acredita por bulto devuelto; si no, por kg.
  const refundTotal = selected.reduce((acc, l) => {
    const b = Number(bultos[l.line.productId] ?? '');
    const cantidad = l.line.priceBasis === 'bulto' ? (Number.isFinite(b) ? b : 0) : l.quantity;
    return acc + cantidad * l.line.unitPrice;
  }, 0);

  const mutation = useMutation({
    mutationFn: () =>
      salesApi.createReturn(order.id, {
        lines: selected.map((l) => {
          const b = bultos[l.line.productId];
          return {
            productId: l.line.productId,
            quantity: l.quantity,
            bultos: b != null && b !== '' ? Math.round(Number(b)) : undefined,
          };
        }),
        notes: notes || undefined,
        // Mediodía local: evita que el huso horario corra la fecha al día anterior/siguiente.
        occurredAt: new Date(`${fecha}T12:00:00`).toISOString(),
      }),
    onSuccess: (cn) => {
      toast.success(
        `Devolución registrada · nota de crédito ${cn.code} por ${money(cn.total)}. Se repuso el stock y se acreditó en la cuenta del cliente.`,
      );
      onDone();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'No se pudo registrar la devolución. Probá de nuevo.'),
  });

  const canSave = selected.length > 0 && !overMax && !!fecha && !fechaError && !mutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-surface-elevated shadow-md sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border-subtle p-4 sm:p-6">
          <div>
            <h2 id="return-title" className="font-display text-xl font-semibold text-foreground">
              Devolver mercadería
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

        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
          <p className="text-sm text-foreground-muted">Indicá cuánto se devuelve de cada producto.</p>
          {lines.map(({ line, raw, quantity }) => {
            const over = quantity > line.quantity;
            return (
              <div key={line.productId} className="rounded-lg border border-border-subtle p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{line.productName}</p>
                    <p className="text-xs text-foreground-muted">
                      Despachado: {line.quantity.toLocaleString('es-AR')} {line.unit} · {money(line.unitPrice)} c/u
                    </p>
                  </div>
                  <div className="w-28 flex-shrink-0">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={0}
                      max={line.quantity}
                      aria-label={`Cantidad a devolver de ${line.productName}`}
                      placeholder="0"
                      value={raw}
                      invalid={over}
                      onChange={(e) => setQty((cur) => ({ ...cur, [line.productId]: e.target.value }))}
                    />
                  </div>
                </div>
                {line.bultos != null && (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-foreground-muted">
                      Salieron {line.bultos} {line.bultos === 1 ? 'bulto' : 'bultos'}
                      {line.priceBasis === 'bulto' ? ' · se cobró por bulto' : ''}
                    </p>
                    <div className="w-28 flex-shrink-0">
                      <Input
                        type="number"
                        inputMode="numeric"
                        step="1"
                        min={0}
                        max={line.bultos}
                        aria-label={`Bultos a devolver de ${line.productName}`}
                        suffix="bultos"
                        placeholder="0"
                        value={bultos[line.productId] ?? ''}
                        onChange={(e) => setBultos((cur) => ({ ...cur, [line.productId]: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
                {over && (
                  <p className="mt-1 text-xs text-danger">No podés devolver más de lo despachado.</p>
                )}
              </div>
            );
          })}

          <Field
            label="Fecha de la devolución"
            htmlFor="return-date"
            required
            hint="Por defecto es hoy. Si estás pasando una devolución de otro día, poné esa fecha."
            error={fechaError}
          >
            <Input id="return-date" type="date" value={fecha} min={diaVenta} max={hoy} onChange={(e) => setFecha(e.target.value)} />
          </Field>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="return-notes" className="text-sm font-medium text-foreground">
              Motivo / notas
            </label>
            <textarea
              id="return-notes"
              className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              rows={2}
              placeholder="Por qué se devuelve (opcional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border-subtle p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <Undo2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">A acreditar</span>
              <span className="block font-display text-xl font-bold tracking-tight text-foreground">{money(refundTotal)}</span>
            </span>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              loadingText="Registrando..."
              disabled={!canSave}
            >
              <Undo2 className="h-4 w-4" /> Confirmar devolución
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
