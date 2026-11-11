'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus, CheckCircle2, Copy, Factory, Pencil, Plus, Settings2, Trash2, TriangleAlert } from 'lucide-react';
import { avisosAlConfirmar, cuotaDe, cuotasDelMes, gastosGrandesDeUnMes, sumarMeses } from '@lasmarias/shared-schemas';
import type { FixedCostCuota, FixedCostLine, FixedCostMonth, FixedCostsOverview, FixedCostType } from '@lasmarias/shared-schemas';
import { TiposGasto } from '@/components/fixed-costs/tipos-gasto';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent } from '@/components/ui/card';
import { TableSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { FinanceTabs } from '@/components/finance-tabs';
import { fixedCostsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { cn, formatMoney } from '@/lib/utils';

// Costos fijos de planta (audio del dueño 10/11/2026). Se cargan por mes: cada gasto es de un
// tipo que arma el dueño (Sueldo, Luz…) con sus campos, más el monto. El sistema divide el total
// por la leche promedio por mes y, cuando el mes se confirma, ese $/litro se suma solo al
// cerrar cada elaboración con leche. Las cuentas las hace el servidor; acá solo la vista previa.
//
// Pantalla: arriba lo que se está sumando hoy; a la izquierda los meses (con su estado); a la
// derecha el mes elegido: se LEE como lista compacta y se edita con "Editar".

interface Dato {
  campo: string;
  valor: string;
}
interface Row {
  key: number;
  tipo: string;
  datos: Dato[];
  monto: string;
  repetir: boolean; // se copia al mes siguiente
  repartirEn: string; // meses en que se reparte el monto (1 = todo en este mes)
  pendiente: boolean; // variable copiado: falta la factura de este mes
  montoAnterior: string; // pendiente: el campo queda vacío y mientras tanto se usa este monto (el del mes anterior)
}

let seq = 0;

// Los campos de un gasto: los del tipo actual (si existe), conservando lo ya cargado; si el
// tipo se borró, los que tenía guardados.
function datosPara(tipo: string, tipos: FixedCostType[], previos: Dato[] = []): Dato[] {
  const t = tipos.find((x) => x.nombre === tipo);
  if (!t) return previos;
  return t.campos.map((campo) => ({ campo, valor: previos.find((d) => d.campo === campo)?.valor ?? '' }));
}
const toRow = (l: FixedCostLine, tipos: FixedCostType[], conTipoActual: boolean): Row => ({
  key: ++seq,
  tipo: l.tipo,
  datos: conTipoActual ? datosPara(l.tipo, tipos, l.datos) : l.datos,
  // Si falta la factura, el campo se ve vacío; el monto guardado es el del mes anterior.
  monto: l.pendiente ? '' : String(l.monto),
  repetir: !!l.repetir,
  repartirEn: String(l.repartirEn ?? 1),
  pendiente: !!l.pendiente,
  montoAnterior: l.pendiente ? String(l.monto) : '',
});
const nuevaRow = (): Row => ({ key: ++seq, tipo: '', datos: [], monto: '', repetir: false, repartirEn: '1', pendiente: false, montoAnterior: '' });
// Monto que cuenta: el cargado, o si falta la factura, el del mes anterior.
const montoEfectivo = (r: Row) => (r.pendiente && r.monto.trim() === '' ? r.montoAnterior : r.monto);
const vacia = (r: Row) => !r.tipo && r.monto.trim() === '' && r.datos.every((d) => !d.valor.trim());

// Vista previa en centavos enteros (el servidor hace la misma cuenta y es el que guarda).
// Si el gasto se reparte, este mes suma solo la 1ª cuota.
const mesesDe = (r: Row) => {
  const n = Number(r.repartirEn);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 1;
};
const rowCents = (r: Row) => {
  const m = montoEfectivo(r);
  return m.trim() !== '' && Number(m) >= 0 ? Math.round(Number(cuotaDe(Number(m), mesesDe(r), 1)) * 100) : 0;
};

function toLine(r: Row): FixedCostLine | string {
  if (!r.tipo) return 'Elegí el tipo de gasto en todos los renglones.';
  const m = montoEfectivo(r);
  if (m.trim() === '' || !(Number(m) >= 0)) return `Falta el monto de un gasto de ${r.tipo}.`;
  const n = mesesDe(r);
  return {
    tipo: r.tipo,
    datos: r.datos.map((d) => ({ campo: d.campo, valor: d.valor.trim() })),
    monto: Number(m),
    repetir: r.repetir && n <= 1, // repartido → no se repite (ver schema)
    repartirEn: n,
    pendiente: r.pendiente,
  };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesLargo = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
// En títulos va con mayúscula ("Noviembre 2026"); dentro de una frase, en minúscula.
const Mes = ({ m, titulo }: { m: string; titulo?: boolean }) => <span className={titulo ? 'capitalize' : undefined}>{mesLargo(m)}</span>;
const litrosFmt = (s: string | number) => Number(s).toLocaleString('es-AR', { maximumFractionDigits: 1 });
const pctFmt = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;
const porLitro = (s: string | number) =>
  `$${Number(s).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const detalle = (datos: { valor: string }[]) => datos.map((d) => d.valor).filter(Boolean).join(' · ');

type Estado = 'en_uso' | 'listo' | 'sin_terminar' | 'sin_cargar';
function estadoDe(m: FixedCostMonth | undefined): Estado {
  if (!m) return 'sin_cargar';
  if (m.enUso) return 'en_uso';
  return m.listo ? 'listo' : 'sin_terminar';
}
const ESTADO: Record<Estado, { label: string; cls: string }> = {
  en_uso: { label: 'En uso', cls: 'bg-success/10 text-success' },
  listo: { label: 'Confirmado', cls: 'bg-surface-subtle text-foreground-muted' },
  sin_terminar: { label: 'Sin confirmar', cls: 'bg-warning/15 text-foreground' },
  sin_cargar: { label: 'Sin cargar', cls: 'bg-surface-subtle text-foreground-muted' },
};
function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', className)}>{children}</span>;
}

export default function CostosFijosPage() {
  const q = useQuery({ queryKey: ['fixed-costs'], queryFn: () => fixedCostsApi.overview() });
  const data = q.data;
  const [month, setMonth] = useState('');
  const [verTipos, setVerTipos] = useState(false);
  // Sin tipos todavía: el panel arranca abierto y queda abierto mientras se crean (no se cierra
  // solo al crear el primero); se cierra con su X o con el botón de arriba.
  useEffect(() => {
    if (data && data.tipos.length === 0) setVerTipos(true);
  }, [data]);

  // Mes que se abre = lo que hay que hacer: el más nuevo sin terminar; si el mes pasado todavía
  // no se cargó, ese; si no, el que está en uso.
  useEffect(() => {
    if (!data || month) return;
    const anterior = sumarMeses(data.mesActual, -1);
    const sinTerminar = data.months.find((m) => !m.listo);
    const faltaAnterior = !data.months.some((m) => m.month === anterior);
    setMonth(sinTerminar?.month ?? (faltaAnterior ? anterior : (data.enUso?.month ?? anterior)));
  }, [data, month]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Costos fijos"
        description="Luz, gas, sueldos, alquiler… Se cargan una vez por mes y se suman solos al costo de cada elaboración, por litro de leche."
      />
      <FinanceTabs />

      {q.isLoading || !data || !month ? (
        <TableSkeleton />
      ) : (
        <>
          <Resumen data={data} onVerTipos={() => setVerTipos((v) => !v)} verTipos={verTipos} />
          {verTipos && <TiposGasto tipos={data.tipos} abierto onCerrar={() => setVerTipos(false)} />}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
            <MesesLista data={data} month={month} onSelect={setMonth} />
            <MesDetalle key={month} data={data} month={month} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Arriba: lo que se está sumando hoy + la leche promedio ─────────────────────
function Resumen({ data, onVerTipos, verTipos }: { data: FixedCostsOverview; onVerTipos: () => void; verTipos: boolean }) {
  const sinTerminar = data.months[0] && !data.months[0].listo ? data.months[0] : null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Factory className="mt-1 h-6 w-6 flex-shrink-0 text-primary-700" aria-hidden="true" />
            {data.enUso ? (
              <div>
                <p className="text-sm text-foreground-muted">Costo fijo por litro de leche</p>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <strong className="text-3xl font-bold">{porLitro(data.enUso.costoPorLitro)}</strong>
                  <span className="text-sm text-foreground-muted">{mesLargo(data.enUso.month)}</span>
                </p>
              </div>
            ) : (
              <p className="font-medium">Todavía no se suman costos fijos.</p>
            )}
          </div>
          {data.tipos.length > 0 && (
            <Button variant="secondary" size="sm" className="self-start" onClick={onVerTipos} aria-expanded={verTipos}>
              <Settings2 className="h-4 w-4" aria-hidden="true" /> Tipos de gasto ({data.tipos.length})
            </Button>
          )}
        </div>
        {sinTerminar && (
          <p className="flex items-center gap-2 text-sm" role="status">
            <TriangleAlert className="h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
            <span>
              <Mes m={sinTerminar.month} titulo /> sin confirmar
              {data.enUso && data.enUso.month !== sinTerminar.month ? `: se sigue usando ${MESES[Number(data.enUso.month.slice(5, 7)) - 1]}.` : '.'}
            </span>
          </p>
        )}
        <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
          <LitrosNormales data={data} />
          <Inflacion data={data} />
        </div>
      </CardContent>
    </Card>
  );
}

// Leche de un mes normal: el promedio de los últimos 12 meses, o un número cargado a mano.
function LitrosNormales({ data }: { data: FixedCostsOverview }) {
  const queryClient = useQueryClient();
  const n = data.litrosNormales;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const set = useMutation({
    mutationFn: (litros: number | null) => fixedCostsApi.setLitrosNormales(litros),
    onSuccess: (o, litros) => {
      queryClient.setQueryData(['fixed-costs'], o);
      setEditando(false);
      toast.success(litros == null ? 'Se vuelve a usar el promedio de los últimos meses.' : 'Leche de un mes normal guardada.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });
  const onGuardar = () => {
    const v = Number(valor);
    if (!(v > 0)) return void toast.error('Poné los litros de un mes normal (más de 0).');
    set.mutate(v);
  };
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-foreground-muted">
          Leche promedio por mes: <strong className="text-foreground">{n.valor != null ? `${litrosFmt(n.valor)} L` : '—'}</strong>
          {n.manual != null && ' (cargada a mano)'}
        </span>
        {!editando && (
          <span className="flex gap-1">
            {n.manual != null && n.promedio != null && (
              <Button variant="ghost" size="sm" onClick={() => set.mutate(null)} disabled={set.isPending}>
                Usar el promedio ({litrosFmt(n.promedio)} L)
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setValor(n.valor ?? '');
                setEditando(true);
              }}
            >
              Cambiar
            </Button>
          </span>
        )}
      </div>
      {editando && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Leche promedio por mes (litros)" htmlFor="cf-litros-normales" className="sm:w-64">
            <Input type="number" inputMode="decimal" min={1} step="1" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Field>
          <Button variant="ghost" onClick={() => setEditando(false)} disabled={set.isPending}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} loading={set.isPending} loadingText="Guardando...">
            Guardar
          </Button>
          <p className="text-xs text-foreground-muted sm:pb-3">Cambia el mes en uso y los que vengan; los meses viejos quedan como estaban.</p>
        </div>
      )}
    </div>
  );
}

// Ajuste por inflación: % por mes que se suma al costo por litro (los gastos de un mes se cargan
// en las elaboraciones del mes siguiente, cuando todo ya subió).
function Inflacion({ data }: { data: FixedCostsOverview }) {
  const queryClient = useQueryClient();
  const actual = Number(data.inflacion);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const set = useMutation({
    mutationFn: (porcentaje: number) => fixedCostsApi.setInflacion(porcentaje),
    onSuccess: (o) => {
      queryClient.setQueryData(['fixed-costs'], o);
      setEditando(false);
      toast.success(o.enUso ? `Guardado. Cada elaboración suma ${porLitro(o.enUso.costoPorLitro)} por litro.` : 'Ajuste guardado.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });
  const onGuardar = () => {
    const v = Number(valor.replace(',', '.'));
    if (!(v >= 0 && v <= 30)) return void toast.error('Poné un porcentaje entre 0 y 30.');
    set.mutate(Math.round(v * 100) / 100);
  };
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-foreground-muted">
          Ajuste por inflación: <strong className="text-foreground">{actual > 0 ? `${pctFmt(actual)} por mes` : 'sin ajuste'}</strong>
        </span>
        {!editando && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValor(actual > 0 ? String(actual) : '');
              setEditando(true);
            }}
          >
            Cambiar
          </Button>
        )}
      </div>
      {editando && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Inflación por mes (%)" htmlFor="cf-inflacion" className="sm:w-48">
            <Input type="number" inputMode="decimal" min={0} max={30} step="0.1" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" />
          </Field>
          <Button variant="ghost" onClick={() => setEditando(false)} disabled={set.isPending}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} loading={set.isPending} loadingText="Guardando...">
            Guardar
          </Button>
          <p className="text-xs text-foreground-muted sm:pb-3">Cambia el mes en uso y los que vengan; los meses viejos quedan como estaban.</p>
        </div>
      )}
    </div>
  );
}

// ─── Izquierda: los meses ───────────────────────────────────────────────────────
function MesesLista({ data, month, onSelect }: { data: FixedCostsOverview; month: string; onSelect: (m: string) => void }) {
  const [otro, setOtro] = useState(false);
  // Los cargados + el mes actual y el anterior aunque todavía no tengan gastos.
  const meses = useMemo(
    () => [...new Set([...data.months.map((m) => m.month), data.mesActual, sumarMeses(data.mesActual, -1), month])].sort().reverse(),
    [data, month],
  );
  return (
    <nav aria-label="Meses" className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground-muted">Meses</p>
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {meses.map((m) => {
          const g = data.months.find((x) => x.month === m);
          const est = estadoDe(g);
          const activo = m === month;
          return (
            <li key={m} className="flex-shrink-0">
              <button
                type="button"
                onClick={() => onSelect(m)}
                aria-current={activo ? 'true' : undefined}
                className={cn(
                  'flex min-h-touch w-56 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-colors lg:w-full',
                  activo ? 'border-primary-600 bg-primary-50/60 shadow-sm' : 'border-border-subtle bg-surface-elevated hover:bg-surface-subtle',
                )}
              >
                <span className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="whitespace-nowrap font-medium">
                    <Mes m={m} titulo />
                  </span>
                  <Chip className={ESTADO[est].cls}>{ESTADO[est].label}</Chip>
                </span>
                {g ? (
                  <span className="text-sm text-foreground-muted">
                    {formatMoney(Number(g.total))}
                    {g.costoPorLitro != null && <> · {porLitro(g.costoPorLitro)}/L</>}
                  </span>
                ) : (
                  <span className="text-sm text-foreground-muted">Sin gastos todavía</span>
                )}
                {g?.lines.some((l) => l.pendiente) && <Chip className="bg-warning/15 text-foreground">Falta factura</Chip>}
              </button>
            </li>
          );
        })}
      </ul>
      {otro ? (
        <Field label="Otro mes" htmlFor="cf-mes">
          <Input
            type="month"
            max={data.mesActual}
            onChange={(e) => {
              if (e.target.value) {
                onSelect(e.target.value);
                setOtro(false);
              }
            }}
          />
        </Field>
      ) : (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setOtro(true)}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Otro mes
        </Button>
      )}
    </nav>
  );
}

// ─── Derecha: el mes elegido ────────────────────────────────────────────────────
function MesDetalle({ data, month }: { data: FixedCostsOverview; month: string }) {
  const queryClient = useQueryClient();
  const tipos = data.tipos;
  const guardado = data.months.find((m) => m.month === month);
  const anterior = data.months.find((m) => m.month < month);
  const repetidos = anterior?.lines.filter((l) => l.repetir) ?? [];

  // Un mes guardado se LEE; uno sin cargar arranca editando (vacío, o con "Copiar").
  const [editando, setEditando] = useState(!guardado);
  const [rows, setRows] = useState<Row[]>(() => (guardado ? guardado.lines.map((l) => toRow(l, tipos, false)) : []));
  const [dirty, setDirty] = useState(false);

  const onSaved = (o: FixedCostsOverview) => queryClient.setQueryData(['fixed-costs'], o);
  const save = useMutation({
    mutationFn: (lines: FixedCostLine[]) => fixedCostsApi.save(month, { lines }),
    onSuccess: (o) => {
      onSaved(o);
      const g = o.months.find((m) => m.month === month);
      setRows(g ? g.lines.map((l) => toRow(l, o.tipos, false)) : []);
      setDirty(false);
      setEditando(false);
      setGrandes(null);
      toast.success(
        o.enUso?.month === month
          ? `Guardado. Cada elaboración suma ${porLitro(o.enUso.costoPorLitro)} por litro.`
          : `Gastos de ${mesLargo(month)} guardados.`,
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });
  // Antes de confirmar: si falta un gasto del mes anterior o el mes no terminó, se pregunta.
  const [avisos, setAvisos] = useState<ReturnType<typeof avisosAlConfirmar> | null>(null);
  const confirmar = () => {
    const a = avisosAlConfirmar(month, guardado?.lines ?? [], anterior, data.mesActual);
    if (a.faltan.length === 0 && !a.enCurso) listo.mutate(true);
    else setAvisos(a);
  };
  const listo = useMutation({
    mutationFn: (v: boolean) => fixedCostsApi.setListo(month, v),
    onSuccess: (o, v) => {
      onSaved(o);
      setAvisos(null);
      toast.success(
        v && o.enUso
          ? `${mesLargo(month)} confirmado. Cada elaboración suma ${porLitro(o.enUso.costoPorLitro)} por litro.`
          : `${mesLargo(month)} quedó sin confirmar.`,
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cambiar. Probá de nuevo.'),
  });

  const update = (key: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const add = () => {
    setRows((rs) => [...rs, nuevaRow()]);
    setDirty(true);
  };
  const setTipo = (key: number, tipo: string) => update(key, { tipo, datos: datosPara(tipo, tipos, rows.find((r) => r.key === key)?.datos) });
  const setDato = (key: number, campo: string, valor: string) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, datos: r.datos.map((d) => (d.campo === campo ? { ...d, valor } : d)) } : r)));
    setDirty(true);
  };
  const remove = (key: number) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setDirty(true);
  };
  // Solo se copian los gastos marcados "se repite todos los meses". Los de monto variable (luz,
  // gas) pasan con el monto vacío y marcados: falta la factura nueva (mientras tanto cuenta la anterior).
  const copiarAnterior = () => {
    if (!anterior || repetidos.length === 0) return;
    setRows(
      repetidos.map((l) => {
        const row = toRow({ ...l, pendiente: false }, tipos, true);
        return tipos.find((t) => t.nombre === l.tipo)?.variable ? { ...row, monto: '', pendiente: true, montoAnterior: String(l.monto) } : row;
      }),
    );
    setDirty(true);
    toast.success(`Copiado de ${mesLargo(anterior.month)}. Cambiá los montos que hayan cambiado y guardá.`);
  };
  const cancelar = () => {
    setRows(guardado ? guardado.lines.map((l) => toRow(l, tipos, false)) : []);
    setDirty(false);
    if (guardado) setEditando(false);
  };
  // Gasto grande de un solo mes (más del 15% del total): antes de guardar se ofrece repartirlo.
  const [grandes, setGrandes] = useState<{ lines: FixedCostLine[]; idx: number[] } | null>(null);
  const onGuardar = () => {
    const lines: FixedCostLine[] = [];
    for (const r of rows.filter((x) => !vacia(x))) {
      const l = toLine(r);
      if (typeof l === 'string') return void toast.error(l);
      lines.push(l);
    }
    const idx = gastosGrandesDeUnMes(lines, prev.total, tipos.filter((t) => t.variable).map((t) => t.nombre));
    if (idx.length) setGrandes({ lines, idx });
    else save.mutate(lines);
  };

  // Vista previa (mientras se edita) con la misma cuenta que el servidor.
  const cuotas = useMemo(() => cuotasDelMes(month, data.months), [data, month]);
  const litros = data.litrosPorMes[month] ?? '0';
  const base = data.basePorMes[month] || litros;
  const cargado = Number(data.cargadoPorMes[month] || 0);
  // % de inflación del mes: el que quedó guardado con él, o el de hoy si todavía no se guardó.
  const infl = Number(guardado?.inflacion ?? data.inflacion);
  const prev = useMemo(() => {
    const cents = rows.reduce((a, r) => a + rowCents(r), 0) + cuotas.reduce((a, c) => a + Math.round(Number(c.cuota) * 100), 0);
    const total = cents / 100;
    const B = Number(base);
    return {
      total,
      sinAjuste: B > 0 ? Number((total / B).toFixed(4)) : null,
      porLitro: B > 0 ? Number(((total * (1 + infl / 100)) / B).toFixed(4)) : null,
    };
  }, [rows, cuotas, base, infl]);
  // Leyendo, los números son los del servidor; editando, los de la vista previa.
  const total = editando || !guardado ? prev.total : Number(guardado.total);
  const pl = editando || !guardado ? prev.porLitro : guardado.costoPorLitro != null ? Number(guardado.costoPorLitro) : null;
  const plSin = editando || !guardado ? prev.sinAjuste : guardado.costoSinAjuste != null ? Number(guardado.costoSinAjuste) : null;
  const est = estadoDe(guardado);
  const mesEnCurso = month >= data.mesActual;
  const pendientes = (editando ? rows : (guardado?.lines ?? [])).filter((r) => r.pendiente);

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        {/* Encabezado del mes: estado + números clave, siempre a la vista. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
              <Mes m={month} titulo />
              <Chip className={ESTADO[est].cls}>{ESTADO[est].label}</Chip>
            </h2>
          </div>
          {/* Totales solo con gastos propios: las cuotas sueltas no son el $/litro del mes. */}
          {(editando ? rows.length > 0 : !!guardado) && (
            <div className="text-left sm:text-right">
              <p className="text-sm text-foreground-muted">Total del mes</p>
              <p className="text-2xl font-bold">{formatMoney(total)}</p>
              <p className="text-sm text-foreground-muted">
                {pl != null ? (
                  <>
                    ÷ {litrosFmt(base)} L = {infl > 0 && plSin != null ? <>{porLitro(plSin)} + {pctFmt(infl)} = </> : null}
                    <strong className="text-primary-700">{porLitro(pl)} por litro</strong>
                  </>
                ) : (
                  'Todavía no hay leche para dividir'
                )}
              </p>
            </div>
          )}
        </div>

        {pendientes.length > 0 && (
          <p className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm" role="status">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
            Falta la factura de {pendientes.map((r) => r.tipo).join(', ')}. Mientras tanto se usa el monto del mes anterior.
          </p>
        )}

        {editando ? (
          <Editor
            month={month}
            tipos={tipos}
            rows={rows}
            puedeCopiar={rows.length === 0 && !!anterior && repetidos.length > 0}
            copiarLabel={
              anterior
                ? `${repetidos.length === 1 ? 'Copiar el gasto que se repite' : `Copiar los ${repetidos.length} gastos que se repiten`} (de ${mesLargo(anterior.month)})`
                : ''
            }
            onCopiar={copiarAnterior}
            onAdd={add}
            onTipo={setTipo}
            onDato={setDato}
            onUpdate={update}
            onRemove={remove}
          />
        ) : (
          <Lectura lines={guardado?.lines ?? []} />
        )}

        {cuotas.length > 0 && <Cuotas cuotas={cuotas} />}

        {!mesEnCurso && (editando ? rows.length > 0 : !!guardado) && total > 0 && <Cobertura cargado={cargado} total={total} />}

        {/* Una sola acción dominante según el momento. */}
        {editando ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {(guardado || dirty) && (
              <Button variant="ghost" onClick={cancelar} disabled={save.isPending}>
                {guardado ? 'Cancelar' : 'Empezar de nuevo'}
              </Button>
            )}
            <Button onClick={onGuardar} loading={save.isPending} loadingText="Guardando..." disabled={!dirty || save.isPending}>
              {`Guardar ${mesLargo(month)}`}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {est === 'sin_terminar' && (
              <div className="flex flex-col gap-3 rounded-lg border border-primary-200 bg-primary-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  <strong>Este mes todavía no se usa.</strong> Confirmalo cuando estén todas las facturas.
                </p>
                <Button onClick={confirmar} loading={listo.isPending && !avisos} loadingText="Guardando..." className="flex-shrink-0">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {`Confirmar ${mesLargo(month)}`}
                </Button>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {guardado?.listo && (
                <Button variant="ghost" onClick={() => listo.mutate(false)} loading={listo.isPending} loadingText="Guardando...">
                  Quitar confirmación
                </Button>
              )}
              <Button variant="secondary" onClick={() => setEditando(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Editar gastos
              </Button>
            </div>
          </div>
        )}
        {grandes && (
          <GastosGrandes
            lineas={grandes.idx.map((i) => grandes.lines[i]!)}
            enviando={save.isPending}
            onRepartir={() => save.mutate(grandes.lines.map((l, i) => (grandes.idx.includes(i) ? { ...l, repartirEn: 12, repetir: false } : l)))}
            onDejar={() => save.mutate(grandes.lines)}
            onCerrar={() => setGrandes(null)}
          />
        )}
        {avisos && (
          <ConfirmarMes
            month={month}
            avisos={avisos}
            enviando={listo.isPending}
            onConfirmar={() => listo.mutate(true)}
            onCerrar={() => setAvisos(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

// Lista compacta de los gastos guardados del mes.
function Lectura({ lines }: { lines: FixedCostLine[] }) {
  if (lines.length === 0) return <p className="rounded-md bg-surface-subtle/40 px-3 py-4 text-sm text-foreground-muted">Este mes no tiene gastos propios.</p>;
  return (
    <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
      {lines.map((l, i) => (
        <li key={i} className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <p className="font-medium">
              {l.tipo}
              {detalle(l.datos) && <span className="font-normal text-foreground-muted"> · {detalle(l.datos)}</span>}
            </p>
            <p className="mt-0.5 flex flex-wrap gap-1">
              {l.repetir && <Chip className="bg-surface-subtle text-foreground-muted">Se repite</Chip>}
              {(l.repartirEn ?? 1) > 1 && (
                <Chip className="bg-surface-subtle text-foreground-muted">
                  {formatMoney(l.monto)} en {l.repartirEn} cuotas · cuota 1
                </Chip>
              )}
              {l.pendiente && <Chip className="bg-warning/15 text-foreground">Falta factura</Chip>}
            </p>
          </div>
          <span className="whitespace-nowrap font-medium">{formatMoney(Number(cuotaDe(l.monto, l.repartirEn ?? 1, 1)))}</span>
        </li>
      ))}
    </ul>
  );
}

// Edición: renglones compactos (tipo + monto arriba, datos abajo, opciones en una línea).
function Editor({
  month,
  tipos,
  rows,
  puedeCopiar,
  copiarLabel,
  onCopiar,
  onAdd,
  onTipo,
  onDato,
  onUpdate,
  onRemove,
}: {
  month: string;
  tipos: FixedCostType[];
  rows: Row[];
  puedeCopiar: boolean;
  copiarLabel: string;
  onCopiar: () => void;
  onAdd: () => void;
  onTipo: (key: number, tipo: string) => void;
  onDato: (key: number, campo: string, valor: string) => void;
  onUpdate: (key: number, patch: Partial<Row>) => void;
  onRemove: (key: number) => void;
}) {
  if (tipos.length === 0) return <p className="text-sm text-foreground-muted">Primero creá al menos un tipo de gasto (arriba).</p>;
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-lg bg-surface-subtle/40 p-4">
          <p className="text-sm text-foreground-muted">
            Todavía no hay gastos en <Mes m={month} />.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {puedeCopiar && (
              <Button onClick={onCopiar}>
                <Copy className="h-4 w-4" aria-hidden="true" /> {copiarLabel}
              </Button>
            )}
            <Button variant={puedeCopiar ? 'ghost' : 'secondary'} onClick={onAdd}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Cargar un gasto
            </Button>
          </div>
        </div>
      )}

      {rows.map((r) => {
        const tipoBorrado = !!r.tipo && !tipos.some((t) => t.nombre === r.tipo);
        const n = mesesDe(r);
        const m = Number(montoEfectivo(r));
        return (
          <div
            key={r.key}
            className={cn('flex flex-col gap-3 rounded-lg border p-3', r.pendiente ? 'border-warning/60 bg-warning/5' : 'border-border-subtle bg-surface-subtle/30')}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-start">
              <Field label="Tipo de gasto" htmlFor={`cf-${r.key}-tipo`} className="col-start-1 row-start-1">
                <select
                  className="min-h-touch w-full rounded-md border border-border bg-surface px-3"
                  value={r.tipo}
                  onChange={(e) => onTipo(r.key, e.target.value)}
                >
                  <option value="">Elegí…</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.nombre}>
                      {t.nombre}
                    </option>
                  ))}
                  {tipoBorrado && <option value={r.tipo}>{r.tipo} (borrado)</option>}
                </select>
              </Field>
              <Field
                label="Monto"
                htmlFor={`cf-${r.key}-monto`}
                // Se ve cómo queda el número escrito ("1750000" → $1.750.000,00): evita errores de tipeo.
                hint={r.monto.trim() !== '' && Number(r.monto) >= 0 ? formatMoney(Number(r.monto)) : undefined}
                className="col-span-2 col-start-1 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  prefix="$"
                  value={r.monto}
                  placeholder={r.pendiente ? 'Factura nueva' : '0'}
                  onChange={(e) => onUpdate(r.key, { monto: e.target.value, pendiente: !!r.montoAnterior && e.target.value.trim() === '' })}
                />
              </Field>
              <Button
                variant="ghost"
                size="sm"
                className="col-start-2 row-start-1 mt-7 sm:col-start-3"
                onClick={() => onRemove(r.key)}
                aria-label={`Sacar gasto ${r.tipo}`}
              >
                <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
              </Button>
            </div>

            {r.pendiente && (
              <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
                  <span>
                    Falta la factura de <Mes m={month} />: mientras tanto cuenta {formatMoney(Number(r.montoAnterior))}.
                  </span>
                </p>
                <Button variant="ghost" size="sm" onClick={() => onUpdate(r.key, { pendiente: false, monto: r.montoAnterior })}>
                  Es el mismo monto
                </Button>
              </div>
            )}

            {r.tipo && r.datos.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {r.datos.map((d) => (
                  <Field key={d.campo} label={d.campo} htmlFor={`cf-${r.key}-${d.campo}`}>
                    <Input value={d.valor} onChange={(e) => onDato(r.key, d.campo, e.target.value)} />
                  </Field>
                ))}
              </div>
            )}

            {r.tipo && (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
                <label className="flex items-center gap-2 text-sm" htmlFor={`cf-${r.key}-repartir`}>
                  <span className="text-foreground-muted">Se paga</span>
                  <select
                    id={`cf-${r.key}-repartir`}
                    className="min-h-touch rounded-md border border-border bg-surface px-2"
                    value={String(n)}
                    // Repartido en varios meses → no se repite (sus cuotas ya pasan solas).
                    onChange={(e) => onUpdate(r.key, Number(e.target.value) > 1 ? { repartirEn: e.target.value, repetir: false } : { repartirEn: e.target.value })}
                  >
                    <option value="1">todo este mes</option>
                    {Array.from({ length: 11 }, (_, i) => i + 2).map((k) => (
                      <option key={k} value={k}>
                        en {k} meses
                      </option>
                    ))}
                  </select>
                </label>
                {n > 1 ? (
                  <p className="text-sm text-foreground-muted">
                    {m > 0 ? `${formatMoney(Number(cuotaDe(m, n, 1)))} por mes, ` : ''}de <Mes m={month} /> a <Mes m={sumarMeses(month, n - 1)} />. Las
                    cuotas pasan solas.
                  </p>
                ) : (
                  <label className="flex min-h-touch cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-primary-600"
                      checked={r.repetir}
                      onChange={(e) => onUpdate(r.key, { repetir: e.target.checked })}
                    />
                    Se repite todos los meses
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}

      {rows.length > 0 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={onAdd}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar otro gasto
        </Button>
      )}
    </div>
  );
}

// Cuotas que le caen al mes de gastos repartidos en meses anteriores (aguinaldo, etc.).
function Cuotas({ cuotas }: { cuotas: FixedCostCuota[] }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border-subtle p-3">
      <p className="text-sm font-medium">Cuotas de meses anteriores (se suman solas)</p>
      <ul className="flex flex-col gap-1">
        {cuotas.map((c, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-x-3 text-sm">
            <span>
              {c.tipo}
              {detalle(c.datos) && <span className="text-foreground-muted"> · {detalle(c.datos)}</span>}
              <span className="text-foreground-muted">
                {' '}
                · cuota {c.numero} de {c.de}, de <Mes m={c.desde} />
              </span>
            </span>
            <span className="whitespace-nowrap">{formatMoney(Number(c.cuota))}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-foreground-muted">Para cambiarlas, editá el mes donde se cargó el gasto.</p>
    </div>
  );
}

// Lo único que importa al dueño: cuánto de los gastos del mes no se recuperó (o se recuperó de
// más). Solo en meses terminados (en curso el número todavía no dice nada) y solo si hay diferencia.
function Cobertura({ cargado, total }: { cargado: number; total: number }) {
  const sinCubrir = Math.round((total - cargado) * 100) / 100;
  if (Math.abs(sinCubrir) < 0.01) return null;
  return sinCubrir > 0 ? (
    <p className="flex items-center justify-between gap-2 rounded-lg bg-warning/10 px-3 py-2 font-medium">
      <span className="flex items-center gap-2">
        <TriangleAlert className="h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
        Sin cubrir
      </span>
      <span className="whitespace-nowrap">{formatMoney(sinCubrir)}</span>
    </p>
  ) : (
    <p className="flex items-center justify-between gap-2 rounded-lg bg-success/10 px-3 py-2 font-medium text-success">
      <span>Cubierto de más</span>
      <span className="whitespace-nowrap">{formatMoney(-sinCubrir)}</span>
    </p>
  );
}

// Ventana para una confirmación puntual (fondo oscuro, Escape cierra, foco en la opción segura).
function Modal({
  titulo,
  onCerrar,
  foco,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  foco: RefObject<HTMLButtonElement>;
  children: ReactNode;
}) {
  useEffect(() => {
    foco.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCerrar, foco]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cf-modal-titulo"
      onClick={onCerrar}
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-t-xl bg-surface-elevated p-5 shadow-md sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="cf-modal-titulo" className="text-xl font-semibold">
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  );
}

const Aviso = ({ children }: { children: ReactNode }) => (
  <li className="flex items-start gap-2">
    <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
    <span>{children}</span>
  </li>
);

// Segunda confirmación, solo si algo no cierra. Revisar es la opción segura (foco por defecto).
function ConfirmarMes({
  month,
  avisos,
  enviando,
  onConfirmar,
  onCerrar,
}: {
  month: string;
  avisos: ReturnType<typeof avisosAlConfirmar>;
  enviando: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  const revisar = useRef<HTMLButtonElement>(null);
  return (
    <Modal titulo={`¿Confirmar ${mesLargo(month)}?`} onCerrar={onCerrar} foco={revisar}>
      <ul className="flex flex-col gap-2 text-sm">
        {avisos.faltan.map((f, i) => (
          <Aviso key={i}>
            Falta <strong>{f.tipo}</strong>
            {f.detalle && ` · ${f.detalle}`} <span className="text-foreground-muted">(en {mesLargo(f.mes)}: {formatMoney(f.monto)})</span>
          </Aviso>
        ))}
        {avisos.enCurso && (
          <Aviso>
            <Mes m={month} titulo /> todavía no terminó.
          </Aviso>
        )}
      </ul>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onConfirmar} loading={enviando} loadingText="Guardando...">
          Confirmar igual
        </Button>
        <Button ref={revisar} onClick={onCerrar} disabled={enviando}>
          Revisar
        </Button>
      </div>
    </Modal>
  );
}

// Gasto grande de un solo mes: repartirlo evita que el $/litro salte un mes.
function GastosGrandes({
  lineas,
  enviando,
  onRepartir,
  onDejar,
  onCerrar,
}: {
  lineas: FixedCostLine[];
  enviando: boolean;
  onRepartir: () => void;
  onDejar: () => void;
  onCerrar: () => void;
}) {
  const repartir = useRef<HTMLButtonElement>(null);
  return (
    <Modal titulo="¿Repartir en 12 meses?" onCerrar={onCerrar} foco={repartir}>
      <ul className="flex flex-col gap-2 text-sm">
        {lineas.map((l, i) => (
          <Aviso key={i}>
            <strong>{l.tipo}</strong> {formatMoney(l.monto)} es un gasto grande de un solo mes.{' '}
            <span className="text-foreground-muted">En 12 meses: {formatMoney(Number(cuotaDe(l.monto, 12, 1)))} por mes.</span>
          </Aviso>
        ))}
      </ul>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCerrar} disabled={enviando}>
          Revisar
        </Button>
        <Button variant="secondary" onClick={onDejar} loading={enviando} loadingText="Guardando...">
          Dejar en este mes
        </Button>
        <Button ref={repartir} onClick={onRepartir} disabled={enviando}>
          Repartir en 12
        </Button>
      </div>
    </Modal>
  );
}
