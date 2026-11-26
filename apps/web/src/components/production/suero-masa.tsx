'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductionOrder, RecipeByproduct } from '@lasmarias/shared-schemas';
import { Field } from '@/components/ui/field';
import { productionApi, recipesApi } from '@/features/api';
import { formatMoney } from '@/lib/utils';

// Ricota del suero de la masa (nov 2026). La ricota se hace con el suero de la masa del día:
// lo que vale la ricota (kg × recupero de la receta de la masa) se le descuenta a la masa y
// entra como costo de la ricota. Acá viven las piezas de pantalla de ese vínculo.

const SELECT_CLASS =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1';

const kgFmt = (n: number | string) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 });

// Selector "¿De qué masa es el suero?": masas del día de la ricota y del anterior.
// `value` '' = suero sin masa (no descuenta). `auto` = preseleccionar si hay una sola masa.
export function SueroMasaSelect({
  fecha,
  value,
  onChange,
  auto,
  currentCode,
}: {
  fecha: string;
  value: string;
  onChange: (id: string) => void;
  auto: boolean;
  currentCode?: string;
}) {
  const masas = useQuery({
    queryKey: ['whey-sources', fecha],
    queryFn: () => productionApi.wheySources(fecha),
    enabled: !!fecha,
  });
  const opciones = masas.data ?? [];
  // Se propone la masa del MISMO día de la ricota (el suero es de esa masa). Si ese día no hay
  // masa y solo hay una del día anterior, esa. Con varias del mismo día no se adivina.
  const delDia = opciones.filter((m) => diaArgentina(m.startedAt) === fecha);
  const propuesta = delDia.length === 1 ? delDia[0]!.id : delDia.length === 0 && opciones.length === 1 ? opciones[0]!.id : null;
  useEffect(() => {
    if (auto && propuesta && value === '') onChange(propuesta);
  }, [auto, propuesta, value, onChange]);

  // Al editar, la masa elegida puede ser de otro día: se muestra igual.
  const fuera = value && !opciones.some((m) => m.id === value);

  return (
    <Field label="¿De qué masa es el suero?" htmlFor="wheyFrom" hint="La ricota le descuenta su valor a esa masa.">
      <select id="wheyFrom" className={SELECT_CLASS} value={value} onChange={(e) => onChange(e.target.value)}>
        {fuera && <option value={value}>{currentCode ?? 'Masa elegida'}</option>}
        {opciones.map((m) => (
          <option key={m.id} value={m.id}>
            {m.code} · {m.recipeName}
            {m.status === 'closed' ? ' (cerrada)' : ''}
          </option>
        ))}
        <option value="">Suero sin masa (no descuenta)</option>
      </select>
    </Field>
  );
}

// Fecha (AAAA-MM-DD) en hora argentina, para comparar con la fecha de la ricota.
function diaArgentina(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

// Subproductos de una versión de receta que se elaboran en otra orden (la ricota del suero).
export function useRicotaDelSuero(recipeId: string | undefined, recipeVersionId: string | undefined) {
  const recipe = useQuery({
    queryKey: ['recipe', recipeId],
    queryFn: () => recipesApi.get(recipeId!),
    enabled: !!recipeId,
  });
  const version = recipe.data?.versions?.find((v) => v.id === recipeVersionId);
  return (version?.byproducts ?? []).filter(
    (b): b is RecipeByproduct & { destinationProductId: string } =>
      b.destination === 'elaboracion' && !!b.destinationProductId,
  );
}

// MASA, al cerrar: la ricota del suero no se carga a mano; se muestra lo que ya cerró.
export function RicotaDelSueroFila({ order, name }: { order: ProductionOrder; name: string }) {
  const cerradas = (order.wheyRicotas ?? []).filter((r) => r.status === 'closed' && r.aplicado && r.kg != null);
  const kg = cerradas.reduce((a, r) => a + Number(r.kg), 0);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 text-sm">
      <span className="text-foreground-muted">{name}</span>
      {cerradas.length > 0 ? (
        <span className="font-medium text-foreground">
          {kgFmt(kg)} kg ({cerradas.map((r) => r.code).join(', ')})
        </span>
      ) : (
        <span className="text-foreground-muted">Todavía no hay ricota cerrada</span>
      )}
    </div>
  );
}

// RICOTA, antes de cerrar: cuánto se le va a descontar a la masa con los kg cargados.
export function SueroDescuentoPrevio({ order, kg }: { order: ProductionOrder; kg: number }) {
  const masa = useQuery({
    queryKey: ['production-order', order.wheyFromOrderId],
    queryFn: () => productionApi.get(order.wheyFromOrderId!),
    enabled: !!order.wheyFromOrderId,
  });
  const bps = useRicotaDelSuero(masa.data?.recipeId, masa.data?.recipeVersionId);
  if (!order.wheyFromOrderId || !masa.data) return null;
  const principal = order.expectedOutputs.find((o) => o.isPrincipal);
  const recupero = bps.find((b) => b.destinationProductId === principal?.productId)?.referenceValuePerUnit ?? 0;
  if (!(recupero > 0))
    return (
      <Aviso tono="warning">
        La receta de la masa {masa.data.code} no tiene valor para esta ricota: no se le descuenta nada.
      </Aviso>
    );
  return (
    <Aviso tono="info">
      Se descuentan {kg > 0 ? kgFmt(kg) : 'N'} kg × {formatMoney(recupero)} ={' '}
      <span className="font-semibold">{kg > 0 ? formatMoney(kg * recupero) : '—'}</span> a la masa {masa.data.code}
    </Aviso>
  );
}

// RICOTA cerrada: lo que efectivamente pasó con el suero (o por qué no se descontó).
export function SueroResultado({ order }: { order: ProductionOrder }) {
  const s = order.costBreakdown?.suero;
  if (!s) return null;
  if (!s.aplicado) return <Aviso tono="warning">{s.motivo ?? `No se le descontó nada a la masa ${s.orderCode}`}</Aviso>;
  return (
    <Aviso tono="info">
      Se descontaron {kgFmt(s.kg)} kg × {formatMoney(Number(s.unitValue))} ={' '}
      <span className="font-semibold">{formatMoney(Number(s.valor))}</span> a la masa {s.orderCode}
    </Aviso>
  );
}

// Avisos que devuelve la API al abrir/editar/cerrar (ej: "A la masa OP-… se le descontó…").
export function mostrarAvisos(order: { avisos?: string[] }) {
  for (const a of order.avisos ?? []) toast.info(a, { duration: 10000 });
}

function Aviso({ tono, children }: { tono: 'info' | 'warning'; children: React.ReactNode }) {
  const Icon = tono === 'info' ? Info : TriangleAlert;
  return (
    <p
      className={
        tono === 'info'
          ? 'flex items-start gap-2 rounded-md bg-info/10 px-3 py-2 text-sm text-info'
          : 'flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning'
      }
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
