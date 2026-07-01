'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { z } from 'zod';
import {
  createMilkReceptionInputSchema,
  type CreateMilkReceptionInput,
} from '@lasmarias/shared-schemas';

// El input datetime-local devuelve "YYYY-MM-DDTHH:mm" sin offset, lo que no matchea
// con isoDateTimeSchema. Usamos un schema relajado para el form y convertimos a ISO
// con offset local en el submit.
const formSchema = createMilkReceptionInputSchema.extend({
  receivedAt: z.string().min(1, 'Ingresá la fecha y hora'),
});
type FormValues = z.infer<typeof formSchema>;
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { receptionsApi, producersApi } from '@/features/receptions/api';
import { inventoryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { evaluateQuality } from '@/lib/milk-quality';
import { cn } from '@/lib/utils';

// Pantalla de nueva recepción. CLAUDE.md §5.3:
// - Una columna en mobile, dos en desktop.
// - Labels arriba, inputs grandes (44px+).
// - Validación en blur (mode: onBlur).
// - Sticky save bar abajo en formularios largos.
// - Una sola acción primaria (Guardar).

function nowLocalInput(): string {
  const d = new Date();
  // YYYY-MM-DDTHH:mm para datetime-local
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export default function NewReceptionPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [savedCode, setSavedCode] = useState<string | null>(null);

  const producersQuery = useQuery({
    queryKey: ['producers'],
    queryFn: () => producersApi.list(),
  });

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => inventoryApi.listWarehouses(),
  });
  // Niveles de los silos (capacidad + litros actuales) para validar cuánto entra.
  const silosQuery = useQuery({ queryKey: ['silos'], queryFn: () => inventoryApi.silos() });

  // Reparto de la descarga en silos (uno o varios). Cada fila: silo + litros.
  const [siloRows, setSiloRows] = useState<{ warehouseId: string; liters: string }[]>([
    { warehouseId: '', liters: '' },
  ]);

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
    defaultValues: {
      receivedAt: '',
      // Una descarga puede traer leche de hasta 4 tambos (pedido #17).
      producers: [{ producerId: '', liters: undefined as unknown as number, declaredLiters: undefined }],
      // La leche normalmente pasa la prueba de alcohol; el operario la desmarca sólo si falló.
      // Evita bloquear toda recepción por defecto (el back trata false como rechazo).
      quality: { alcoholTestPassed: true },
    },
  });
  const producerLines = useFieldArray({ control, name: 'producers' });

  const mutation = useMutation({
    mutationFn: (input: CreateMilkReceptionInput) => receptionsApi.create(input),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      if (r.status === 'aceptada') {
        // Confirmación visual fuerte para planta (CLAUDE.md §5.4): check verde a pantalla
        // completa con el SIGUIENTE PASO a mano (no se vuelve solo a la lista muda).
        setSavedCode(r.code);
      } else {
        toast.warning(`Recepción ${r.code} quedó bloqueada: ${r.blockedReason}`);
        router.push('/recepciones');
      }
    },
    onError: (err) => {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('No se pudo guardar la recepción. Probá de nuevo.');
    },
  });

  const producerOptions = useMemo(() => producersQuery.data ?? [], [producersQuery.data]);
  // La leche va a un SILO (CLAUDE.md §9). Si hay silos definidos, el destino se limita a
  // ellos; si todavía no se crearon, dejamos todas las ubicaciones para no bloquear la carga.
  const allWarehouses = useMemo(() => warehousesQuery.data ?? [], [warehousesQuery.data]);
  const silos = useMemo(() => allWarehouses.filter((w) => w.kind === 'silo'), [allWarehouses]);
  const warehouseOptions = silos.length > 0 ? silos : allWarehouses;

  const defaultDateTime = useMemo(() => nowLocalInput(), []);

  // Evaluación de calidad EN VIVO: avisa antes de guardar si la recepción se bloqueará.
  const quality = watch('quality');
  const qualityIssues = evaluateQuality(quality ?? {});
  const hasQualityData = !!quality && Object.values(quality).some((v) => v !== undefined && v !== null);

  // Totales y diferencia de litros EN VIVO, sumando todos los tambos de la descarga.
  const litersDiffTolerance = 5; // L: hasta acá lo tratamos como diferencia menor (ámbar), más es rojo.
  const watchedProducers = watch('producers');
  const totalLiters = (watchedProducers ?? []).reduce(
    (a, p) => a + (typeof p?.liters === 'number' && !Number.isNaN(p.liters) ? p.liters : 0),
    0,
  );
  const totalDeclared = (watchedProducers ?? []).reduce(
    (a, p) => a + (typeof p?.declaredLiters === 'number' && !Number.isNaN(p.declaredLiters) ? p.declaredLiters : 0),
    0,
  );
  const anyDeclared = (watchedProducers ?? []).some((p) => typeof p?.declaredLiters === 'number' && !Number.isNaN(p.declaredLiters));
  const litersDiff = anyDeclared && totalLiters > 0 ? totalLiters - totalDeclared : null;

  // --- Reparto en silos: capacidad disponible + validación ---
  const usingSilos = silos.length > 0;
  const siloLevels = useMemo(
    () => new Map((silosQuery.data?.silos ?? []).map((s) => [s.id, s])),
    [silosQuery.data],
  );
  // Litros disponibles de un silo = capacidad − nivel actual (Infinity si no tiene capacidad).
  const availableOf = (warehouseId: string): number => {
    const s = siloLevels.get(warehouseId);
    if (!s || !(s.capacityLiters > 0)) return Infinity;
    return Math.round((s.capacityLiters - s.currentLiters) * 10) / 10;
  };
  const assignedLiters = siloRows.reduce((a, r) => a + (Number(r.liters) > 0 ? Number(r.liters) : 0), 0);
  const unassignedLiters = Math.round((totalLiters - assignedLiters) * 10) / 10;
  // ¿Alguna fila excede la capacidad de su silo?
  const overCapacityRow = siloRows.find(
    (r) => r.warehouseId && Number(r.liters) > 0 && Number(r.liters) > availableOf(r.warehouseId) + 1e-6,
  );
  const silosValid =
    !usingSilos ||
    (totalLiters > 0 &&
      unassignedLiters === 0 &&
      siloRows.every((r) => r.warehouseId && Number(r.liters) > 0) &&
      !overCapacityRow);
  const availableSilos = silosQuery.data?.silos ?? [];

  return (
    <div className="flex flex-col gap-6">
      {savedCode && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-primary-600 px-6 text-center text-white">
          <CheckCircle2 className="h-24 w-24" aria-hidden="true" />
          <p className="font-display text-3xl font-semibold">¡Recepción guardada!</p>
          <p className="text-lg text-primary-100">Lote {savedCode}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => router.push('/produccion/nueva')}>
              Abrir producción con esta leche
            </Button>
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => router.push('/recepciones')}>
              Ver recepciones
            </Button>
          </div>
        </div>
      )}
      <PageHeader
        title="Nueva recepción de leche"
        description="Cargá los datos de este ingreso. El sistema genera el código de lote automáticamente."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/recepciones">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver
            </Link>
          </Button>
        }
      />

      <form
        id="new-reception-form"
        onSubmit={handleSubmit((v) => {
          const input: CreateMilkReceptionInput = {
            ...v,
            // datetime-local llega como string sin TZ; convertimos a ISO con offset local.
            receivedAt: new Date(v.receivedAt).toISOString(),
            // Con silos definidos, mandamos el reparto (uno o varios). Si no, queda el
            // warehouseId único (cámara) del form.
            ...(usingSilos
              ? {
                  silos: siloRows
                    .filter((r) => r.warehouseId && Number(r.liters) > 0)
                    .map((r) => ({ warehouseId: r.warehouseId, liters: Number(r.liters) })),
                  warehouseId: undefined,
                }
              : {}),
          };
          return mutation.mutateAsync(input);
        })}
        noValidate
        className="flex flex-col gap-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Datos del ingreso</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Fecha y hora" htmlFor="receivedAt" required error={errors.receivedAt?.message}>
              <Input
                type="datetime-local"
                defaultValue={defaultDateTime}
                {...register('receivedAt')}
              />
            </Field>

            {!usingSilos && (
              <Field
                label="Cámara / sector destino"
                htmlFor="warehouseId"
                error={errors.warehouseId?.message}
                hint="Opcional — dónde se guarda el lote de leche cruda"
              >
                <select
                  id="warehouseId"
                  className="flex min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                  {...register('warehouseId', { setValueAs: (v) => (v === '' || v == null ? undefined : v) })}
                >
                  <option value="">Sin asignar</option>
                  {warehouseOptions.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="N° de remito" htmlFor="remito" error={errors.remito?.message}>
              <Input placeholder="Ej: 0001-00012345" {...register('remito')} />
            </Field>

          </CardContent>
        </Card>

        {/* Tambos de la descarga: hasta 4, cada uno con sus litros (pedido #17). */}
        <Card>
          <CardHeader>
            <CardTitle>Tambos de la descarga</CardTitle>
            <p className="text-sm text-foreground-muted">
              Un camión puede traer leche de varios tambos. Cargá los litros de cada uno para poder pagarles por separado.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-3">
              {producerLines.fields.map((row, idx) => (
                <div key={row.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,140px,140px,auto] sm:items-end">
                  <Field label={idx === 0 ? 'Tambo' : ''} htmlFor={`prod-${idx}`} required error={errors.producers?.[idx]?.producerId?.message}>
                    <select
                      id={`prod-${idx}`}
                      className="flex min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                      {...register(`producers.${idx}.producerId` as const)}
                    >
                      <option value="">Elegí un tambo</option>
                      {producerOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={idx === 0 ? 'Declarados (remito)' : ''} htmlFor={`decl-${idx}`} error={errors.producers?.[idx]?.declaredLiters?.message}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={0}
                      suffix="L"
                      placeholder="Ej: 1200"
                      {...register(`producers.${idx}.declaredLiters` as const, { setValueAs: (v) => (v === '' || Number.isNaN(Number(v)) ? undefined : Number(v)) })}
                    />
                  </Field>
                  <Field label={idx === 0 ? 'Recibidos' : ''} htmlFor={`lit-${idx}`} required error={errors.producers?.[idx]?.liters?.message}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={0}
                      suffix="L"
                      placeholder="Ej: 1200"
                      {...register(`producers.${idx}.liters` as const, { valueAsNumber: true })}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={() => (producerLines.fields.length > 1 ? producerLines.remove(idx) : null)}
                    disabled={producerLines.fields.length <= 1}
                    aria-label="Quitar tambo"
                    className="flex min-h-touch min-w-touch items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>

            {producerLines.fields.length < 4 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => producerLines.append({ producerId: '', liters: undefined as unknown as number, declaredLiters: undefined })}
              >
                <Plus className="h-4 w-4" /> Agregar tambo
              </Button>
            )}

            {/* Totales + diferencia de litros EN VIVO (CLAUDE.md §5.1). */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-subtle/40 px-4 py-3">
              <p className="text-sm">
                <span className="text-foreground-muted">Total recibido: </span>
                <span className="font-semibold text-foreground">{totalLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L</span>
              </p>
              {litersDiff !== null && (
                <p
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-semibold',
                    litersDiff === 0 && 'text-foreground-muted',
                    litersDiff !== 0 && Math.abs(litersDiff) <= litersDiffTolerance && 'text-amber-600',
                    Math.abs(litersDiff) > litersDiffTolerance && 'text-red-600',
                  )}
                >
                  {litersDiff !== 0 && <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
                  Diferencia: {litersDiff > 0 ? '+' : ''}{litersDiff.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L
                  <span className="font-normal text-foreground-muted">{litersDiff === 0 ? '(coincide con el remito)' : '(recibido − declarado)'}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {usingSilos && (
          <Card>
            <CardHeader>
              <CardTitle>Destino en silos</CardTitle>
              <p className="text-sm text-foreground-muted">
                Repartí los <span className="font-medium text-foreground">{totalLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L</span> recibidos en uno o más silos. Si no entra todo en uno, sumá otro.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="space-y-3">
                {siloRows.map((row, idx) => {
                  const avail = row.warehouseId ? availableOf(row.warehouseId) : null;
                  const over = !!row.warehouseId && Number(row.liters) > 0 && avail != null && Number(row.liters) > avail + 1e-6;
                  return (
                    <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,160px,auto] sm:items-end">
                      <Field label={idx === 0 ? 'Silo' : ''} htmlFor={`silo-${idx}`}>
                        <select
                          id={`silo-${idx}`}
                          className="flex min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                          value={row.warehouseId}
                          onChange={(e) => setSiloRows((rows) => rows.map((r, i) => (i === idx ? { ...r, warehouseId: e.target.value } : r)))}
                        >
                          <option value="">Elegí un silo</option>
                          {availableSilos.map((s) => (
                            <option key={s.id} value={s.id} disabled={siloRows.some((r, i) => i !== idx && r.warehouseId === s.id)}>
                              {s.name}{s.capacityLiters > 0 ? ` — disponible ${Math.max(0, Math.round((s.capacityLiters - s.currentLiters) * 10) / 10).toLocaleString('es-AR')} L` : ''}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={idx === 0 ? 'Litros a este silo' : ''} htmlFor={`silolit-${idx}`} error={over ? `Supera la capacidad (disponible ${avail} L)` : undefined}>
                        <Input
                          id={`silolit-${idx}`}
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min={0}
                          suffix="L"
                          placeholder="Ej: 20000"
                          className={over ? 'border-red-400 bg-red-50' : ''}
                          value={row.liters}
                          onChange={(e) => setSiloRows((rows) => rows.map((r, i) => (i === idx ? { ...r, liters: e.target.value } : r)))}
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => setSiloRows((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows))}
                        disabled={siloRows.length <= 1}
                        aria-label="Quitar silo"
                        className="flex min-h-touch min-w-touch items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {siloRows.length < availableSilos.length && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSiloRows((rows) => [...rows, { warehouseId: '', liters: '' }])}>
                    <Plus className="h-4 w-4" /> Agregar silo
                  </Button>
                )}
                {unassignedLiters > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSiloRows((rows) => {
                        const lastEmpty = [...rows].reverse().find((r) => !r.liters || Number(r.liters) <= 0);
                        const target = lastEmpty ?? rows[rows.length - 1];
                        return rows.map((r) => (r === target ? { ...r, liters: String(Math.round((Number(r.liters || 0) + unassignedLiters) * 10) / 10) } : r));
                      })
                    }
                  >
                    Asignar los {unassignedLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L que faltan
                  </Button>
                )}
              </div>

              <div
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm',
                  unassignedLiters === 0 && !overCapacityRow
                    ? 'border-border-subtle bg-surface-subtle/40'
                    : 'border-amber-300 bg-amber-50 text-amber-800',
                )}
              >
                <span>
                  Asignado: <span className="font-semibold">{assignedLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L</span> de {totalLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L
                </span>
                {overCapacityRow ? (
                  <span className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Un silo supera su capacidad — sumá otro silo.</span>
                ) : unassignedLiters > 0 ? (
                  <span className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Faltan asignar {unassignedLiters.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L</span>
                ) : unassignedLiters < 0 ? (
                  <span className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> Asignaste de más por {Math.abs(unassignedLiters).toLocaleString('es-AR', { maximumFractionDigits: 1 })} L</span>
                ) : (
                  <span className="text-foreground-muted">Reparto completo ✓</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Análisis de calidad</CardTitle>
            <p className="text-sm text-foreground-muted">
              Si algún valor excede los límites de la planta, la recepción queda bloqueada automáticamente.
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Temperatura (°C)" htmlFor="temperatureCelsius" error={errors.quality?.temperatureCelsius?.message}>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="≤ 6"
                {...register('quality.temperatureCelsius', { setValueAs: (v) => (v === '' || Number.isNaN(Number(v)) ? undefined : Number(v)) })}
              />
            </Field>

            <Field label="pH" htmlFor="ph" error={errors.quality?.ph?.message}>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="6.5 – 6.9"
                {...register('quality.ph', { setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : Number(v)) })}
              />
            </Field>

            <Field label="Acidez (°Dornic)" htmlFor="acidityDornic" error={errors.quality?.acidityDornic?.message}>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="Ej: 16"
                {...register('quality.acidityDornic', { setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : Number(v)) })}
              />
            </Field>

            <Field label="Grasa (%)" htmlFor="fatPercent" error={errors.quality?.fatPercent?.message}>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="Ej: 3.4"
                {...register('quality.fatPercent', { setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : Number(v)) })}
              />
            </Field>

            <Field label="Proteína (%)" htmlFor="proteinPercent" error={errors.quality?.proteinPercent?.message}>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="Ej: 3.2"
                {...register('quality.proteinPercent', { setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : Number(v)) })}
              />
            </Field>

            <Field label="RCS (células/ml)" htmlFor="somaticCellCount" error={errors.quality?.somaticCellCount?.message} hint="Recuento de células somáticas">
              <Input
                type="number"
                inputMode="numeric"
                step={1000}
                placeholder="Ej: 200000"
                {...register('quality.somaticCellCount', { setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : Number(v)) })}
              />
            </Field>

            <Field label="UFC (UFC/ml)" htmlFor="bacterialCount" error={errors.quality?.bacterialCount?.message} hint="Unidades formadoras de colonias">
              <Input
                type="number"
                inputMode="numeric"
                step={1000}
                placeholder="Ej: 50000"
                {...register('quality.bacterialCount', { setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : Number(v)) })}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm sm:col-span-1">
              <input type="checkbox" className="h-5 w-5 rounded border-border" {...register('quality.alcoholTestPassed')} />
              <span>Prueba de alcohol — pasó</span>
            </label>

            <label className="flex items-center gap-2 text-sm sm:col-span-1">
              <input type="checkbox" className="h-5 w-5 rounded border-border" {...register('quality.antibioticsDetected')} />
              <span>Se detectaron antibióticos</span>
            </label>

            {/* Aviso en vivo: el operario sabe ANTES de guardar si quedará bloqueada. */}
            {qualityIssues.length > 0 ? (
              <div className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">Con estos valores, la recepción quedará bloqueada al guardar:</p>
                  <ul className="mt-1 list-inside list-disc text-amber-700">
                    {qualityIssues.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              </div>
            ) : hasQualityData ? (
              <div className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-primary-100 bg-primary-50 p-3 text-sm text-primary-700">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>Calidad dentro de los límites — la recepción se aceptará.</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Notas adicionales" htmlFor="notes" error={errors.notes?.message}>
              <textarea
                id="notes"
                rows={3}
                className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                placeholder="Anotaciones para el lote o para revisión posterior"
                {...register('notes')}
              />
            </Field>
          </CardContent>
        </Card>
      </form>

      {/* Sticky save bar — CLAUDE.md §5.3 */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-border-subtle bg-surface-elevated/95 backdrop-blur sm:-mx-6">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="hidden text-sm text-foreground-muted sm:block">
            {isValid && silosValid ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                Listo para guardar
              </span>
            ) : !silosValid ? (
              'Repartí toda la leche en silos con capacidad para guardar.'
            ) : (
              'Completá los datos requeridos para guardar.'
            )}
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button type="button" variant="ghost" size="md" asChild>
              <Link href="/recepciones">Cancelar</Link>
            </Button>
            <Button
              type="submit"
              form="new-reception-form"
              size="md"
              block
              disabled={!silosValid}
              loading={isSubmitting || mutation.isPending}
              loadingText="Guardando..."
            >
              Guardar recepción
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
