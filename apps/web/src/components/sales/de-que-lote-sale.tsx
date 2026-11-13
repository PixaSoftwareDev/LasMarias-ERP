'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, PackageCheck, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { inventoryApi } from '@/features/api';
import { formatDate } from '@/lib/utils';
import {
  filaSugerida,
  resumenReparto,
  type FilaReparto,
  type LoteDisponible,
} from '@lasmarias/shared-schemas';

// De qué lote sale un renglón de venta. Tres formas:
//  - el más viejo primero (automático, y sigue con el siguiente si no alcanza);
//  - un lote elegido (a veces guardan el viejo para madurarlo);
//  - repartido entre varios lotes (pedido del dueño, 12/11/2026): un solo renglón "701 kg,
//    44 bultos" que sale 328 kg / 20 b de un lote y 373 kg / 24 b de otro, así el remito no
//    muestra dos renglones del mismo producto.
// El descuento real lo hace el backend al registrar la venta.

const REPARTIR = '__repartir';
const kg = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 });

export interface CambioLote {
  batchId?: string;
  lotes?: FilaReparto[];
  quantity?: number;
  bultos?: number;
}

interface Props {
  productId: string;
  quantity: number;
  bultos?: number;
  unit: string;
  conBultos: boolean;
  batchId?: string;
  lotes?: FilaReparto[];
  onChange: (cambio: CambioLote) => void;
}

