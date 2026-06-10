'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Banknote,
  Download,
  Landmark,
  Plus,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
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
import { formatMoney as money, formatDate as dateFmt } from '@/lib/utils';
import { TableSkeleton, ChipsSkeleton } from '@/components/ui/skeleton';
import type { Account, CashMovement, ReportGranularity, AccountKind } from '@lasmarias/shared-schemas';

const SELECT_CLASS =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

const fmtDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function monthDefaults() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmtDay(first), to: fmtDay(now) };
}

const toEndOfDay = (day: string) => `${day}T23:59:59.999`;

const INCOME_CATEGORIES = [
  'Cobro de venta',
  'Depósito en efectivo',
  'Transferencia recibida',
  'Devolución recibida',
  'Otro ingreso',
];
const OTHER_CATEGORY = '__otra__';

// --- Tarjeta de cuenta (pill selector) ---
function AccountCard({
  account,
  active,
  onClick,
}: {
  account: Account;
  active: boolean;
  onClick: () => void;
}) {
  const isBank = account.kind === 'banco';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-[160px] flex-1 flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left transition-all hover:shadow-md ${
        active
          ? 'border-primary-600 bg-primary-50 shadow-md'
          : 'border-border-subtle bg-surface-elevated hover:border-border'
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
            active ? 'bg-primary-100 text-primary-700' : 'bg-secondary-50 text-secondary-600'
          }`}
        >
          {isBank ? (
            <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </span>
        <span className={`truncate text-xs font-semibold uppercase tracking-wide ${active ? 'text-primary-700' : 'text-foreground-muted'}`}>
          {account.name}
        </span>
      </span>
      <span
        className={`font-display text-2xl font-bold tracking-tight ${
          account.balance < 0 ? 'text-danger' : active ? 'text-primary-700' : 'text-foreground'
        }`}
      >
        {money(account.balance)}
      </span>
      {isBank && (
        <span className={`text-[10px] font-medium ${active ? 'text-primary-600' : 'text-foreground-muted'}`}>
          Banco · {active ? 'Mostrando movimientos' : 'Clic para ver'}
        </span>
      )}
    </button>
  );
}

// Pill "Todas"
function AllAccountsCard({ active, onClick, total }: { active: boolean; onClick: () => void; total: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-[130px] flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left transition-all hover:shadow-md ${
        active
          ? 'border-primary-600 bg-primary-50 shadow-md'
          : 'border-border-subtle bg-surface-elevated hover:border-border'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? 'bg-primary-100 text-primary-700' : 'bg-secondary-50 text-secondary-600'}`}>
          <Scale className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className={`text-xs font-semibold uppercase tracking-wide ${active ? 'text-primary-700' : 'text-foreground-muted'}`}>
          Todas
        </span>
      </span>
      <span className={`font-display text-2xl font-bold tracking-tight ${total < 0 ? 'text-danger' : active ? 'text-primary-700' : 'text-foreground'}`}>
        {money(total)}
      </span>
      <span className={`text-[10px] font-medium ${active ? 'text-primary-600' : 'text-foreground-muted'}`}>
        Todas las cuentas
      </span>
    </button>
  );
}

