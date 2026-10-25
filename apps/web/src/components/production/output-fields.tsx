'use client';

import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { usaBultos } from '@lasmarias/shared-schemas';

// Kilos + bultos de una salida de la orden (cerrar y editar usan el mismo bloque).
// Los bultos solo aparecen en lo que se maneja embolsado/encajonado (masa, quesos,
// subproductos): en el resto no molestan.
export function OutputFields({
  output,
  product,
  kg,
  bultos,
  placeholder,
  onKg,
  onBultos,
}: {
  output: { productId: string; productName: string; quantity: number; unit: string };
  product?: { category: string; kgPorBulto?: number };
  kg?: number;
  bultos?: number;
  placeholder: string;
  onKg: (v: number | undefined) => void;
  onBultos: (v: number | undefined) => void;
}) {
  const conBultos = usaBultos(product?.category);
  const kgPorBulto = product?.kgPorBulto;
  // Sugerencia y aviso suave: si la ficha dice cuánto pesa un bulto, cuántos deberían salir.
  const sugeridos = kgPorBulto && kg && kg > 0 ? Math.round(kg / kgPorBulto) : null;
  const desvia = sugeridos != null && bultos != null && bultos > 0 && Math.abs(bultos - sugeridos) > 1;

  return (
    <div className={conBultos ? 'grid grid-cols-1 gap-4 sm:grid-cols-[1fr,160px]' : ''}>
      <Field
        label={`${output.productName} — ${output.unit === 'kg' ? 'kg producidos' : `${output.unit} obtenidos`}`}
        htmlFor={`out-${output.productId}`}
        hint={
          output.quantity > 0
            ? `Esperado: ${output.quantity.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${output.unit}`
            : undefined
        }
      >
        <Input
          id={`out-${output.productId}`}
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          placeholder={placeholder}
          value={kg ?? ''}
          onChange={(e) => onKg(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      </Field>

      {conBultos && (
        <Field
          label="Bultos"
          htmlFor={`bultos-${output.productId}`}
          hint={
            desvia
              ? `Con ${kgPorBulto} kg por bulto darían ~${sugeridos}`
              : sugeridos != null
                ? `Serían ~${sugeridos}`
                : 'Bolsas o cajas. Opcional.'
          }
        >
          <Input
            id={`bultos-${output.productId}`}
            type="number"
            inputMode="numeric"
            step="1"
            min={0}
            placeholder="Ej: 98"
            value={bultos ?? ''}
            onChange={(e) => onBultos(e.target.value === '' ? undefined : Math.round(Number(e.target.value)))}
          />
        </Field>
      )}
    </div>
  );
}
