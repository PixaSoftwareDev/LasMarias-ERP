'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
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

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
    defaultValues: {
      receivedAt: '',
      producerId: '',
      liters: undefined as unknown as number,
      // La leche normalmente pasa la prueba de alcohol; el operario la desmarca sólo si falló.
      // Evita bloquear toda recepción por defecto (el back trata false como rechazo).
      quality: { alcoholTestPassed: true },
    },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateMilkReceptionInput) => receptionsApi.create(input),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      if (r.status === 'aceptada') {
        // Confirmación visual fuerte para planta (CLAUDE.md §5.4): check verde a pantalla completa.
        setSavedCode(r.code);
        setTimeout(() => router.push('/recepciones'), 1300);
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
  const warehouseOptions = useMemo(() => warehousesQuery.data ?? [], [warehousesQuery.data]);

  const defaultDateTime = useMemo(() => nowLocalInput(), []);

  // Evaluación de calidad EN VIVO: avisa antes de guardar si la recepción se bloqueará.
  const quality = watch('quality');
  const qualityIssues = evaluateQuality(quality ?? {});
  const hasQualityData = !!quality && Object.values(quality).some((v) => v !== undefined && v !== null);

  // Diferencia de litros EN VIVO: recibidos − declarados (sólo cuando ambos están cargados).
  const litersDiffTolerance = 5; // L: hasta acá lo tratamos como diferencia menor (ámbar), más es rojo.
  const watchedLiters = watch('liters');
  const watchedDeclared = watch('declaredLiters');
  const litersDiff =
    typeof watchedLiters === 'number' &&
    !Number.isNaN(watchedLiters) &&
    typeof watchedDeclared === 'number' &&
    !Number.isNaN(watchedDeclared)
      ? watchedLiters - watchedDeclared
      : null;

  return (
    <div className="flex flex-col gap-6 pb-32">
      {savedCode && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-primary-600 px-6 text-center text-white">
          <CheckCircle2 className="h-24 w-24" aria-hidden="true" />
          <p className="font-display text-3xl font-semibold">¡Recepción guardada!</p>
          <p className="text-lg text-primary-100">Lote {savedCode}</p>
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
            liters: Number(v.liters),
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

            <Field
              label="Productor"
              htmlFor="producerId"
              required
              error={errors.producerId?.message}
              hint={producersQuery.isLoading ? 'Cargando productores...' : undefined}
            >
              <select
                id="producerId"
                className="flex min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                {...register('producerId')}
              >
                <option value="">Elegí un productor</option>
                {producerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

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

            <Field label="N° de remito" htmlFor="remito" error={errors.remito?.message}>
              <Input placeholder="Ej: 0001-00012345" {...register('remito')} />
            </Field>

            <Field
              label="Litros declarados (remito)"
              htmlFor="declaredLiters"
              error={errors.declaredLiters?.message}
              hint="Lo que dice el papel del transporte"
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                suffix="L"
                placeholder="Ej: 1200"
                {...register('declaredLiters', { setValueAs: (v) => (v === '' || Number.isNaN(Number(v)) ? undefined : Number(v)) })}
              />
            </Field>

            <Field label="Litros recibidos" htmlFor="liters" required error={errors.liters?.message}>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                suffix="L"
                placeholder="Ej: 1200"
                {...register('liters', { valueAsNumber: true })}
              />
            </Field>

            {/* Diferencia de litros EN VIVO (CLAUDE.md §5.1 — avisar antes de guardar). */}
            <div className="flex flex-col justify-end">
              <p className="mb-1.5 text-sm font-medium text-foreground">Diferencia de litros</p>
              {litersDiff === null ? (
                <p className="flex min-h-touch items-center text-sm text-foreground-muted">
                  Cargá litros recibidos y declarados para verla.
                </p>
              ) : (
                <p
                  className={cn(
                    'flex min-h-touch items-center gap-1.5 text-base font-semibold',
                    litersDiff === 0 && 'text-foreground-muted',
                    litersDiff !== 0 && Math.abs(litersDiff) <= litersDiffTolerance && 'text-amber-600',
                    Math.abs(litersDiff) > litersDiffTolerance && 'text-red-600',
                  )}
                >
                  {litersDiff !== 0 && (
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  )}
                  {litersDiff > 0 ? '+' : ''}
                  {litersDiff.toLocaleString('es-AR', { maximumFractionDigits: 1 })} L
                  <span className="text-sm font-normal text-foreground-muted">
                    {litersDiff === 0 ? '(coincide con el remito)' : '(recibido − declarado)'}
                  </span>
                </p>
              )}
            </div>

          </CardContent>
        </Card>

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
                {...register('quality.temperatureCelsius', { valueAsNumber: true, setValueAs: (v) => (v === '' || Number.isNaN(v) ? undefined : Number(v)) })}
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
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface-elevated/95 backdrop-blur md:left-64">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="hidden text-sm text-foreground-muted sm:block">
            {isValid ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                Listo para guardar
              </span>
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