export function DeQueLoteSale({
  productId,
  quantity,
  bultos,
  unit,
  conBultos,
  batchId,
  lotes: filas,
  onChange,
}: Props) {
  // Debounce sobre producto + cantidad: la sugerencia se pide al dejar de tipear.
  const [debounced, setDebounced] = useState<{ productId: string; quantity: number } | null>(null);
  useEffect(() => {
    if (!productId || !(quantity > 0)) {
      setDebounced(null);
      return;
    }
    const t = setTimeout(() => setDebounced({ productId, quantity }), 350);
    return () => clearTimeout(t);
  }, [productId, quantity]);

  const query = useQuery({
    queryKey: ['fefo', debounced?.productId, debounced?.quantity],
    queryFn: () => inventoryApi.fefoSuggestion(debounced!.productId, debounced!.quantity),
    enabled: !!debounced,
    // Al cambiar la cantidad se sigue mostrando lo anterior (no parpadea el reparto mientras se
    // tipea). Si cambió el producto, no: serían lotes de otro producto.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === debounced?.productId ? prev : undefined,
  });

  if (!debounced) return null;
  if (query.isLoading)
    return <p className="text-foreground-subtle mt-2 text-xs">Calculando de qué lote sale…</p>;
  if (query.isError || !query.data) return null;

  const { allocations, shortage } = query.data;
  const lotes = query.data.batches ?? [];
  const fecha = (id: string) => {
    const b = lotes.find((l) => l.batchId === id);
    return b?.expirationDate
      ? `vence ${formatDate(b.expirationDate)}`
      : b?.productionDate
        ? `elaborado ${formatDate(b.productionDate)}`
        : '';
  };
  const etiqueta = (l: LoteDisponible) =>
    [
      l.batchCode,
      fecha(l.batchId),
      `${kg(l.remaining)} ${unit}`,
      l.bultos != null ? `${l.bultos} bultos` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const elegido = batchId ? lotes.find((b) => b.batchId === batchId) : undefined;

  function elegirModo(valor: string) {
    if (valor === REPARTIR) onChange({ batchId: undefined, lotes: [{ batchId: '', quantity: 0 }] });
    else onChange({ batchId: valor || undefined, lotes: undefined });
  }

  return (
    <div className="border-border-subtle bg-surface-subtle/60 mt-2 space-y-1.5 rounded-lg border px-3 py-2.5 text-xs">
      <label className="text-foreground-muted flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wide">
        <span className="flex items-center gap-1.5">
          <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" /> De qué lote sale
        </span>
        {lotes.length > 1 && (
          <select
            aria-label="Elegir de qué lote sale"
            className="min-h-touch border-border bg-surface-elevated text-foreground max-w-full rounded-md border px-2 text-sm font-normal normal-case tracking-normal"
            value={filas ? REPARTIR : (batchId ?? '')}
            onChange={(e) => elegirModo(e.target.value)}
          >
            <option value="">El más viejo primero</option>
            {lotes.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {etiqueta(b)}
              </option>
            ))}
            <option value={REPARTIR}>Repartir entre varios lotes</option>
          </select>
        )}
      </label>

      {filas ? (
        <Reparto
          filas={filas}
          lotes={lotes}
          total={quantity}
          totalBultos={bultos}
          unit={unit}
          conBultos={conBultos}
          etiqueta={etiqueta}
          onChange={(nuevas) => onChange({ lotes: nuevas })}
        />
      ) : batchId ? (
        !elegido ? (
          <Aviso>El lote elegido ya no tiene stock. Elegí otro.</Aviso>
        ) : (
          <>
            {elegido.bultos != null && bultos != null && bultos > elegido.bultos && (
              <Aviso>
                Ese lote figura con {elegido.bultos} bultos y pusiste {bultos}.
              </Aviso>
            )}
            {elegido.remaining < quantity ? (
              <Aviso>
                Ese lote tiene {kg(elegido.remaining)} {unit}. Bajá la cantidad o elegí
                &quot;Repartir entre varios lotes&quot;.
              </Aviso>
            ) : (
              <p className="text-foreground-muted">
                Sale todo del lote{' '}
                <span className="text-foreground font-mono">{elegido.batchCode}</span> (
                {fecha(elegido.batchId)}).
              </p>
            )}
            {(elegido.remaining !== quantity ||
              (elegido.bultos != null && elegido.bultos !== bultos)) && (
              <button
                type="button"
                className="min-h-touch text-primary-700 font-medium underline-offset-2 hover:underline"
                onClick={() =>
                  onChange({ quantity: elegido.remaining, bultos: elegido.bultos ?? bultos })
                }
              >
                Llevar todo el lote ({kg(elegido.remaining)} {unit}
                {elegido.bultos != null ? ` · ${elegido.bultos} bultos` : ''})
              </button>
            )}
          </>
        )
      ) : allocations.length === 0 ? (
        <Aviso>No hay lotes disponibles para este producto.</Aviso>
      ) : (
        allocations.map((a) => (
          <p key={a.batchId} className="text-foreground-muted">
            Se tomará <span className="text-foreground font-medium">{kg(a.take)}</span>
            {' del lote '}
            <span className="text-foreground font-mono">{a.batchCode}</span>
            {fecha(a.batchId) ? <span> ({fecha(a.batchId)})</span> : null}
          </p>
        ))
      )}
      {/* Sobrante: un lote con kg y 0 bultos (ej. 10 kg que quedaron por diferencia de peso).
          "El más viejo" lo toma primero; si ya no existe en la cámara, conviene darlo de baja. */}
      {!batchId &&
        !filas &&
        conBultos &&
        allocations
          .filter((a) => lotes.find((l) => l.batchId === a.batchId)?.bultos === 0)
          .map((a) => (
            <Aviso key={a.batchId}>
              El lote {a.batchCode} tiene{' '}
              {kg(lotes.find((l) => l.batchId === a.batchId)!.remaining)} {unit} pero 0 bultos:
              puede ser un sobrante. Si ya no está en la cámara, dalo de baja en Stock.
            </Aviso>
          ))}
      {!batchId && !filas && shortage > 0 && (
        <Aviso>Faltan {kg(shortage)} sin stock disponible.</Aviso>
      )}
    </div>
  );
}

