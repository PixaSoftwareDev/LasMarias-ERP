'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { exchangeRatesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatMoney, formatDate } from '@/lib/utils';
import type { ExchangeRate } from '@lasmarias/shared-schemas';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Cotización del día (CLAUDE.md §6 nuevo): carga manual del dólar/euro por fecha.
// Si un día no tiene cotización, el sistema usa la última vigente.
export default function CotizacionPage() {
  const queryClient = useQueryClient();
  const ratesQuery = useQuery({ queryKey: ['exchange-rates'], queryFn: () => exchangeRatesApi.list() });

  const [date, setDate] = useState(todayKey());
  const [usd, setUsd] = useState('');
  const [eur, setEur] = useState('');

  const save = useMutation({
    mutationFn: () => exchangeRatesApi.upsert({ date, usd: Number(usd), eur: Number(eur) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
      queryClient.invalidateQueries({ queryKey: ['exchange-rate-latest'] });
      toast.success('Cotización guardada.');
      setUsd('');
      setEur('');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });

  const canSave = !!date && Number(usd) > 0 && Number(eur) > 0 && !save.isPending;
  const rows = ratesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/admin"><ArrowLeft className="h-4 w-4" /> Datos maestros</Link>
      </Button>
      <PageHeader
        title="Cotización del día"
        description="Cargá cuánto vale el dólar y el euro en pesos. Se usa para convertir los precios cargados en moneda extranjera. Si un día no cargás, se usa la última cotización."
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary-700" aria-hidden="true" /> Cargar cotización</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Fecha" htmlFor="cot-date" required>
            <Input id="cot-date" type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Dólar (USD)" htmlFor="cot-usd" required hint="Pesos por 1 dólar">
            <Input id="cot-usd" type="number" inputMode="decimal" step="0.01" min={0} prefix="$" placeholder="Ej: 1000" value={usd} onChange={(e) => setUsd(e.target.value)} />
          </Field>
          <Field label="Euro (EUR)" htmlFor="cot-eur" required hint="Pesos por 1 euro">
            <Input id="cot-eur" type="number" inputMode="decimal" step="0.01" min={0} prefix="$" placeholder="Ej: 1100" value={eur} onChange={(e) => setEur(e.target.value)} />
          </Field>
          <div className="flex justify-end sm:col-span-3">
            <Button onClick={() => save.mutate()} loading={save.isPending} loadingText="Guardando..." disabled={!canSave}>
              Guardar cotización
            </Button>
          </div>
        </CardContent>
      </Card>

      {ratesQuery.isLoading ? (
        <TableSkeleton />
      ) : (
        <DataTable
          data={rows}
          getKey={(r) => r.date}
          emptyIcon={DollarSign}
          emptyTitle="Todavía no cargaste cotizaciones"
          emptyDescription="Cargá el dólar y el euro del día para poder usar precios en moneda extranjera."
          columns={[
            { key: 'date', header: 'Fecha', primary: true, render: (r: ExchangeRate) => formatDate(r.date), sortValue: (r: ExchangeRate) => r.date },
            { key: 'usd', header: 'Dólar', align: 'right', render: (r: ExchangeRate) => formatMoney(r.usd), sortValue: (r: ExchangeRate) => r.usd },
            { key: 'eur', header: 'Euro', align: 'right', render: (r: ExchangeRate) => formatMoney(r.eur), sortValue: (r: ExchangeRate) => r.eur },
          ]}
        />
      )}
    </div>
  );
}
