'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarClock, CalendarX2, Download, HandCoins, TriangleAlert, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/page-header';
import { FinanceTabs } from '@/components/finance-tabs';
import { salesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/hooks/use-confirm';
import { formatMoney as money, formatDate as dateFmt } from '@/lib/utils';
import { TableSkeleton, ChipsSkeleton } from '@/components/ui/skeleton';
import type { AccountBalance, AccountMovement } from '@lasmarias/shared-schemas';

// Color del saldo: rojo si debe (>0), gris/verde si está al día o a favor.
function balanceTone(balance: number) {
  if (balance > 0.005) return 'text-danger';
  if (balance < -0.005) return 'text-primary-700';
  return 'text-foreground-muted';
}

// Chip compacto al estilo del Home (§5.3): ícono en cuadro con tono semántico,
// label en mayúsculas chico y número en font-display bold.
type ChipTone = 'primary' | 'amber' | 'danger' | 'neutral';

const CHIP_TONE: Record<ChipTone, string> = {
  primary: 'bg-primary-50 text-primary-700',
  amber: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  neutral: 'bg-surface-subtle text-foreground-muted',
};

function StatChip({
  icon: Icon,
  label,
  value,
  tone,
  valueClassName,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: ChipTone;
  valueClassName?: string;
  hint?: string;
}) {
  return (
    <div title={hint} className="flex min-w-[10rem] flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${CHIP_TONE[tone]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">{label}</span>
        <span className={`block font-display text-lg font-bold tracking-tight text-foreground ${valueClassName ?? ''}`}>
          {value}
        </span>
      </span>
    </div>
  );
}

const KIND_LABEL: Record<AccountMovement['kind'], string> = {
  charge: 'Venta',
  payment: 'Cobro',
  credit_note: 'Nota de crédito',
};

const KIND_TONE: Record<AccountMovement['kind'], 'danger' | 'success' | 'info'> = {
  charge: 'danger',
  payment: 'success',
  credit_note: 'info',
};

function PaymentForm({ clientId, clientName, onDone }: { clientId: string; clientName: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('');

  const register = useMutation({
    mutationFn: () =>
      salesApi.registerPayment({
        clientId,
        amount: Number(amount),
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        method: method || undefined,
      }),
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['account', clientId] });
      toast.success(`Cobro de ${money(m.amount)} registrado.`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo registrar el cobro. Probá de nuevo.'),
  });

  const canSave = Number(amount) > 0 && !register.isPending;

  async function handleRegister() {
    const ok = await confirm({
      title: 'Confirmar cobro',
      message: `Vas a registrar un cobro de ${money(Number(amount))} de ${clientName}. Se va a descontar de su saldo y queda como ingreso en el flujo de caja.`,
      confirmLabel: 'Registrar cobro',
    });
    if (ok) register.mutate();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Registrar cobro</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Monto" htmlFor="pay-amount" required>
            <Input
              id="pay-amount"
              autoFocus
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              prefix="$"
              placeholder="Ej: 25000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSave) { e.preventDefault(); handleRegister(); } }}
            />
          </Field>
          <Field label="Fecha" htmlFor="pay-date">
            <Input id="pay-date" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </Field>
          <Field label="Método" htmlFor="pay-method" hint="Efectivo, transferencia, cheque…">
            <Input id="pay-method" placeholder="Efectivo" value={method} onChange={(e) => setMethod(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleRegister} loading={register.isPending} loadingText="Registrando..." disabled={!canSave}>
            <HandCoins className="h-4 w-4" /> Registrar cobro
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountDetailView({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [showPayment, setShowPayment] = useState(false);
  const detailQuery = useQuery({ queryKey: ['account', clientId], queryFn: () => salesApi.accountDetail(clientId) });

  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <ChipsSkeleton count={3} />
        <TableSkeleton rows={5} />
      </div>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <p className="text-sm text-danger">No se pudo cargar la cuenta.</p>;
  }

  const d = detailQuery.data;
  const aging: { icon: LucideIcon; label: string; value: number; tone: ChipTone; hint: string }[] = [
    { icon: CalendarClock, label: 'Al día (0-30 días)', value: d.aging.current, tone: 'neutral', hint: 'Deuda con menos de 31 días desde la venta. Todavía dentro del plazo normal.' },
    { icon: TriangleAlert, label: '31 a 60 días', value: d.aging.d31to60, tone: 'amber', hint: 'Deuda de entre 31 y 60 días. Conviene seguirla de cerca.' },
    { icon: CalendarX2, label: 'Más de 60 días', value: d.aging.over60, tone: 'danger', hint: 'Deuda con más de 60 días. Es la más vieja y la más difícil de cobrar.' },
  ];
  const balanceLabel = d.balance > 0.005 ? 'Debe' : d.balance < -0.005 ? 'Saldo a favor' : 'Al día';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Volver a cuentas
        </Button>
        <Button onClick={() => setShowPayment((s) => !s)}>
          <HandCoins className="h-4 w-4" /> {showPayment ? 'Cerrar' : 'Registrar cobro'}
        </Button>
      </div>

      {/* Saldo dominante + nombre del cliente. */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-base font-medium text-foreground">{d.clientName}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-foreground-muted">Saldo</p>
          <div className="flex items-baseline gap-3">
            <p className={`font-display text-3xl font-bold tracking-tight ${balanceTone(d.balance)}`}>{money(d.balance)}</p>
            <span className="text-sm text-foreground-muted">{balanceLabel}</span>
          </div>
        </CardContent>
      </Card>

      {/* Antigüedad de la deuda como chips compactos (§5.3). */}
      <section aria-label="Antigüedad de la deuda" className="flex flex-wrap gap-3">
        {aging.map((a) => (
          <StatChip key={a.label} icon={a.icon} label={a.label} value={money(a.value)} tone={a.tone} hint={a.hint} />
        ))}
      </section>

      {d.warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-1 pt-6 text-sm text-amber-800">
            {d.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>{w}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {showPayment && <PaymentForm clientId={clientId} clientName={d.clientName} onDone={() => setShowPayment(false)} />}

      <Card>
        <CardHeader><CardTitle>Movimientos</CardTitle></CardHeader>
        <CardContent>
          {d.movements.length === 0 ? (
            <p className="py-6 text-center text-sm text-foreground-muted">Todavía no hay movimientos.</p>
          ) : (
            <DataTable
              data={d.movements}
              getKey={(m) => m.id}
              columns={[
                {
                  key: 'kind',
                  header: 'Tipo',
                  primary: true,
                  render: (m: AccountMovement) => <StatusBadge status={KIND_TONE[m.kind]}>{KIND_LABEL[m.kind]}</StatusBadge>,
                },
                { key: 'date', header: 'Fecha', secondary: true, render: (m: AccountMovement) => dateFmt(m.occurredAt) },
                {
                  key: 'due',
                  header: 'Vence',
                  render: (m: AccountMovement) => (m.dueDate ? dateFmt(m.dueDate) : '—'),
                },
                {
                  key: 'amount',
                  header: 'Importe',
                  align: 'right',
                  render: (m: AccountMovement) => (
                    <span className={m.kind === 'charge' ? 'text-danger' : 'text-primary-700'}>
                      {m.kind === 'charge' ? '+' : '−'}{money(m.amount)}
                    </span>
                  ),
                },
                { key: 'notes', header: 'Notas', render: (m: AccountMovement) => m.notes ?? '—' },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CuentasPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: () => salesApi.accounts() });

  const exportCsv = useMutation({
    mutationFn: () => salesApi.exportAccountsXlsx(),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo exportar. Probá de nuevo.'),
  });

  const accounts = accountsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cobranzas"
        description="Cuenta corriente: saldo de cada cliente, antigüedad de la deuda y registro de cobros."        action={
          !selected ? (
            <Button
              variant="secondary"
              onClick={() => exportCsv.mutate()}
              loading={exportCsv.isPending}
              loadingText="Generando..."
            >
              <Download className="h-4 w-4" /> Exportar Excel
            </Button>
          ) : undefined
        }
      />
      <FinanceTabs />

      {selected ? (
        <AccountDetailView clientId={selected} onBack={() => setSelected(null)} />
      ) : accountsQuery.isLoading ? (
        <TableSkeleton />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Todavía no hay cuentas con movimiento"
          description="Cuando despaches mercadería en cuenta corriente, vas a ver acá el saldo de cada cliente."
        />
      ) : (
        <DataTable
          data={accounts}
          getKey={(a) => a.clientId}
          onRowClick={(a) => setSelected(a.clientId)}
          getSearchText={(a: AccountBalance) => a.clientName}
          searchPlaceholder="Buscar cliente…"
          columns={[
            { key: 'client', header: 'Cliente', primary: true, render: (a: AccountBalance) => a.clientName, sortValue: (a: AccountBalance) => a.clientName },
            {
              key: 'warnings',
              header: 'Avisos',
              render: (a: AccountBalance) =>
                a.warnings.length > 0 ? <StatusBadge status="warning">{a.warnings.length} aviso(s)</StatusBadge> : '—',
            },
            {
              key: 'balance',
              header: 'Saldo',
              align: 'right',
              sortValue: (a: AccountBalance) => Number(a.balance),
              render: (a: AccountBalance) => (
                <span className={`font-semibold ${balanceTone(a.balance)}`}>{money(a.balance)}</span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
