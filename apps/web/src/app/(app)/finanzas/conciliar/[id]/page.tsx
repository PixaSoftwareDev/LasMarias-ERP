'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  Landmark,
  Plus,
  Square,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { financeApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatMoney as money, formatDate as dateFmt } from '@/lib/utils';
import type { CashMovement } from '@lasmarias/shared-schemas';

const SELECT_CLASS =
  'min-h-touch rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

function parseMoney(val: string): number {
  return parseFloat(val.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
}

export default function ConciliarPage({ params }: { params: { id: string } }) {
  const { id: accountId } = params;
  const queryClient = useQueryClient();

  // Saldo que el usuario tipea del homebanking
  const [bankBalanceStr, setBankBalanceStr] = useState('');
  // Movimientos seleccionados para marcar como conciliados en lote
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Quick-add inline
  const [quickKind, setQuickKind] = useState<'income' | 'expense'>('expense');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickAmount, setQuickAmount] = useState('');

  const accountsQuery = useQuery({
    queryKey: ['finance-accounts'],
    queryFn: () => financeApi.accounts(),
  });

  const unreconciledQuery = useQuery({
    queryKey: ['unreconciled', accountId],
    queryFn: () => financeApi.unreconciledMovements(accountId),
  });

  const reconcileMutation = useMutation({
    mutationFn: ({ id, reconciled }: { id: string; reconciled: boolean }) =>
      financeApi.reconcileMovement(id, reconciled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unreconciled', accountId] });
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo actualizar.'),
  });

  const addMovement = useMutation({
    mutationFn: () =>
      financeApi.createCashMovement({
        kind: quickKind,
        amount: parseMoney(quickAmount),
        category: quickDesc.trim() || (quickKind === 'income' ? 'Ingreso bancario' : 'Gasto bancario'),
        accountId,
        reconciled: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unreconciled', accountId] });
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      setQuickDesc('');
      setQuickAmount('');
      toast.success('Movimiento agregado y marcado como conciliado.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo agregar.'),
  });

  const account = accountsQuery.data?.find((a) => a.id === accountId);
  const movements = unreconciledQuery.data ?? [];

  // Saldo sistema = saldo de la cuenta (ya calculado por el backend = opening + todos los movimientos)
  const systemBalance = account?.balance ?? 0;
  const bankBalance = parseMoney(bankBalanceStr);
  const hasBankBalance = bankBalanceStr.trim().length > 0;
  const difference = hasBankBalance ? bankBalance - systemBalance : null;
  const isReconciled = difference !== null && Math.abs(difference) < 0.01;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === movements.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(movements.map((m) => m.id)));
    }
  }

  async function markSelectedReconciled() {
    for (const id of selected) {
      await reconcileMutation.mutateAsync({ id, reconciled: true });
    }
    setSelected(new Set());
    toast.success(`${selected.size} movimiento${selected.size !== 1 ? 's' : ''} conciliado${selected.size !== 1 ? 's' : ''}.`);
  }

  const canAdd = parseMoney(quickAmount) > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <Link
          href="/caja"
          className="flex items-center gap-1.5 text-sm font-medium text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Caja y Bancos
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <Landmark className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Conciliando: {account?.name ?? '…'}
          </h1>
          <p className="text-sm text-foreground-muted">
            Abrí el homebanking en otra pestaña y comparalo con el sistema
          </p>
        </div>
      </div>

      {/* Panel de diferencia — el corazón de la pantalla */}
      <div
        className={`grid grid-cols-1 gap-4 rounded-2xl border-2 p-5 sm:grid-cols-3 ${
          isReconciled
            ? 'border-primary-300 bg-primary-50'
            : hasBankBalance
            ? 'border-red-200 bg-red-50'
            : 'border-border-subtle bg-surface-elevated'
        }`}
      >
        {/* Saldo banco */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Saldo en el banco
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground-muted">$</span>
            <input
              type="text"
              inputMode="decimal"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 font-display text-2xl font-bold text-foreground placeholder-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary-600"
              placeholder="0,00"
              value={bankBalanceStr}
              onChange={(e) => setBankBalanceStr(e.target.value)}
            />
          </div>
          <p className="text-xs text-foreground-muted">Copialo del homebanking</p>
        </div>

        {/* Saldo sistema */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Saldo en el sistema
          </p>
          <p
            className={`font-display text-3xl font-bold ${
              systemBalance < 0 ? 'text-danger' : 'text-foreground'
            }`}
          >
            {money(systemBalance)}
          </p>
          <p className="text-xs text-foreground-muted">Calculado automáticamente</p>
        </div>

        {/* Diferencia */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Diferencia
          </p>
          {!hasBankBalance ? (
            <p className="font-display text-3xl font-bold text-foreground-muted">—</p>
          ) : isReconciled ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-7 w-7 text-primary-600" />
              <span className="font-display text-2xl font-bold text-primary-700">¡Cuadra!</span>
            </div>
          ) : (
            <p className="font-display text-3xl font-bold text-danger">
              {difference! > 0 ? '+' : ''}
              {money(difference!)}
            </p>
          )}
          {hasBankBalance && !isReconciled && (
            <p className="text-xs text-danger">
              {difference! > 0
                ? 'El banco tiene más — falta registrar ingresos en el sistema'
                : 'El sistema tiene más — falta registrar gastos o hay movimientos de más'}
            </p>
          )}
          {isReconciled && (
            <p className="text-xs text-primary-700">Los saldos coinciden exactamente</p>
          )}
        </div>
      </div>

      {/* Quick-add: agregar lo que está en el banco y falta en el sistema */}
      <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">
          Agregar movimiento que ves en el banco y no está en el sistema
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {/* Toggle ingreso/gasto */}
          <div className="flex overflow-hidden rounded-lg border border-border bg-secondary-50">
            <button
              type="button"
              onClick={() => setQuickKind('income')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                quickKind === 'income'
                  ? 'bg-primary-600 text-white'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" /> Ingreso
            </button>
            <button
              type="button"
              onClick={() => setQuickKind('expense')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                quickKind === 'expense'
                  ? 'bg-danger text-white'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              <TrendingDown className="h-3.5 w-3.5" /> Gasto
            </button>
          </div>

          <div className="flex-1 min-w-[160px]">
            <Input
              placeholder="Descripción (ej: comisión bancaria)"
              value={quickDesc}
              onChange={(e) => setQuickDesc(e.target.value)}
            />
          </div>

          <div className="w-36">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              prefix="$"
              placeholder="Monto"
              value={quickAmount}
              onChange={(e) => setQuickAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAdd) addMovement.mutate();
              }}
            />
          </div>

          <Button
            onClick={() => addMovement.mutate()}
            loading={addMovement.isPending}
            loadingText="Agregando..."
            disabled={!canAdd}
          >
            <Plus className="h-4 w-4" /> Agregar y conciliar
          </Button>
        </div>
        <p className="mt-2 text-xs text-foreground-muted">
          Los movimientos agregados desde acá quedan marcados como conciliados automáticamente.
        </p>
      </div>

      {/* Lista de movimientos pendientes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Pendientes de verificar
            </h2>
            <p className="text-sm text-foreground-muted">
              {movements.length === 0
                ? 'Todos los movimientos están conciliados'
                : `${movements.length} movimiento${movements.length !== 1 ? 's' : ''} sin verificar contra el banco`}
            </p>
          </div>
          {selected.size > 0 && (
            <Button
              onClick={markSelectedReconciled}
              loading={reconcileMutation.isPending}
              loadingText="Conciliando..."
            >
              <CheckSquare className="h-4 w-4" /> Marcar {selected.size} como conciliado{selected.size !== 1 ? 's' : ''}
            </Button>
          )}
        </div>

        {unreconciledQuery.isLoading ? (
          <TableSkeleton />
        ) : movements.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No hay movimientos pendientes"
            description="Todos los movimientos de esta cuenta están conciliados."
          />
        ) : (
          <>
            {/* Seleccionar todos */}
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-2 text-sm font-medium text-foreground-muted hover:text-foreground"
            >
              {selected.size === movements.length ? (
                <CheckSquare className="h-4 w-4 text-primary-600" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {selected.size === movements.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>

            <div className="space-y-2">
              {movements.map((m) => (
                <MovementRow
                  key={m.id}
                  movement={m}
                  selected={selected.has(m.id)}
                  onToggle={() => toggleSelect(m.id)}
                  onReconcile={() => reconcileMutation.mutate({ id: m.id, reconciled: true })}
                  loading={reconcileMutation.isPending}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Cerrar conciliación */}
      {isReconciled && (
        <div className="rounded-xl border-2 border-primary-300 bg-primary-50 p-5 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-primary-600" />
          <p className="font-display text-lg font-bold text-primary-700">¡Los saldos cuadran!</p>
          <p className="mb-4 text-sm text-primary-600">
            El saldo del sistema coincide con el saldo del banco.
          </p>
          <Link href="/caja">
            <Button>Volver a Caja y Bancos</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

// Fila de movimiento con checkbox y botón de conciliar individual
function MovementRow({
  movement,
  selected,
  onToggle,
  onReconcile,
  loading,
}: {
  movement: CashMovement;
  selected: boolean;
  onToggle: () => void;
  onReconcile: () => void;
  loading: boolean;
}) {
  const isIncome = movement.kind === 'income';
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
        selected
          ? 'border-primary-300 bg-primary-50'
          : 'border-border-subtle bg-surface-elevated hover:border-border'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex-shrink-0 text-foreground-muted hover:text-primary-600"
        aria-label={selected ? 'Deseleccionar' : 'Seleccionar'}
      >
        {selected ? (
          <CheckSquare className="h-5 w-5 text-primary-600" />
        ) : (
          <Square className="h-5 w-5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={isIncome ? 'success' : 'danger'}>
            {isIncome ? 'Ingreso' : 'Gasto'}
          </StatusBadge>
          <span className="text-sm font-medium text-foreground truncate">{movement.category}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-foreground-muted">
          <span>{dateFmt(movement.occurredAt)}</span>
          {movement.notes && <span>· {movement.notes}</span>}
        </div>
      </div>

      <span
        className={`flex-shrink-0 font-display text-lg font-bold ${
          isIncome ? 'text-primary-700' : 'text-danger'
        }`}
      >
        {isIncome ? '+' : '−'}{money(movement.amount)}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={onReconcile}
        disabled={loading}
        className="flex-shrink-0 text-foreground-muted hover:text-primary-700"
        title="Marcar como conciliado"
      >
        <CheckCircle2 className="h-5 w-5" />
      </Button>
    </div>
  );
}