// --- Modal de nuevo movimiento (ingreso o gasto) ---
function MovementModal({
  accounts,
  defaultAccountId,
  onDone,
}: {
  accounts: Account[];
  defaultAccountId?: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const categoriesQuery = useQuery({ queryKey: ['expense-categories'], queryFn: () => financeApi.categories() });

  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [otherCategory, setOtherCategory] = useState('');
  const [accountId, setAccountId] = useState(defaultAccountId ?? '');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const isIncome = kind === 'income';
  const category = categoryId === OTHER_CATEGORY ? otherCategory.trim() : categoryId;

  const create = useMutation({
    mutationFn: async () => {
      if (kind === 'expense' && categoryId === OTHER_CATEGORY && otherCategory.trim()) {
        await financeApi.createCategory({ name: otherCategory.trim() }).catch(() => undefined);
      }
      return financeApi.createCashMovement({
        kind,
        amount: Number(amount),
        category,
        accountId: accountId || undefined,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['home'] });
      toast.success(
        isIncome
          ? `Ingreso de ${money(m.amount)} cargado.`
          : `Gasto de ${money(m.amount)} cargado.`,
      );
      onDone();
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'No se pudo cargar el movimiento.'),
  });

  const canSave = Number(amount) > 0 && category.length > 0 && !create.isPending;

  async function handleCreate() {
    const ok = await confirm({
      title: isIncome ? 'Confirmar ingreso' : 'Confirmar gasto',
      message: `Vas a cargar ${isIncome ? 'un ingreso' : 'un gasto'} de ${money(Number(amount))} — "${category}".`,
      confirmLabel: isIncome ? 'Cargar ingreso' : 'Cargar gasto',
    });
    if (ok) create.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onDone}>
      <div
        className="w-full max-w-xl rounded-t-2xl bg-surface p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Nuevo movimiento</h2>
          <button type="button" onClick={onDone} className="rounded-lg p-1 text-foreground-muted hover:bg-secondary-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toggle ingreso / gasto */}
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-secondary-50 p-1">
          <button
            type="button"
            onClick={() => { setKind('income'); setCategoryId(''); }}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
              isIncome
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            }`}
          >
            <TrendingUp className="h-4 w-4" /> Ingreso
          </button>
          <button
            type="button"
            onClick={() => { setKind('expense'); setCategoryId(''); }}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
              !isIncome
                ? 'bg-danger text-white shadow-sm'
                : 'text-foreground-muted hover:text-foreground'
            }`}
          >
            <TrendingDown className="h-4 w-4" /> Gasto
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label={isIncome ? 'Tipo de ingreso' : 'Categoría'}
            htmlFor="mov-category"
            required
          >
            <select
              id="mov-category"
              className={SELECT_CLASS}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Elegí una categoría</option>
              {isIncome
                ? INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)
                : (categoriesQuery.data ?? []).map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
              {!isIncome && <option value={OTHER_CATEGORY}>+ Otra categoría…</option>}
            </select>
            {!isIncome && categoryId === OTHER_CATEGORY && (
              <Input
                className="mt-2"
                autoFocus
                placeholder="Nombre de la categoría"
                value={otherCategory}
                onChange={(e) => setOtherCategory(e.target.value)}
              />
            )}
          </Field>

          <Field label="Cuenta" htmlFor="mov-account">
            <select
              id="mov-account"
              className={SELECT_CLASS}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Caja (por defecto)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Monto" htmlFor="mov-amount" required>
            <Input
              id="mov-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              prefix="$"
              placeholder="Ej: 12000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) { e.preventDefault(); handleCreate(); }
              }}
            />
          </Field>

          <Field label="Fecha" htmlFor="mov-date">
            <Input
              id="mov-date"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </Field>

          <Field label="Notas" htmlFor="mov-notes" hint="Opcional." className="sm:col-span-2">
            <Input
              id="mov-notes"
              placeholder="Detalle del movimiento"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="ghost" onClick={onDone} disabled={create.isPending} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            loading={create.isPending}
            loadingText="Guardando..."
            disabled={!canSave}
            className="flex-1"
            variant={isIncome ? 'primary' : 'danger'}
          >
            <Plus className="h-4 w-4" />
            {isIncome ? 'Cargar ingreso' : 'Cargar gasto'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Formulario de nueva cuenta ---
function NewAccountForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('banco');
  const [opening, setOpening] = useState('');

  const create = useMutation({
    mutationFn: () =>
      financeApi.createAccount({ name: name.trim(), kind, openingBalance: opening ? Number(opening) : 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      toast.success('Cuenta creada.');
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo crear la cuenta.'),
  });

  return (
    <div className="grid grid-cols-1 gap-4 rounded-xl border border-border-subtle bg-secondary-50/40 p-4 sm:grid-cols-4">
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
      <div className="flex items-end gap-2">
        <Button variant="ghost" onClick={onDone} className="flex-1">Cancelar</Button>
        <Button
          onClick={() => create.mutate()}
          loading={create.isPending}
          loadingText="Creando..."
          disabled={name.trim().length === 0}
          className="flex-1"
        >
          Crear
        </Button>
      </div>
    </div>
  );
}

// --- KPI chip compacto ---
function KpiChip({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: 'income' | 'expense' | 'neutral' | 'danger';
  icon: typeof TrendingUp;
}) {
  const tones = {
    income: { value: 'text-primary-700', icon: 'bg-primary-50 text-primary-700' },
    expense: { value: 'text-danger', icon: 'bg-red-50 text-danger' },
    neutral: { value: 'text-foreground', icon: 'bg-secondary-50 text-secondary-700' },
    danger: { value: 'text-danger', icon: 'bg-red-50 text-danger' },
  };
  const t = tones[tone];
  return (
    <div className="flex flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
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

// --- Página principal ---
export default function CajaPage() {
  const defaults = useMemo(monthDefaults, []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [granularity, setGranularity] = useState<ReportGranularity>('day');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null); // null = "Todas"
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showNewAccount, setShowNewAccount] = useState(false);

  const validRange = !!from && !!to && from <= to;

  const accountsQuery = useQuery({
    queryKey: ['finance-accounts'],
    queryFn: () => financeApi.accounts(),
  });

  const flowQuery = useQuery({
    queryKey: ['cash-flow', from, to, granularity],
    queryFn: () => financeApi.cashFlow(from, toEndOfDay(to), granularity),
    enabled: validRange,
  });

  const movementsQuery = useQuery({
    queryKey: ['cash-movements', from, to, selectedAccountId],
    queryFn: () =>
      financeApi.cashMovements(from, toEndOfDay(to), selectedAccountId ?? undefined),
    enabled: validRange,
  });

  const exportCsv = useMutation({
    mutationFn: () => financeApi.exportCashFlowXlsx(from, toEndOfDay(to), granularity),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo exportar.'),
  });

  const accounts = accountsQuery.data ?? [];
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const movements = movementsQuery.data ?? [];
  const flow = flowQuery.data;

  const selectedAccount = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId)
    : null;

  // KPIs del período (según cuenta seleccionada o todas)
  const periodIncome = movements
    .filter((m) => m.kind === 'income')
    .reduce((s, m) => s + m.amount, 0);
  const periodExpense = movements
    .filter((m) => m.kind === 'expense')
    .reduce((s, m) => s + m.amount, 0);
  const periodNet = periodIncome - periodExpense;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Caja y Bancos"
        description={
          selectedAccount
            ? `Viendo movimientos de ${selectedAccount.name}`
            : 'Saldos y movimientos de todas tus cuentas.'
        }
        action={
          <Button onClick={() => setShowMovementModal(true)}>
            <Plus className="h-4 w-4" /> Nuevo movimiento
          </Button>
        }
      />

      <FinanceTabs />

      {/* Selector de cuentas */}
      {accountsQuery.isLoading ? (
        <ChipsSkeleton count={3} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 overflow-x-auto pb-1">
            <AllAccountsCard
              active={selectedAccountId === null}
              onClick={() => setSelectedAccountId(null)}
              total={totalBalance}
            />
            {accounts.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                active={selectedAccountId === a.id}
                onClick={() =>
                  setSelectedAccountId((prev) => (prev === a.id ? null : a.id))
                }
              />
            ))}
          </div>

          {/* Botón conciliar + nueva cuenta */}
          <div className="flex flex-wrap items-center gap-2">
            {selectedAccount?.kind === 'banco' && (
              <a
                href={`/finanzas/conciliar/${selectedAccount.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-100 transition-colors"
              >
                <Scale className="h-4 w-4" /> Conciliar {selectedAccount.name}
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNewAccount((s) => !s)}
            >
              <Plus className="h-3.5 w-3.5" /> {showNewAccount ? 'Cerrar' : 'Nueva cuenta'}
            </Button>
          </div>

          {showNewAccount && <NewAccountForm onDone={() => setShowNewAccount(false)} />}
        </div>
      )}

      {/* Filtro de período */}
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
        <p className="text-xs text-danger">
          Revisá las fechas: &quot;desde&quot; no puede ser mayor que &quot;hasta&quot;.
        </p>
      )}

      {/* KPIs del período */}
      {validRange && (
        <section aria-label="Resumen del período" className="flex flex-wrap gap-3">
          <KpiChip
            label={`Ingresos${selectedAccount ? ` · ${selectedAccount.name}` : ''}`}
            value={`+${money(periodIncome)}`}
            tone="income"
            icon={TrendingUp}
          />
          <KpiChip
            label={`Egresos${selectedAccount ? ` · ${selectedAccount.name}` : ''}`}
            value={`−${money(periodExpense)}`}
            tone="expense"
            icon={TrendingDown}
          />
          <KpiChip
            label="Neto del período"
            value={periodNet >= 0 ? `+${money(periodNet)}` : `−${money(Math.abs(periodNet))}`}
            tone={periodNet >= 0 ? 'neutral' : 'danger'}
            icon={Banknote}
          />
        </section>
      )}

      {/* Tabla de movimientos */}
      {!validRange ? (
        <EmptyState
          icon={Banknote}
          title="Elegí un rango de fechas válido"
          description='La fecha "desde" debe ser anterior o igual a "hasta".'
        />
      ) : movementsQuery.isLoading ? (
        <TableSkeleton />
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
              Movimientos
              {selectedAccount && (
                <span className="ml-2 text-sm font-normal text-foreground-muted">
                  — {selectedAccount.name}
                </span>
              )}
            </h2>
            <Button
              variant="secondary"
              onClick={() => exportCsv.mutate()}
              loading={exportCsv.isPending}
              loadingText="Generando..."
            >
              <Download className="h-4 w-4" /> Exportar Excel
            </Button>
          </div>

          {movements.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title={
                selectedAccount
                  ? `No hay movimientos en ${selectedAccount.name} en este período`
                  : 'No hay movimientos en este período'
              }
              description="Los cobros de clientes aparecen como ingresos. Cargá un movimiento o ampliá el rango de fechas."
              action={
                <Button onClick={() => setShowMovementModal(true)}>
                  <Plus className="h-4 w-4" /> Cargar movimiento
                </Button>
              }
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
                {
                  key: 'date',
                  header: 'Fecha',
                  secondary: true,
                  render: (m: CashMovement) => dateFmt(m.occurredAt),
                },
                { key: 'category', header: 'Categoría', render: (m: CashMovement) => m.category },
                {
                  key: 'account',
                  header: 'Cuenta',
                  render: (m: CashMovement) => m.accountName ?? '—',
                },
                { key: 'notes', header: 'Notas', render: (m: CashMovement) => m.notes ?? '—' },
                {
                  key: 'amount',
                  header: 'Importe',
                  align: 'right',
                  render: (m: CashMovement) => (
                    <span
                      className={
                        m.kind === 'income'
                          ? 'font-semibold text-primary-700'
                          : 'font-semibold text-danger'
                      }
                    >
                      {m.kind === 'income' ? '+' : '−'}
                      {money(m.amount)}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </section>
      )}

      {/* Modal de nuevo movimiento */}
      {showMovementModal && (
        <MovementModal
          accounts={accounts}
          defaultAccountId={selectedAccountId ?? undefined}
          onDone={() => setShowMovementModal(false)}
        />
      )}
    </div>
  );
}
