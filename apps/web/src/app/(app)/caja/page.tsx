'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, Download, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PageHeader } from '@/components/page-header';
import { financeApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/hooks/use-confirm';
import { formatMoney as money, formatSignedMoney as signedMoney, formatDate as dateFmt } from '@/lib/utils';
import { TableSkeleton, ChipsSkeleton } from '@/components/ui/skeleton';
import type { CashMovement, ReportGranularity } from '@lasmarias/shared-schemas';

// CLAUDE.md §4.7 — Flujo de caja simple. Los cobros de clientes entran como
// ingresos (los genera el backend); acá se cargan gastos a mano. Roles admin/gerente.

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Rango por defecto: del primer día del mes a HOY (inclusive).
function monthDefaults() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmtDay(first), to: fmtDay(now) };
}

// El backend recibe `to` como instante; si mandamos la fecha "pelada" (medianoche)
// quedan afuera los movimientos del propio día. Mandamos el día completo hasta el
// último segundo para que HOY entre en el rango.
const toEndOfDay = (day: string) => `${day}T23:59:59.999`;

// Chip compacto (mismo lenguaje que el Home): ícono en cuadro con tono semántico
// + label en mayúsculas chico + número grande en font-display. CLAUDE.md §5.3.
const CHIP_TONE = {
  income: { value: 'text-primary-700', icon: 'bg-primary-50 text-primary-700' },
  expense: { value: 'text-danger', icon: 'bg-red-50 text-danger' },
  net: { value: 'text-foreground', icon: 'bg-secondary-50 text-secondary-700' },
  'net-negative': { value: 'text-danger', icon: 'bg-red-50 text-danger' },
} as const;

function KpiChip({
  label,
  value,
  tone,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  tone: keyof typeof CHIP_TONE;
  icon: typeof TrendingUp;
  hint?: string;
}) {
  const t = CHIP_TONE[tone];
  return (
    <div title={hint} className="flex flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${t.icon}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">{label}</span>
        <span className={`block font-display text-xl font-bold tracking-tight ${t.value}`}>{value}</span>
      </span>
    </div>
  );
}

