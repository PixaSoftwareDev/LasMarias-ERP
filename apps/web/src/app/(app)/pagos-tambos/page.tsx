'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, HandCoins, Milk } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { producersApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/hooks/use-confirm';
import { formatMoney as money, formatDate as dateFmt } from '@/lib/utils';
import { TableSkeleton } from '@/components/ui/skeleton';
import type { ProducerBalance } from '@lasmarias/shared-schemas';

function balanceTone(b: number) {
  if (b > 0.005) return 'text-danger';
  if (b < -0.005) return 'text-primary-700';
  return 'text-foreground-muted';
}

// Etiqueta del mes actual y los últimos 11, en formato YYYY-MM.
function recentMonths(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value, label: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) });
  }
  return out;
}

const SELECT_CLASS =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 sm:w-56';

function PaymentForm({ producerId, producerName, onDone }: { producerId: string; producerName: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('');

  const register = useMutation({
    mutationFn: () =>
      producersApi.registerPayment({
        producerId,
        amount: Number(amount),
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        method: method || undefined,
      }),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ['producer-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['producer-account', producerId] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      toast.success(`Pago de ${money(p.amount)} registrado.`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo registrar el pago.'),
  });

  const canSave = Number(amount) > 0 && !register.isPending;

  async function handleRegister() {
    const ok = await confirm({
      title: 'Confirmar pago',
      message: `Vas a registrar un pago de ${money(Number(amount))} a ${producerName}. Se va a descontar del saldo y queda como egreso en el flujo de caja.`,
      confirmLabel: 'Registrar pago',
    });
    if (ok) register.mutate();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Registrar pago</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Monto" htmlFor="pay-amount" required>
            <Input id="pay-amount" autoFocus type="number" inputMode="decimal" step="0.01" min={0} prefix="$" placeholder="Ej: 150000" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canSave) { e.preventDefault(); handleRegister(); } }} />
          </Field>
          <Field label="Fecha" htmlFor="pay-date">
            <Input id="pay-date" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </Field>
          <Field label="Método" htmlFor="pay-method" hint="Efectivo, transferencia, cheque…">
            <Input id="pay-method" placeholder="Transferencia" value={method} onChange={(e) => setMethod(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleRegister} loading={register.isPending} loadingText="Registrando..." disabled={!canSave}>
            <HandCoins className="h-4 w-4" /> Registrar pago
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountDetail({ producerId, onBack }: { producerId: string; onBack: () => void }) {
  const months = useMemo(recentMonths, []);
  const [month, setMonth] = useState(months[0]!.value);
  const [showPayment, setShowPayment] = useState(false);
  const detailQuery = useQuery({
    queryKey: ['producer-account', producerId, month],
    queryFn: () => producersApi.account(producerId, month),
  });

  if (detailQuery.isLoading) return <TableSkeleton rows={6} />;
  if (detailQuery.isError || !detailQuery.data) return <p className="text-sm text-danger">No se pudo cargar la cuenta.</p>;

  const d = detailQuery.data;
  const label = d.balance > 0.005 ? 'Le debés' : d.balance < -0.005 ? 'A favor' : 'Al día';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Volver a tambos
        </Button>
        <Button onClick={() => setShowPayment((s) => !s)}>
          <HandCoins className="h-4 w-4" /> {showPayment ? 'Cerrar' : 'Registrar pago'}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-base font-medium text-foreground">{d.producerName}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-foreground-muted">Saldo</p>
          <div className="flex items-baseline gap-3">
            <p className={`font-display text-3xl font-bold tracking-tight ${balanceTone(d.balance)}`}>{money(d.balance)}</p>
            <span className="text-sm text-foreground-muted">{label}</span>
          </div>
        </CardContent>
      </Card>

      {showPayment && <PaymentForm producerId={producerId} producerName={d.producerName} onDone={() => setShowPayment(false)} />}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="text-sm font-medium text-foreground">Liquidación del mes:</span>
        <select className={SELECT_CLASS} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes">
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <Milk className="h-5 w-5 text-secondary-600" aria-hidden="true" /> Leche recibida
        </h2>
        <DataTable
          data={d.receptions}
          getKey={(r) => r.receptionId}
          emptyText="No hubo recepciones en el mes elegido."
          columns={[
            { key: 'date', header: 'Fecha', secondary: true, render: (r) => dateFmt(r.receivedAt), sortValue: (r) => new Date(r.receivedAt).getTime() },
            { key: 'code', header: 'Lote', primary: true, render: (r) => <span className="font-mono text-xs">{r.code}</span> },
            { key: 'liters', header: 'Litros', align: 'right', render: (r) => r.liters.toLocaleString('es-AR'), sortValue: (r) => r.liters },
            { key: 'price', header: '$/L', align: 'right', render: (r) => money(r.pricePerLiter) },
            { key: 'amount', header: 'Importe', align: 'right', render: (r) => money(r.amount), sortValue: (r) => r.amount },
          ]}
        />
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <HandCoins className="h-5 w-5 text-primary-700" aria-hidden="true" /> Pagos
        </h2>
        <DataTable
          data={d.payments}
          getKey={(p) => p.id}
          emptyText="Sin pagos en el mes elegido."
          columns={[
            { key: 'date', header: 'Fecha', secondary: true, render: (p) => dateFmt(p.occurredAt), sortValue: (p) => new Date(p.occurredAt).getTime() },
            { key: 'method', header: 'Método', primary: true, render: (p) => p.method ?? '—' },
            { key: 'amount', header: 'Importe', align: 'right', render: (p) => <span className="font-semibold text-primary-700">{money(p.amount)}</span>, sortValue: (p) => p.amount },
            { key: 'notes', header: 'Notas', render: (p) => p.notes ?? '—' },
          ]}
        />
      </section>
    </div>
  );
}

export default function PagosTambosPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const accountsQuery = useQuery({ queryKey: ['producer-accounts'], queryFn: () => producersApi.accounts() });
  const accounts = accountsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pagos a tambos" description="Lo que le debés a cada tambo por la leche y los pagos que hacés." />

      {selected ? (
        <AccountDetail producerId={selected} onBack={() => setSelected(null)} />
      ) : accountsQuery.isLoading ? (
        <TableSkeleton />
      ) : accounts.length === 0 ? (
        <EmptyState icon={Milk} title="No hay tambos cargados" description="Cargá tambos en Datos maestros y, cuando recibas leche, vas a ver acá lo que les debés." />
      ) : (
        <DataTable
          data={accounts}
          getKey={(a) => a.producerId}
          onRowClick={(a) => setSelected(a.producerId)}
          getSearchText={(a: ProducerBalance) => a.producerName}
          searchPlaceholder="Buscar tambo…"
          columns={[
            { key: 'name', header: 'Tambo', primary: true, render: (a: ProducerBalance) => a.producerName, sortValue: (a: ProducerBalance) => a.producerName },
            { key: 'received', header: 'Leche recibida', align: 'right', render: (a: ProducerBalance) => money(a.totalReceived), sortValue: (a: ProducerBalance) => a.totalReceived },
            { key: 'paid', header: 'Pagado', align: 'right', render: (a: ProducerBalance) => money(a.totalPaid), sortValue: (a: ProducerBalance) => a.totalPaid },
            { key: 'balance', header: 'Le debés', align: 'right', sortValue: (a: ProducerBalance) => a.balance, render: (a: ProducerBalance) => <span className={`font-semibold ${balanceTone(a.balance)}`}>{money(a.balance)}</span> },
          ]}
        />
      )}
    </div>
  );
}
