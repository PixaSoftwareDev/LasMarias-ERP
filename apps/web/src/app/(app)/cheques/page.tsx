'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/page-header';
import { TableSkeleton } from '@/components/ui/skeleton';
import { financeApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/hooks/use-confirm';
import { formatMoney as money, formatDate as dateFmt } from '@/lib/utils';
import type { Cheque, ChequeKind, ChequeStatus } from '@lasmarias/shared-schemas';

const SELECT_CLASS =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

const KIND_LABEL: Record<ChequeKind, string> = { recibido: 'Recibido', propio: 'Propio' };
const STATUS_BADGE: Record<ChequeStatus, { variant: Status; label: string }> = {
  en_cartera: { variant: 'warning', label: 'En cartera' },
  cobrado: { variant: 'success', label: 'Cobrado' },
  rechazado: { variant: 'danger', label: 'Rechazado' },
};

function NewChequeForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ['accounts'], queryFn: () => financeApi.accounts() });
  const [kind, setKind] = useState<ChequeKind>('recibido');
  const [number, setNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [counterparty, setCounterparty] = useState('');

  const create = useMutation({
    mutationFn: () =>
      financeApi.createCheque({
        kind,
        number: number.trim(),
        amount: Number(amount),
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        accountId: accountId || undefined,
        counterparty: counterparty.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] });
      toast.success('Cheque cargado.');
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cargar el cheque.'),
  });

  const canSave = number.trim().length > 0 && Number(amount) > 0 && !create.isPending;

  return (
    <Card>
      <CardHeader><CardTitle>Nuevo cheque</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Tipo" htmlFor="ch-kind" required hint="Recibido (de un cliente) o propio (emitido).">
            <select id="ch-kind" className={SELECT_CLASS} value={kind} onChange={(e) => setKind(e.target.value as ChequeKind)}>
              <option value="recibido">Recibido</option>
              <option value="propio">Propio</option>
            </select>
          </Field>
          <Field label="Número" htmlFor="ch-num" required>
            <Input id="ch-num" autoFocus placeholder="0001234" value={number} onChange={(e) => setNumber(e.target.value)} />
          </Field>
          <Field label="Importe" htmlFor="ch-amt" required>
            <Input id="ch-amt" type="number" inputMode="decimal" step="0.01" min={0} prefix="$" placeholder="Ej: 50000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Vencimiento" htmlFor="ch-due" hint="Opcional.">
            <Input id="ch-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Cuenta al cobrar" htmlFor="ch-acc" hint="Dónde se acredita/debita.">
            <select id="ch-acc" className={SELECT_CLASS} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Caja (por defecto)</option>
              {(accountsQuery.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label={kind === 'recibido' ? 'De quién' : 'A quién'} htmlFor="ch-cp" hint="Opcional.">
            <Input id="ch-cp" placeholder={kind === 'recibido' ? 'Cliente' : 'Proveedor'} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>Cancelar</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} loadingText="Cargando..." disabled={!canSave}>Cargar cheque</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ChequesPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const chequesQuery = useQuery({ queryKey: ['cheques'], queryFn: () => financeApi.cheques() });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ChequeStatus }) => financeApi.updateChequeStatus(id, { status }),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      toast.success(c.status === 'cobrado' ? 'Cheque cobrado: impactó el saldo de la cuenta.' : 'Cheque actualizado.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo actualizar el cheque.'),
  });

  async function cobrar(c: Cheque) {
    const ok = await confirm({
      title: 'Confirmar cobro',
      message: `El cheque ${c.number} por ${money(c.amount)} va a ${c.kind === 'recibido' ? 'sumar' : 'restar'} en ${c.accountName ?? 'la cuenta'}.`,
      confirmLabel: 'Marcar cobrado',
    });
    if (ok) setStatus.mutate({ id: c.id, status: 'cobrado' });
  }

  async function rechazar(c: Cheque) {
    const ok = await confirm({
      title: 'Marcar rechazado',
      message: `El cheque ${c.number} queda como rechazado. No impacta el saldo.`,
      confirmLabel: 'Marcar rechazado',
      destructive: true,
    });
    if (ok) setStatus.mutate({ id: c.id, status: 'rechazado' });
  }

  const cheques = chequesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cheques"
        description="Cheques recibidos de clientes y propios emitidos. Al cobrarlos impactan el saldo de la cuenta."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo cheque'}
          </Button>
        }
      />

      {showForm && <NewChequeForm onDone={() => setShowForm(false)} />}

      {chequesQuery.isLoading ? (
        <TableSkeleton />
      ) : cheques.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No hay cheques cargados"
          description="Cargá un cheque recibido o propio para llevar su seguimiento."
          action={<Button onClick={() => setShowForm(true)}>Cargar el primer cheque</Button>}
        />
      ) : (
        <DataTable
          data={cheques}
          getKey={(c) => c.id}
          getSearchText={(c: Cheque) => `${c.number} ${c.counterparty ?? ''}`}
          searchPlaceholder="Buscar por número o nombre…"
          columns={[
            { key: 'number', header: 'Número', primary: true, render: (c: Cheque) => <span className="font-mono text-xs">{c.number}</span>, sortValue: (c: Cheque) => c.number },
            { key: 'kind', header: 'Tipo', render: (c: Cheque) => KIND_LABEL[c.kind], sortValue: (c: Cheque) => c.kind },
            { key: 'cp', header: 'De / A', render: (c: Cheque) => c.counterparty ?? '—' },
            { key: 'due', header: 'Vence', render: (c: Cheque) => (c.dueDate ? dateFmt(c.dueDate) : '—'), sortValue: (c: Cheque) => (c.dueDate ? new Date(c.dueDate).getTime() : 0) },
            { key: 'amount', header: 'Importe', align: 'right', render: (c: Cheque) => money(c.amount), sortValue: (c: Cheque) => c.amount },
            { key: 'status', header: 'Estado', render: (c: Cheque) => { const b = STATUS_BADGE[c.status]; return <StatusBadge status={b.variant}>{b.label}</StatusBadge>; }, sortValue: (c: Cheque) => c.status },
            {
              key: 'actions', header: '', align: 'right',
              render: (c: Cheque) =>
                c.status === 'en_cartera' ? (
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); cobrar(c); }}>Cobrado</Button>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); rechazar(c); }}>Rechazado</Button>
                  </div>
                ) : <span className="text-xs text-foreground-muted">{STATUS_BADGE[c.status].label}</span>,
            },
          ]}
        />
      )}
    </div>
  );
}