// Filas "lote + kg + bultos" con el resumen de lo que falta repartir.
function Reparto({
  filas,
  lotes,
  total,
  totalBultos,
  unit,
  conBultos,
  etiqueta,
  onChange,
}: {
  filas: FilaReparto[];
  lotes: LoteDisponible[];
  total: number;
  totalBultos?: number;
  unit: string;
  conBultos: boolean;
  etiqueta: (l: LoteDisponible) => string;
  onChange: (filas: FilaReparto[]) => void;
}) {
  const resumen = resumenReparto(total, totalBultos, filas, lotes, unit);
  const cambiar = (idx: number, cambio: Partial<FilaReparto>) =>
    onChange(filas.map((f, i) => (i === idx ? { ...f, ...cambio } : f)));

  function elegirLote(idx: number, id: string) {
    const lote = lotes.find((l) => l.batchId === id);
    const sugerida = lote ? filaSugerida(total, totalBultos, filas, idx, lote) : null;
    cambiar(idx, { batchId: id, ...sugerida });
  }

  return (
    <div className="space-y-2">
      {filas.map((f, idx) => (
        // Celular: el lote ocupa todo el ancho y abajo van kg, bultos y quitar. Escritorio: una fila.
        <div key={idx} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <select
            aria-label={`Lote ${idx + 1}`}
            className="min-h-touch border-border bg-surface-elevated text-foreground w-full min-w-0 rounded-md border px-2 text-sm sm:w-auto sm:flex-1"
            value={f.batchId}
            onChange={(e) => elegirLote(idx, e.target.value)}
          >
            <option value="">Elegí el lote</option>
            {lotes
              .filter((l) => l.batchId === f.batchId || !filas.some((o) => o.batchId === l.batchId))
              .map((l) => (
                <option key={l.batchId} value={l.batchId}>
                  {etiqueta(l)}
                </option>
              ))}
          </select>
          <div className="min-w-0 flex-1 sm:w-32 sm:flex-none">
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              aria-label={`Cantidad del lote ${idx + 1}`}
              suffix={unit || undefined}
              placeholder="0"
              value={f.quantity || ''}
              onChange={(e) => cambiar(idx, { quantity: Number(e.target.value) })}
            />
          </div>
          {conBultos && (
            <div className="min-w-0 flex-1 sm:w-32 sm:flex-none">
              <Input
                type="number"
                inputMode="numeric"
                step="1"
                min={0}
                aria-label={`Bultos del lote ${idx + 1}`}
                suffix="bultos"
                placeholder="0"
                value={f.bultos ?? ''}
                onChange={(e) =>
                  cambiar(idx, {
                    bultos: e.target.value === '' ? undefined : Math.round(Number(e.target.value)),
                  })
                }
              />
            </div>
          )}
          <button
            type="button"
            aria-label={`Quitar el lote ${idx + 1}`}
            disabled={filas.length === 1}
            onClick={() => onChange(filas.filter((_, i) => i !== idx))}
            className="min-h-touch min-w-touch text-foreground-muted disabled:hover:text-foreground-muted flex items-center justify-center rounded-md transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      {filas.length < lotes.length && (
        <button
          type="button"
          className="min-h-touch text-primary-700 flex items-center gap-1.5 font-medium hover:underline"
          onClick={() => onChange([...filas, { batchId: '', quantity: 0 }])}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Agregar otro lote
        </button>
      )}
      {resumen.errores.length === 0 ? (
        <p className="flex items-center gap-1.5 font-medium text-emerald-700">
          <CircleCheck className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          Repartido: {kg(resumen.kg)} {unit}
          {resumen.bultos != null ? ` · ${resumen.bultos} bultos` : ''}
        </p>
      ) : (
        <>
          <p className="text-foreground-muted">
            Llevás <span className="text-foreground font-medium">{kg(resumen.kg)}</span> de{' '}
            {kg(total)} {unit}
            {resumen.bultos != null && totalBultos != null
              ? ` · ${resumen.bultos} de ${totalBultos} bultos`
              : ''}
          </p>
          {resumen.errores.map((e) => (
            <Aviso key={e}>{e}</Aviso>
          ))}
        </>
      )}
      {resumen.avisos.map((a) => (
        <Aviso key={a}>{a}</Aviso>
      ))}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 font-medium text-amber-700">
      <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}
