'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, Download, Landmark, Plus, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PageHeader } from '@/components/page-header';
import { FinanceTabs } from '@/components/finance-tabs';
import { DateRangeFilter } from '@/components/ui/date-range';
import { financeApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/hooks/use-confirm';
import { formatMoney as money, formatSignedMoney as signedMoney, formatDate as dateFmt } from '@/lib/utils';
import { TableSkeleton, ChipsSkeleton } from '@/components/ui/skeleton';
import type { CashMovement, ReportGranularity, AccountKind } from '@lasmarias/shared-schemas';

const SELECT_CLASS =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

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

const OTHER_CATEGORY = '__otra__';

// Form para cargar un gasto (kind=expense). Cuenta + categoría (catálogo) + monto + fecha.
function ExpenseForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const accountsQuery = useQuery({ queryKey: ['finance-accounts'], queryFn: () => financeApi.accounts() });
  const categoriesQuery = useQuery({ queryKey: ['expense-categories'], queryFn: () => financeApi.categories() });

  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState(''); // value del select: nombre o OTHER_CATEGORY
  const [otherCategory, setOtherCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const category = categoryId === OTHER_CATEGORY ? otherCategory.trim() : categoryId;

  const create = useMutation({
    mutationFn: async () => {
      // Si es una categoría nueva, la agregamos al catálogo antes de usarla.
      if (categoryId === OTHER_CATEGORY && otherCategory.trim()) {
        await financeApi.createCategory({ name: otherCategory.trim() }).catch(() => undefined);
      }
      return financeApi.createCashMovement({
        kind: 'expense',
        amount: Number(amount),
        category: category,
        accountId: accountId || undefined,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
      toast.success(`Gasto de ${money(m.amount)} cargado.`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cargar el gasto. Probá de nuevo.'),
  });

  const canSave = Number(amount) > 0 && category.length > 0 && !create.isPending;

  async function handleCreate() {
    const ok = await confirm({
      title: 'Confirmar gasto',
      message: `Vas a cargar un gasto de ${money(Number(amount))} en "${category}". Va a figurar como egreso en el flujo de caja.`,
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
          <Field label="Categoría" htmlFor="exp-category" required hint="Del catálogo, o agregá una nueva.">
            <select id="exp-category" className={SELECT_CLASS} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Elegí una categoría</option>
              {(categoriesQuery.data ?? []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              <option value={OTHER_CATEGORY}>+ Otra categoría…</option>
            </select>
            {categoryId === OTHER_CATEGORY && (
              <Input className="mt-2" autoFocus placeholder="Nombre de la categoría" value={otherCategory} onChange={(e) => setOtherCategory(e.target.value)} />
            )}
          </Field>
          <Field label="Cuenta" htmlFor="exp-account" hint="De qué caja/banco sale.">
            <select id="exp-account" className={SELECT_CLASS} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Caja (por defecto)</option>
              {(accountsQuery.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
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
          <Field label="Notas" htmlFor="exp-notes" hint="Opcional." className="sm:col-span-2">
            <Input id="exp-notes" placeholder="Detalle del gasto" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
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

// Panel de cuentas con su saldo calculado + alta rápida de cuenta.
function AccountsPanel() {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ['finance-accounts'], queryFn: () => financeApi.accounts() });
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('banco');
  const [opening, setOpening] = useState('');

  const create = useMutation({
    mutationFn: () => financeApi.createAccount({ name: name.trim(), kind, openingBalance: opening ? Number(opening) : 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      toast.success('Cuenta creada.');
      setName(''); setOpening(''); setKind('banco'); setShowNew(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo crear la cuenta.'),
  });

  const accounts = accountsQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5 text-secondary-700" aria-hidden="true" /> Cuentas</CardTitle>
        <Button variant="secondary" size="sm" onClick={() => setShowNew((s) => !s)}>
          <Plus className="h-4 w-4" /> {showNew ? 'Cerrar' : 'Nueva cuenta'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {accountsQuery.isLoading ? (
          <ChipsSkeleton count={2} />
        ) : (
          <div className="flex flex-wrap gap-3">
            {accounts.map((a) => (
              <div key={a.id} className="flex flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-secondary-50 text-secondary-700">
                  {a.kind === 'banco' ? <Landmark className="h-4 w-4" aria-hidden="true" /> : <Wallet className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] uppercase tracking-wide text-foreground-muted">{a.name}</span>
                  <span className={`block font-display text-xl font-bold tracking-tight ${a.balance < 0 ? 'text-danger' : 'text-foreground'}`}>{money(a.balance)}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {showNew && (
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-border-subtle bg-surface-subtle/40 p-4 sm:grid-cols-4">
            <Field label="Nombre" htmlFor="acc-name" required>
              <Input id="acc-name" autoFocus placeholder="Banco Nación" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Tipo" htmlFor="acc-kind">
              <select id="acc-kind" className={SELECT_CLASS} value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
                <option value="banco">Banco</option>
                <option value="caja">Caja</option>
              </select>
            </Field>
            <Field label="Saldo inicial" htmlFor="acc-open" hint="Lo que hay hoy.">
              <Input id="acc-open" type="number" inputMode="decimal" step="0.01" prefix="$" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button onClick={() => create.mutate()} loading={create.isPending} loadingText="Creando..." disabled={name.trim().length === 0 || create.isPending} className="w-full">
                Crear cuenta
              </Button>
            </div>
          </div>
        )}
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

      <FinanceTabs />

      {/* Filtro liviano del período (controla los KPIs y movimientos). Sin card pesada. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <div className="space-y-1">
          <span className="block text-xs font-medium text-foreground-muted">Agrupar</span>
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
      </div>
      {!validRange && (
        <p className="text-xs text-danger">Revisá las fechas: &quot;desde&quot; no puede ser mayor que &quot;hasta&quot;.</p>
      )}

      {/* Cuentas/bancos: saldos actuales (no dependen del período). */}
      <AccountsPanel />

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
                  { key: 'account', header: 'Cuenta', render: (m: CashMovement) => m.accountName ?? '—' },
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
