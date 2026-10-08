'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ExchangeRate } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { exchangeRatesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

// Cargar la cotización del día SIN salir de la receta (pedido del dueño, oct 2026): antes
// había que ir a Datos maestros → Cotización y se perdía la receta a medio cargar.
// Guarda la cotización de HOY (misma API que la pantalla de Datos maestros) y avisa al que
// llama para que refresque el equivalente en pesos. Mismo lenguaje visual que "Nuevo insumo".

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface Props {
  open: boolean;
  onClose: () => void;
  // Última cotización cargada (si hay): se muestra como referencia y precarga los campos.
  current?: ExchangeRate | null;
}

export function ExchangeRateDialog({ open, onClose, current: currentProp }: Props) {
  const queryClient = useQueryClient();
  // Sin cotizaciones cargadas la API responde vacío y el cliente lo lee como {}: solo es
  // una cotización real si trae fecha.
  const current = currentProp && currentProp.date ? currentProp : null;
  const [usd, setUsd] = useState('');
  const [eur, setEur] = useState('');

  // Al abrir, precargar la última cotización para que solo haya que corregir lo que cambió.
  useEffect(() => {
    if (!open) return;
    setUsd(current ? String(current.usd) : '');
    setEur(current ? String(current.eur) : '');
  }, [open, current]);

  // Esc cierra, como cualquier diálogo.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const save = useMutation({
    mutationFn: () => exchangeRatesApi.upsert({ date: todayKey(), usd: Number(usd), eur: Number(eur) }),
    onSuccess: (rate) => {
      // Refrescar al instante el equivalente en pesos de la receta (sin esperar el refetch).
      queryClient.setQueryData<ExchangeRate | null>(['exchange-rate-latest'], rate);
      queryClient.invalidateQueries({ queryKey: ['exchange-rate-latest'] });
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
      toast.success('Cotización de hoy guardada.');
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar la cotización. Probá de nuevo.'),
  });

  if (!open) return null;

  const canSave = Number(usd) > 0 && Number(eur) > 0 && !save.isPending;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cot-dialog-title"
    >
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle id="cot-dialog-title">Cotización de hoy ({formatDate(todayKey())})</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-foreground-muted">
            {current
              ? `La última cargada es del ${formatDate(current.date)}. Cargá la de hoy y seguís con la receta sin perder nada.`
              : 'Todavía no hay ninguna cotización cargada. Cargá la de hoy y seguís con la receta sin perder nada.'}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSave) save.mutate();
            }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <Field label="Dólar (USD)" htmlFor="cot-dlg-usd" required hint="Pesos por 1 dólar">
              <Input id="cot-dlg-usd" autoFocus type="number" inputMode="decimal" step="0.01" min={0} prefix="$" placeholder="Ej: 1000" value={usd} onChange={(e) => setUsd(e.target.value)} />
            </Field>
            <Field label="Euro (EUR)" htmlFor="cot-dlg-eur" required hint="Pesos por 1 euro">
              <Input id="cot-dlg-eur" type="number" inputMode="decimal" step="0.01" min={0} prefix="$" placeholder="Ej: 1100" value={eur} onChange={(e) => setEur(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="submit" loading={save.isPending} loadingText="Guardando..." disabled={!canSave}>
                Guardar cotización
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
