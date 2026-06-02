'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Building2, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { settingsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

// Configuración editable por el admin (CLAUDE.md §4.10): datos de la empresa para el
// remito y límites de calidad de la leche (umbrales de bloqueo de recepciones).

export default function ConfigPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => settingsApi.get() });

  // --- Datos de la empresa ---
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  // --- Límites de calidad ---
  const [maxTemp, setMaxTemp] = useState('');
  const [minPh, setMinPh] = useState('');
  const [maxPh, setMaxPh] = useState('');
  const [maxScc, setMaxScc] = useState('');
  const [maxBact, setMaxBact] = useState('');

  // Al llegar la config, sembramos los formularios.
  useEffect(() => {
    const d = settingsQuery.data;
    if (!d) return;
    setName(d.company.name ?? '');
    setTaxId(d.company.taxId ?? '');
    setCity(d.company.city ?? '');
    setAddress(d.company.address ?? '');
    setPhone(d.company.phone ?? '');
    setMaxTemp(String(d.qualityLimits.maxTemperatureCelsius));
    setMinPh(String(d.qualityLimits.minPh));
    setMaxPh(String(d.qualityLimits.maxPh));
    setMaxScc(String(d.qualityLimits.maxSomaticCellCount));
    setMaxBact(String(d.qualityLimits.maxBacterialCount));
  }, [settingsQuery.data]);

  const saveCompany = useMutation({
    mutationFn: () =>
      settingsApi.updateCompany({
        name: name.trim(),
        taxId: taxId.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Datos de la empresa guardados.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });

  const saveLimits = useMutation({
    mutationFn: () =>
      settingsApi.updateQualityLimits({
        maxTemperatureCelsius: Number(maxTemp),
        minPh: Number(minPh),
        maxPh: Number(maxPh),
        maxSomaticCellCount: Math.round(Number(maxScc)),
        maxBacterialCount: Math.round(Number(maxBact)),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Límites de calidad guardados.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });

  const companyOk = name.trim().length > 0;
  const phValid = Number(minPh) > 0 && Number(maxPh) > 0 && Number(minPh) < Number(maxPh);
  const limitsOk =
    Number(maxTemp) > 0 && phValid && Number(maxScc) > 0 && Number(maxBact) > 0;

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/admin"><ArrowLeft className="h-4 w-4" /> Datos maestros</Link>
      </Button>
      <PageHeader
        title="Configuración"
        description="Los datos de tu empresa (salen en el remito) y los límites de calidad que bloquean una recepción de leche."
      />

      {settingsQuery.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          {/* Datos de la empresa */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary-700" aria-hidden="true" /> Datos de la empresa
              </CardTitle>
              <p className="text-sm text-foreground-muted">Aparecen en el encabezado del remito que entregás al cliente.</p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nombre / Razón social" htmlFor="cfg-name" required>
                <Input id="cfg-name" autoFocus placeholder="Lácteos Las Marías" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="CUIT" htmlFor="cfg-taxid">
                <Input id="cfg-taxid" placeholder="30-12345678-9" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              </Field>
              <Field label="Dirección" htmlFor="cfg-address" className="sm:col-span-2">
                <Input id="cfg-address" placeholder="Ruta 8 km 220" value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
              <Field label="Localidad" htmlFor="cfg-city">
                <Input id="cfg-city" placeholder="Pergamino, Buenos Aires" value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="Teléfono" htmlFor="cfg-phone">
                <Input id="cfg-phone" placeholder="02477 12-3456" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button onClick={() => saveCompany.mutate()} loading={saveCompany.isPending} loadingText="Guardando..." disabled={!companyOk || saveCompany.isPending}>
                  Guardar datos de la empresa
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Límites de calidad */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary-700" aria-hidden="true" /> Límites de calidad de la leche
              </CardTitle>
              <p className="text-sm text-foreground-muted">
                Si una recepción supera estos valores, queda <span className="font-medium">bloqueada</span> automáticamente. (Los antibióticos y la prueba de alcohol siempre bloquean.)
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Temperatura máxima (°C)" htmlFor="cfg-temp" hint="La leche debe llegar fría.">
                <Input id="cfg-temp" type="number" inputMode="decimal" step="0.1" suffix="°C" value={maxTemp} onChange={(e) => setMaxTemp(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="pH mínimo" htmlFor="cfg-minph" error={!phValid && minPh && maxPh ? 'Debe ser menor al máximo' : undefined}>
                  <Input id="cfg-minph" type="number" inputMode="decimal" step="0.01" value={minPh} onChange={(e) => setMinPh(e.target.value)} />
                </Field>
                <Field label="pH máximo" htmlFor="cfg-maxph">
                  <Input id="cfg-maxph" type="number" inputMode="decimal" step="0.01" value={maxPh} onChange={(e) => setMaxPh(e.target.value)} />
                </Field>
              </div>
              <Field label="RCS máximo (células/ml)" htmlFor="cfg-scc" hint="Recuento de células somáticas.">
                <Input id="cfg-scc" type="number" inputMode="numeric" step={1000} placeholder="400000" value={maxScc} onChange={(e) => setMaxScc(e.target.value)} />
              </Field>
              <Field label="UFC máximo (UFC/ml)" htmlFor="cfg-bact" hint="Unidades formadoras de colonias.">
                <Input id="cfg-bact" type="number" inputMode="numeric" step={1000} placeholder="100000" value={maxBact} onChange={(e) => setMaxBact(e.target.value)} />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <Button onClick={() => saveLimits.mutate()} loading={saveLimits.isPending} loadingText="Guardando..." disabled={!limitsOk || saveLimits.isPending}>
                  Guardar límites de calidad
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
