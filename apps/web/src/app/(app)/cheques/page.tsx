'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Plus,
  ScrollText,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/page-header';
import { FinanceTabs } from '@/components/finance-tabs';
import { TableSkeleton } from '@/components/ui/skeleton';
import { financeApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatMoney as money, formatDate as dateFmt } from '@/lib/utils';
import { CHEQUE_REJECTION_REASONS } from '@lasmarias/shared-schemas';
import type { Cheque, ChequeKind, ChequeStatus } from '@lasmarias/shared-schemas';

const SELECT_CLASS =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

const KIND_LABEL: Record<ChequeKind, string> = { recibido: 'Recibido', propio: 'Propio' };
const STATUS_BADGE: Record<ChequeStatus, { variant: Status; label: string }> = {
  en_cartera: { variant: 'warning', label: 'En cartera' },
  cobrado: { variant: 'success', label: 'Cobrado' },
  rechazado: { variant: 'danger', label: 'Rechazado' },
};

// --- Drawer de detalle de cheque ---
function ChequeDetailDrawer({ cheque, onClose }: { cheque: Cheque; onClose: () => void }) {
  const isRecibido = cheque.kind === 'recibido';
  const isRechazado = cheque.status === 'rechazado';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/30"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-sm flex-col bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              Cheque
            </p>
            <p className="font-display text-xl font-bold text-foreground">#{cheque.number}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-secondary-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Monto y estado */}
          <div className="flex items-center justify-between rounded-xl bg-secondary-50 px-4 py-4">
            <span className="font-display text-3xl font-bold text-foreground">
              {money(cheque.amount)}
            </span>
            <StatusBadge status={STATUS_BADGE[cheque.status].variant}>
              {STATUS_BADGE[cheque.status].label}
            </StatusBadge>
          </div>

          {/* Alerta de rechazo */}
          {isRechazado && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-danger">
                <XCircle className="h-5 w-5 flex-shrink-0" />
                <span className="font-semibold">Cheque rechazado</span>
              </div>
              {cheque.rejectionReason && (
                <p className="mb-3 text-sm text-danger">
                  <span className="font-medium">Motivo:</span> {cheque.rejectionReason}
                </p>
              )}
              {cheque.counterparty && isRecibido && (
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                    Para reclamar
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <User className="h-4 w-4 text-foreground-muted" />
                    {cheque.counterparty}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Datos del cheque */}
          <div className="space-y-3">
            <Row
              icon={<ScrollText className="h-4 w-4" />}
              label="Tipo"
              value={isRecibido ? 'Recibido de cliente' : 'Propio (emitido)'}
            />
            {cheque.counterparty && (
              <Row
                icon={<User className="h-4 w-4" />}
                label={isRecibido ? 'De quién' : 'A quién'}
                value={cheque.counterparty}
                highlight
              />
            )}
            {cheque.dueDate && (
              <Row
                icon={<Calendar className="h-4 w-4" />}
                label="Vencimiento"
                value={dateFmt(cheque.dueDate)}
              />
            )}
            {cheque.accountName && (
              <Row
                icon={<ArrowRight className="h-4 w-4" />}
                label={isRecibido ? 'Se acredita en' : 'Débito en'}
                value={cheque.accountName}
              />
            )}
            <Row
              icon={<Calendar className="h-4 w-4" />}
              label="Cargado el"
              value={dateFmt(cheque.createdAt)}
            />
          </div>

          {/* Flujo de trazabilidad */}
          {cheque.counterparty && (
            <div className="rounded-xl border border-border-subtle bg-secondary-50/50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Trazabilidad
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded bg-white px-2 py-1 font-medium shadow-sm">
                  {isRecibido ? cheque.counterparty : 'Nosotros'}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-foreground-muted" />
                <span className="rounded bg-white px-2 py-1 font-medium shadow-sm">
                  {isRecibido ? 'Nosotros' : cheque.counterparty}
                </span>
                {cheque.accountName && (
                  <>
                    <ArrowRight className="h-3.5 w-3.5 text-foreground-muted" />
                    <span className="rounded bg-white px-2 py-1 font-medium shadow-sm">
                      {cheque.accountName}
                    </span>
                  </>
                )}
              </div>
              {isRechazado && isRecibido && cheque.counterparty && (
                <p className="mt-3 text-xs text-foreground-muted">
                  ⚠ El cheque fue rechazado. Podés reclamarle a{' '}
                  <span className="font-semibold text-foreground">{cheque.counterparty}</span>.
                </p>
              )}
            </div>
          )}

          {cheque.notes && (
            <div className="rounded-xl border border-border-subtle bg-secondary-50/50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Notas
              </p>
              <p className="text-sm text-foreground">{cheque.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-secondary-50 text-foreground-muted">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-foreground-muted">{label}</p>
        <p className={`text-sm font-medium ${highlight ? 'text-foreground' : 'text-foreground'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

// --- Modal de motivo de rechazo ---
function RejectionModal({
  cheque,
  onConfirm,
  onClose,
}: {
  cheque: Cheque;
  onConfirm: (reason: string, notes: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [otherText, setOtherText] = useState('');
  const [notes, setNotes] = useState('');

  const finalReason = reason === 'Otro' ? otherText.trim() : reason;
  const canConfirm = finalReason.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-danger">
              <XCircle className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Cheque rechazado
              </h2>
              <p className="text-sm text-foreground-muted">
                #{cheque.number} · {money(cheque.amount)}
                {cheque.counterparty && ` · ${cheque.kind === 'recibido' ? 'De' : 'A'}: ${cheque.counterparty}`}
              </p>
            </div>
          </div>
        </div>

        {/* Motivos */}
        <div className="px-5 py-4">
          <p className="mb-3 text-sm font-semibold text-foreground">¿Cuál fue el motivo?</p>
          <div className="space-y-2">
            {CHEQUE_REJECTION_REASONS.map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                  reason === r
                    ? 'border-danger bg-red-50'
                    : 'border-border-subtle bg-surface-elevated hover:border-border'
                }`}
              >
                <input
                  type="radio"
                  name="rejection-reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-red-600"
                />
                <span className="text-sm text-foreground">{r}</span>
              </label>
            ))}
          </div>

          {reason === 'Otro' && (
            <Input
              className="mt-3"
              autoFocus
              placeholder="Describí el motivo…"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
            />
          )}

          <Field label="Notas adicionales" htmlFor="rej-notes" hint="Opcional." className="mt-4">
            <Input
              id="rej-notes"
              placeholder="Ej: banco comunicó rechazo el 09/06"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        {/* Acciones */}
        <div className="flex gap-2 border-t border-border-subtle px-5 py-4">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(finalReason, notes)}
            disabled={!canConfirm}
            className="flex-1 bg-danger text-white hover:bg-red-700"
          >
            <AlertTriangle className="h-4 w-4" /> Confirmar rechazo
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Formulario de nuevo cheque ---
function NewChequeForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ['finance-accounts'], queryFn: () => financeApi.accounts() });
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
      <CardHeader>
        <CardTitle>Nuevo cheque</CardTitle>
      </CardHeader>
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
          <Field label={kind === 'recibido' ? 'De quién' : 'A quién'} htmlFor="ch-cp" hint="Para trazabilidad.">
            <Input id="ch-cp" placeholder={kind === 'recibido' ? 'Nombre del cliente' : 'Nombre del proveedor'} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>Cancelar</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} loadingText="Cargando..." disabled={!canSave}>
            Cargar cheque
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Página principal ---
export default function ChequesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [detailCheque, setDetailCheque] = useState<Cheque | null>(null);
  const [rejectionCheque, setRejectionCheque] = useState<Cheque | null>(null);

  const chequesQuery = useQuery({ queryKey: ['cheques'], queryFn: () => financeApi.cheques() });

  const setStatus = useMutation({
    mutationFn: (vars: { id: string; status: ChequeStatus; rejectionReason?: string; notes?: string }) =>
      financeApi.updateChequeStatus(vars.id, {
        status: vars.status,
        rejectionReason: vars.rejectionReason,
        notes: vars.notes,
      }),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] });
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      if (c.status === 'cobrado') {
        toast.success(`Cheque cobrado — impactó el saldo de ${c.accountName ?? 'la cuenta'}.`);
      } else if (c.status === 'rechazado') {
        toast.success('Cheque marcado como rechazado.');
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo actualizar el cheque.'),
  });

  function cobrar(c: Cheque) {
    setStatus.mutate({ id: c.id, status: 'cobrado' });
  }

  function handleRejection(reason: string, notes: string) {
    if (!rejectionCheque) return;
    setStatus.mutate({
      id: rejectionCheque.id,
      status: 'rechazado',
      rejectionReason: reason,
      notes: notes || undefined,
    });
    setRejectionCheque(null);
  }

  const cheques = chequesQuery.data ?? [];

  // Estadísticas rápidas
  const enCartera = cheques.filter((c) => c.status === 'en_cartera');
  const totalEnCartera = enCartera.reduce((s, c) => s + c.amount, 0);
  const rechazados = cheques.filter((c) => c.status === 'rechazado');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cheques"
        description="Cheques recibidos de clientes y propios emitidos."
        action={
          <Button onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-4 w-4" /> {showForm ? 'Cerrar' : 'Nuevo cheque'}
          </Button>
        }
      />

      <FinanceTabs />

      {/* Resumen rápido */}
      {cheques.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <ScrollText className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">En cartera</span>
              <span className="block font-display text-xl font-bold text-foreground">{money(totalEnCartera)}</span>
              <span className="text-xs text-foreground-muted">{enCartera.length} cheque{enCartera.length !== 1 ? 's' : ''}</span>
            </span>
          </div>
          {rechazados.length > 0 && (
            <div className="flex flex-1 items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-danger">
                <XCircle className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[11px] uppercase tracking-wide text-danger/70">Rechazados</span>
                <span className="block font-display text-xl font-bold text-danger">
                  {rechazados.length} cheque{rechazados.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-danger/70">Revisá la trazabilidad para reclamar</span>
              </span>
            </div>
          )}
          {rechazados.length === 0 && (
            <div className="flex flex-1 items-center gap-3 rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[11px] uppercase tracking-wide text-primary-700/70">Sin rechazados</span>
                <span className="block font-display text-xl font-bold text-primary-700">Todo en orden</span>
              </span>
            </div>
          )}
        </div>
      )}

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
          onRowClick={(c) => setDetailCheque(c)}
          columns={[
            {
              key: 'number',
              header: 'Número',
              primary: true,
              render: (c: Cheque) => (
                <div>
                  <span className="font-mono text-sm font-semibold">#{c.number}</span>
                  {c.counterparty && (
                    <span className="block text-xs text-foreground-muted">{c.counterparty}</span>
                  )}
                </div>
              ),
              sortValue: (c: Cheque) => c.number,
            },
            {
              key: 'kind',
              header: 'Tipo',
              render: (c: Cheque) => KIND_LABEL[c.kind],
              sortValue: (c: Cheque) => c.kind,
            },
            {
              key: 'due',
              header: 'Vence',
              secondary: true,
              render: (c: Cheque) => (c.dueDate ? dateFmt(c.dueDate) : '—'),
              sortValue: (c: Cheque) => (c.dueDate ? new Date(c.dueDate).getTime() : 0),
            },
            {
              key: 'amount',
              header: 'Importe',
              align: 'right',
              render: (c: Cheque) => money(c.amount),
              sortValue: (c: Cheque) => c.amount,
            },
            {
              key: 'status',
              header: 'Estado',
              render: (c: Cheque) => {
                const b = STATUS_BADGE[c.status];
                return (
                  <div>
                    <StatusBadge status={b.variant}>{b.label}</StatusBadge>
                    {c.status === 'rechazado' && c.rejectionReason && (
                      <span className="block text-xs text-foreground-muted">{c.rejectionReason}</span>
                    )}
                  </div>
                );
              },
              sortValue: (c: Cheque) => c.status,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (c: Cheque) =>
                c.status === 'en_cartera' ? (
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); cobrar(c); }}
                      disabled={setStatus.isPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary-600" /> Cobrado
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setRejectionCheque(c); }}
                      disabled={setStatus.isPending}
                      className="text-danger hover:text-danger"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Rechazado
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-foreground-muted">
                    {STATUS_BADGE[c.status].label}
                  </span>
                ),
            },
          ]}
        />
      )}

      {/* Drawer de detalle */}
      {detailCheque && (
        <ChequeDetailDrawer
          cheque={detailCheque}
          onClose={() => setDetailCheque(null)}
        />
      )}

      {/* Modal de rechazo */}
      {rejectionCheque && (
        <RejectionModal
          cheque={rejectionCheque}
          onConfirm={handleRejection}
          onClose={() => setRejectionCheque(null)}
        />
      )}
    </div>
  );
}
