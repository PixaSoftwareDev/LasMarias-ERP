'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
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
import { ApiError } from '@/lib/api-client';

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

  const producersQuery = useQuery({
    queryKey: ['producers'],
    queryFn: () => producersApi.list(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
    defaultValues: {
      receivedAt: '',
      producerId: '',
      liters: undefined as unknown as number,
      quality: {},
    },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateMilkReceptionInput) => receptionsApi.create(input),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['receptions'] });
      if (r.status === 'aceptada') {
        toast.success(`Recepción ${r.code} cargada correctamente.`);
      } else {
        toast.warning(`Recepción ${r.code} quedó bloqueada: ${r.blockedReason}`);
      }
      router.push('/recepciones');
    },
    onError: (err) => {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error('No se pudo guardar la recepción. Probá de nuevo.');
    },
  });

  const producerOptions = useMemo(() => producersQuery.data ?? [], [producersQuery.data]);

  const defaultDateTime = useMemo(() => nowLocalInput(), []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 pb-32 sm:p-6">
      <PageHeader
        title="Nueva recepción de leche"
        description="Cargá los datos de este ingreso. El sistema genera el código de lote automáticamente."
        breadcrumbs={[
          { href: '/dashboard', label: 'Inicio' },
          { href: '/recepciones', label: 'Recepción de leche' },
          { label: 'Nueva' },
        ]}
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

            <Field label="Litros recibidos" htmlFor="liters" required error={errors.liters?.message}>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={0}
                placeholder="Ej: 1200"
                {...register('liters', { valueAsNumber: true })}
              />
            </Field>

            <Field label="Patente del vehículo" htmlFor="vehiclePlate" error={errors.vehiclePlate?.message}>
              <Input placeholder="AB123CD" {...register('vehiclePlate')} />
            </Field>

            <Field label="Conductor" htmlFor="driverName" error={errors.driverName?.message} className="sm:col-span-2">
              <Input placeholder="Nombre y apellido" {...register('driverName')} />
            </Field>
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
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
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
