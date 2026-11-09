'use client';

import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';

// "Litros a elaborar" (audio del dueño 09/11/2026): sabe de antemano cuánto va a elaborar
// (ej. 21.500 L) y arma la orden juntando lotes de varios silos. Antes sacaba a mano cuánto
// le faltaba; ahora carga la meta y la pantalla le va diciendo lo que falta. Es solo una ayuda
// de carga: no se guarda ni toca la calculadora (los litros reales son la suma de los lotes).

interface Row {
  batchId: string;
  liters: number;
}

// Suma exacta: se cuenta en milésimas (enteros), así 0,1 + 0,2 da 0,3 y no 0,30000000000000004.
// Los lotes guardan hasta 3 decimales, igual que el backend.
const MIL = 1000;
const toMil = (n: number | string) => Math.round(Number(n) * MIL);
const fromMil = (m: number) => m / MIL;

export function sumLiters(rows: Row[], exceptIdx?: number): number {
  return fromMil(rows.reduce((acc, r, i) => (i === exceptIdx || !(r.liters > 0) ? acc : acc + toMil(r.liters)), 0));
}

// Litros a proponer al elegir un lote en una fila vacía: lo que falta para la meta, sin pasarse
// de lo que tiene el lote. null = no proponer nada (sin meta, fila ya cargada o meta cumplida).
export function litrosSugeridos(
  rows: Row[],
  idx: number,
  meta: number,
  disponible: number | string | undefined,
): number | null {
  if (!(meta > 0) || rows[idx]!.liters > 0) return null;
  const falta = toMil(meta) - toMil(sumLiters(rows, idx));
  if (falta <= 0) return null;
  const disp = Number(disponible);
  return fromMil(Number.isFinite(disp) && disp > 0 ? Math.min(falta, toMil(disp)) : falta);
}

const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 });

export function MetaLitrosField({
  value,
  onChange,
  unit,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
}) {
  return (
    <Field
      label={unit === 'L' ? 'Litros a elaborar (opcional)' : `${unit} a elaborar (opcional)`}
      htmlFor="metaLitros"
      hint="Si ya sabés cuánto vas a elaborar, cargalo: te vamos diciendo cuánto falta y al elegir un lote se completa solo."
    >
      <Input
        id="metaLitros"
        type="number"
        inputMode="decimal"
        step="1"
        placeholder={unit === 'L' ? 'Ej: 21500' : 'Ej: 500'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function MetaLitrosResumen({ rows, meta, unit }: { rows: Row[]; meta: number; unit: string }) {
  if (!(meta > 0)) return null;
  const llevas = sumLiters(rows);
  const diff = fromMil(toMil(meta) - toMil(llevas));
  const base = `Llevás ${fmt(llevas)} ${unit} de ${fmt(meta)} ${unit}`;
  if (diff === 0)
    return (
      <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success" role="status">
        <CircleCheck className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        {base}. <strong>Completo.</strong>
      </p>
    );
  if (diff > 0)
    return (
      <p className="rounded-md bg-info/10 px-3 py-2 text-sm text-info" role="status">
        {base} · <strong>faltan {fmt(diff)} {unit}</strong>
      </p>
    );
  return (
    <p className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-foreground" role="status">
      <TriangleAlert className="h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
      {base} · <strong>te pasaste {fmt(-diff)} {unit}</strong>
    </p>
  );
}
