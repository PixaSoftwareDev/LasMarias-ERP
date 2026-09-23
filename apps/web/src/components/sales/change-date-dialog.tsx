'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { ApiError } from '@/lib/api-client';
import { salesApi } from '@/features/api';
import { formatDate } from '@/lib/utils';
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

// Corregir la fecha de una venta ya cargada: típico cuando se pasaron los remitos de varios
// días juntos y quedaron todos con la fecha de carga. El backend mueve con ella el cargo de
// la cuenta corriente (con su vencimiento) y el cobro al contado.
export function ChangeDateDialog({ order, onClose, onDone }: Props) {
  const [fecha, setFecha] = useState(aInputDate(new Date(order.dispatchedAt)));
  const hoy = aInputDate(new Date());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mutation = useMutation({
    // Mediodía local: evita que el huso horario corra la fecha al día anterior/siguiente.
    mutationFn: () =>
      salesApi.updateOrderDate(order.id, { dispatchedAt: new Date(`${fecha}T12:00:00`).toISOString() }),
    onSuccess: (o) => {
      toast.success(`Venta ${o.code} ahora tiene fecha ${formatDate(o.dispatchedAt)}.`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cambiar la fecha. Probá de nuevo.'),
  });

  const futura = fecha > hoy;
  const sinCambio = fecha === aInputDate(new Date(order.dispatchedAt));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-date-title"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-t-xl bg-surface-elevated shadow-md sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border-subtle p-4 sm:p-6">
          <div>
            <h2 id="change-date-title" className="font-display text-xl font-semibold text-foreground">
              Cambiar fecha de la venta
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
        <div className="space-y-3 p-4 sm:p-6">
          <Field
            label="Fecha del despacho"
            htmlFor="change-date"
            hint="La del remito. El vencimiento de la cuenta corriente se corre con ella."
            error={futura ? 'La fecha no puede ser futura.' : undefined}
          >
            <Input id="change-date" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-border-subtle p-4 sm:px-6">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            loadingText="Guardando..."
            disabled={!fecha || futura || sinCambio}
          >
            <CalendarDays className="h-4 w-4" /> Guardar fecha
          </Button>
        </div>
      </div>
    </div>
  );
}