// Form para cargar un gasto (kind=expense). Categoría + monto + fecha + notas.
function ExpenseForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: () =>
      financeApi.createCashMovement({
        kind: 'expense',
        amount: Number(amount),
        category: category.trim(),
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
      toast.success(`Gasto de ${money(m.amount)} cargado.`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cargar el gasto. Probá de nuevo.'),
  });

  const canSave = Number(amount) > 0 && category.trim().length > 0 && !create.isPending;

  async function handleCreate() {
    const ok = await confirm({
      title: 'Confirmar gasto',
      message: `Vas a cargar un gasto de ${money(Number(amount))} en "${category.trim()}". Va a figurar como egreso en el flujo de caja.`,
      confirmLabel: 'Cargar gasto',
    });
    if (ok) create.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cargar un gasto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Categoría" htmlFor="exp-category" required hint="Insumos, sueldos, servicios…">
            <Input
              id="exp-category"
              autoFocus
              placeholder="Insumos"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </Field>
          <Field label="Monto" htmlFor="exp-amount" required>
            <Input
              id="exp-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              prefix="$"
              placeholder="Ej: 12000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSave) { e.preventDefault(); handleCreate(); } }}
            />
          </Field>
          <Field label="Fecha" htmlFor="exp-date">
            <Input id="exp-date" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Notas" htmlFor="exp-notes" hint="Opcional.">
          <Input id="exp-notes" placeholder="Detalle del gasto" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} loading={create.isPending} loadingText="Guardando..." disabled={!canSave}>
            <Plus className="h-4 w-4" /> Cargar gasto
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CajaPage() {
  const defaults = useMemo(monthDefaults, []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [granularity, setGranularity] = useState<ReportGranularity>('day');
  const [showForm, setShowForm] = useState(false);

  const validRange = !!from && !!to && from <= to;

  const flowQuery = useQuery({
    queryKey: ['cash-flow', from, to, granularity],
    queryFn: () => financeApi.cashFlow(from, toEndOfDay(to), granularity),
    enabled: validRange,
  });
  const movementsQuery = useQuery({
    queryKey: ['cash-movements', from, to],
    queryFn: () => financeApi.cashMovements(from, toEndOfDay(to)),
    enabled: validRange,
  });

  const exportCsv = useMutation({
    mutationFn: () => financeApi.exportCashFlowXlsx(from, toEndOfDay(to), granularity),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo exportar. Probá de nuevo.'),
  });

  const flow = flowQuery.data;
  const movements = movementsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Flujo de caja"
        description="Ingresos (cobros) y egresos (gastos) del período elegido."        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Cargar gasto'}
          </Button>
        }
      />

      {/* Rango + granularidad. */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Field
              label="Desde"
              htmlFor="from"
              className="w-full sm:w-52"
              error={validRange ? undefined : 'Revisá las fechas: "desde" no puede ser mayor que "hasta".'}
            >
              <Input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-full" />
            </Field>
            <Field label="Hasta" htmlFor="to" className="w-full sm:w-52">
              <Input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-full" />
            </Field>
          </div>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-foreground">Agrupar</span>
            <SegmentedControl
              label="Agrupar caja"
              value={granularity}
              onChange={setGranularity}
              options={[
                { value: 'day', label: 'Por día' },
                { value: 'month', label: 'Por mes' },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {showForm && <ExpenseForm onDone={() => setShowForm(false)} />}

      {!validRange ? (
        <EmptyState icon={Banknote} title="Elegí un rango de fechas válido" description='La fecha "desde" debe ser anterior o igual a "hasta".' />
      ) : flowQuery.isLoading ? (
        <ChipsSkeleton count={3} />
      ) : flowQuery.isError || !flow ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-danger">
            No se pudo cargar el flujo de caja. Probá de nuevo en un momento.
          </CardContent>
        </Card>
      ) : (
        <>
          <section aria-label="Resumen" className="flex flex-wrap gap-3">
            <KpiChip label="Ingresos" value={money(flow.totalIncome)} tone="income" icon={TrendingUp} hint="Total de cobros recibidos en el período elegido." />
            <KpiChip label="Egresos" value={money(flow.totalExpense)} tone="expense" icon={TrendingDown} hint="Total de gastos cargados en el período elegido." />
            <KpiChip
              label="Neto"
              value={signedMoney(flow.net)}
              tone={flow.net < 0 ? 'net-negative' : 'net'}
              icon={Banknote}
              hint="Ingresos menos egresos. En rojo si gastaste más de lo que cobraste."
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">Movimientos</h2>
              <Button
                variant="secondary"
                onClick={() => exportCsv.mutate()}
                loading={exportCsv.isPending}
                loadingText="Generando..."
              >
                <Download className="h-4 w-4" /> Exportar Excel
              </Button>
            </div>
            {movementsQuery.isLoading ? (
              <TableSkeleton />
            ) : movements.length === 0 ? (
              <EmptyState
                icon={Banknote}
                title="No hay movimientos en este período"
                description="Los cobros de clientes aparecen como ingresos. Cargá un gasto o ampliá el rango de fechas."
              />
            ) : (
              <DataTable
                data={movements}
                getKey={(m) => m.id}
                columns={[
                  {
                    key: 'kind',
                    header: 'Tipo',
                    primary: true,
                    render: (m: CashMovement) =>
                      m.kind === 'income' ? (
                        <StatusBadge status="success">Ingreso</StatusBadge>
                      ) : (
                        <StatusBadge status="danger">Gasto</StatusBadge>
                      ),
                  },
                  { key: 'date', header: 'Fecha', secondary: true, render: (m: CashMovement) => dateFmt(m.occurredAt) },
                  { key: 'category', header: 'Categoría', render: (m: CashMovement) => m.category },
                  { key: 'notes', header: 'Notas', render: (m: CashMovement) => m.notes ?? '—' },
                  {
                    key: 'amount',
                    header: 'Importe',
                    align: 'right',
                    render: (m: CashMovement) => (
                      <span className={m.kind === 'income' ? 'font-semibold text-primary-700' : 'font-semibold text-danger'}>
                        {m.kind === 'income' ? '+' : '−'}
                        {money(m.amount)}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
