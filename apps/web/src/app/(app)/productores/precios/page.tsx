'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CircleCheck, TriangleAlert } from 'lucide-react';
import type { MilkMonthPriceRow, SaveMilkMonthPricesResult } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TableSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { milkPricesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatMoney } from '@/lib/utils';

// Precio de la leche por mes (pedido del dueño 10/11/2026): los litros de octubre al precio de
// octubre, los de noviembre al de noviembre. Al guardar, el sistema re-precia las recepciones
// de ese mes → la cuenta corriente de cada tambo queda real. Lo ya elaborado no cambia.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesLargo = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mesAnterior = (m: string) => {
  const y = Number(m.slice(0, 4));
  const mm = Number(m.slice(5, 7));
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`;
};
const hoyMes = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const litrosFmt = (s: string | number) => Number(s).toLocaleString('es-AR', { maximumFractionDigits: 1 });
const precioFmt = (n: number) => `$${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const monedaTxt = (r: MilkMonthPriceRow) =>
  `${r.currency === 'ARS' ? '$' : r.currency}${r.ivaMode === 'con_iva' ? ' + IVA' : ''}`;

export default function PreciosLechePage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(mesAnterior(hoyMes()));
  const q = useQuery({ queryKey: ['milk-prices', month], queryFn: () => milkPricesApi.get(month) });
  const data = q.data;

  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [todos, setTodos] = useState('');
  const [resultado, setResultado] = useState<SaveMilkMonthPricesResult | null>(null);
  const [verSinLeche, setVerSinLeche] = useState(false);

  useEffect(() => {
    if (!data) return;
    setPrecios(Object.fromEntries(data.rows.map((r) => [r.producerId, r.precioMes != null ? String(r.precioMes) : ''])));
  }, [data]);
  useEffect(() => setResultado(null), [month]);

  const conLeche = data?.rows.filter((r) => Number(r.litros) > 0) ?? [];
  const sinLeche = data?.rows.filter((r) => Number(r.litros) <= 0) ?? [];

  // Solo se mandan los que cambiaron.
  const cambios = useMemo(
    () =>
      (data?.rows ?? []).flatMap((r) => {
        const v = (precios[r.producerId] ?? '').trim();
        const nuevo = v === '' ? null : Number(v);
        if (nuevo === r.precioMes) return [];
        return [{ producerId: r.producerId, price: nuevo, row: r }];
      }),
    [data, precios],
  );
  const invalido = cambios.find((c) => c.price != null && !(c.price > 0));

  const save = useMutation({
    mutationFn: () => milkPricesApi.save(month, { prices: cambios.map(({ producerId, price }) => ({ producerId, price })) }),
    onSuccess: (res) => {
      queryClient.setQueryData(['milk-prices', month], res.overview);
      queryClient.invalidateQueries({ queryKey: ['producers'] });
      setResultado(res);
      toast.success(`Precios de ${mesLargo(month)} guardados.`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });

  const aplicarATodos = () => {
    const v = Number(todos);
    if (!(v > 0)) return void toast.error('Poné un precio mayor a 0.');
    setPrecios((p) => ({ ...p, ...Object.fromEntries(conLeche.map((r) => [r.producerId, String(v)])) }));
  };

  const fila = (r: MilkMonthPriceRow) => {
    const v = (precios[r.producerId] ?? '').trim();
    const n = Number(v);
    // Vista previa solo en pesos (USD/EUR se convierte con la cotización de cada día al guardar).
    const nuevoImporte =
      v !== '' && n > 0 && r.currency === 'ARS'
        ? Number(r.litros) * n * (r.ivaMode === 'con_iva' ? 1 + (data?.ivaRate ?? 21) / 100 : 1)
        : null;
    return (
      <div key={r.producerId} className="flex flex-col gap-3 rounded-lg border border-border-subtle p-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{r.producerName}</p>
          {Number(r.litros) > 0 ? (
            <p className="text-sm text-foreground-muted">
              {litrosFmt(r.litros)} L en {r.recepciones} {r.recepciones === 1 ? 'recepción' : 'recepciones'} · hoy a{' '}
              {r.preciosUsados.map(precioFmt).join(' y ')}/L = <span className="text-foreground">{formatMoney(Number(r.importe))}</span>
            </p>
          ) : (
            <p className="text-sm text-foreground-muted">Sin leche en {mesLargo(month)}</p>
          )}
          {nuevoImporte != null && Math.abs(nuevoImporte - Number(r.importe)) >= 0.01 && Number(r.litros) > 0 && (
            <p className="text-sm font-medium">
              Con el precio nuevo: {formatMoney(nuevoImporte)} ({nuevoImporte > Number(r.importe) ? '+' : '−'}
              {formatMoney(Math.abs(nuevoImporte - Number(r.importe)))})
            </p>
          )}
        </div>
        <Field label={`Precio ${mesLargo(month)} (${monedaTxt(r)})`} htmlFor={`pl-${r.producerId}`} className="sm:w-56">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={precios[r.producerId] ?? ''}
            placeholder={r.precioAcordado != null ? `${r.precioAcordado} (acordado)` : 'Sin precio'}
            onChange={(e) => setPrecios((p) => ({ ...p, [r.producerId]: e.target.value }))}
          />
        </Field>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/productores">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Productores
        </Link>
      </Button>
      <PageHeader
        title="Precio de la leche por mes"
        description="Cargá lo que vale el litro de cada tambo en el mes. Todas las recepciones de ese mes pasan a ese precio y la cuenta corriente del tambo queda al día."
      />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Mes" htmlFor="pl-mes" className="sm:w-56">
              <Input type="month" value={month} max={data?.mesActual} onChange={(e) => e.target.value && setMonth(e.target.value)} />
            </Field>
            <Field label="Mismo precio para todos" htmlFor="pl-todos" className="sm:w-56">
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={todos} onChange={(e) => setTodos(e.target.value)} />
            </Field>
            <Button variant="secondary" onClick={aplicarATodos}>
              Poner a los {conLeche.length} con leche
            </Button>
          </div>
          <p className="text-sm text-foreground-muted">
            Si dejás un tambo vacío, sus recepciones usan el precio acordado. Lo que ya se elaboró con esta leche no cambia de
            costo.
          </p>
        </CardContent>
      </Card>

      {q.isLoading || !data ? (
        <TableSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Tambos con leche en {mesLargo(month)}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {conLeche.length === 0 && <p className="text-sm text-foreground-muted">No entró leche en {mesLargo(month)}.</p>}
            {conLeche.map(fila)}
            {sinLeche.length > 0 && (
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setVerSinLeche((x) => !x)}>
                {verSinLeche ? 'Ocultar' : 'Ver'} tambos sin leche este mes ({sinLeche.length})
              </Button>
            )}
            {verSinLeche && sinLeche.map(fila)}

            {resultado && <Resultado r={resultado} month={month} />}

            {invalido && (
              <p className="flex items-center gap-2 text-sm text-danger" role="alert">
                <TriangleAlert className="h-4 w-4" aria-hidden="true" /> El precio de {invalido.row.producerName} tiene que ser mayor a 0.
              </p>
            )}
            <Button
              className="sm:self-end"
              onClick={() => save.mutate()}
              disabled={cambios.length === 0 || !!invalido || save.isPending}
              loading={save.isPending}
              loadingText="Guardando..."
            >
              Guardar precios de {mesLargo(month)}
              {cambios.length > 0 ? ` (${cambios.length})` : ''}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Resultado({ r, month }: { r: SaveMilkMonthPricesResult; month: string }) {
  const dif = Number(r.importeDespues) - Number(r.importeAntes);
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-success/40 bg-success/5 p-3 text-sm" role="status">
      <p className="flex items-center gap-2 font-medium">
        <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
        Se actualizaron {r.recepcionesActualizadas} recepciones de {mesLargo(month)}.
      </p>
      <p>
        A pagar a esos tambos: {formatMoney(Number(r.importeAntes))} → <strong>{formatMoney(Number(r.importeDespues))}</strong> (
        {dif >= 0 ? '+' : '−'}
        {formatMoney(Math.abs(dif))}). La cuenta corriente ya lo muestra.
      </p>
      {Number(r.litrosYaElaborados) > 0 && (
        <p className="text-foreground-muted">
          De esa leche ya se elaboraron {litrosFmt(r.litrosYaElaborados)} L con el precio anterior: esas elaboraciones no cambian
          (diferencia {formatMoney(Math.abs(Number(r.diferenciaYaElaborada)))}). La leche que queda en silo ya tiene el precio nuevo.
        </p>
      )}
    </div>
  );
}
