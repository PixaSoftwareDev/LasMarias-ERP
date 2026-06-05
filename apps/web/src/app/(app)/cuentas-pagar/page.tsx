'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, HandCoins, Plus, Truck } from 'lucide-react';
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
import { suppliersApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/hooks/use-confirm';
import { formatMoney as money, formatDate as dateFmt } from '@/lib/utils';
import type { Payable, PayableStatus, SupplierBalance } from '@lasmarias/shared-schemas';

const today = () => new Date().toISOString().slice(0, 10);

function balanceTone(b: number) {
  if (b > 0.005) return 'text-danger';
  if (b < -0.005) return 'text-primary-700';
  return 'text-foreground-muted';
}

// Estado del comprobante → badge. Vencido (saldo y due_date pasado) se marca en rojo.
function statusBadge(p: Payable): { variant: Status; label: string } {
  const overdue = p.balance > 0.005 && p.dueDate != null && new Date(p.dueDate).getTime() < Date.now();
  if (p.status === 'pagada') return { variant: 'success', label: 'Pagada' };
  if (overdue) return { variant: 'danger', label: 'Vencida' };
  if (p.status === 'parcial') return { variant: 'warning', label: 'Parcial' };
  return { variant: 'neutral', label: 'Pendiente' };
}

const STATUS_LABEL: Record<PayableStatus, string> = { pendiente: 'Pendiente', parcial: 'Parcial', pagada: 'Pagada' };

// --- Alta de proveedor ---
function NewSupplierForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [termDays, setTermDays] = useState('');

  const create = useMutation({
    mutationFn: () =>
      suppliersApi.create({
        name: name.trim(),
        taxId: taxId.trim() || undefined,
        phone: phone.trim() || undefined,
        paymentTermDays: termDays === '' ? null : Number(termDays),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Proveedor creado.');
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo crear el proveedor.'),
  });

  const canSave = name.trim().length > 0 && !create.isPending;

  return (
    <Card>
      <CardHeader><CardTitle>Nuevo proveedor</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="sup-name" required>
            <Input id="sup-name" autoFocus placeholder="Insumos del Sur" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="CUIT" htmlFor="sup-tax" hint="Opcional.">
            <Input id="sup-tax" placeholder="30-12345678-9" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </Field>
          <Field label="Teléfono" htmlFor="sup-phone" hint="Opcional.">
            <Input id="sup-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Plazo de pago (días)" htmlFor="sup-term" hint="Para calcular el vencimiento. Vacío = contado.">
            <Input id="sup-term" type="number" inputMode="numeric" min={0} placeholder="30" value={termDays} onChange={(e) => setTermDays(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>Cancelar</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} loadingText="Creando..." disabled={!canSave}>Crear proveedor</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Alta de comprobante a pagar ---
function NewPayableForm({ supplierId, onDone }: { supplierId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(today());
  const [dueDate, setDueDate] = useState('');

  const create = useMutation({
    mutationFn: () =>
      suppliersApi.createPayable({
        supplierId,
        description: description.trim(),
        amount: Number(amount),
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['payables', supplierId] });
      toast.success('Comprobante cargado.');
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cargar el comprobante.'),
  });

  const canSave = description.trim().length > 0 && Number(amount) > 0 && !create.isPending;

  return (
    <Card>
      <CardHeader><CardTitle>Nuevo comprobante a pagar</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Detalle" htmlFor="pay-desc" required className="sm:col-span-2">
            <Input id="pay-desc" autoFocus placeholder="Factura 0001-00012345 — fermentos" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Monto" htmlFor="pay-amt" required>
            <Input id="pay-amt" type="number" inputMode="decimal" step="0.01" min={0} prefix="$" placeholder="Ej: 85000" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Fecha" htmlFor="pay-occ">
            <Input id="pay-occ" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </Field>
          <Field label="Vencimiento" htmlFor="pay-due" hint="Vacío = según el plazo del proveedor.">
            <Input id="pay-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>Cancelar</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} loadingText="Cargando..." disabled={!canSave}>Cargar comprobante</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Pago de un comprobante ---
function PayForm({ payable, onDone }: { payable: Payable; onDone: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const router = useRouter();
  const [amount, setAmount] = useState(String(payable.balance));
  const [occurredAt, setOccurredAt] = useState(today());
  const [method, setMethod] = useState('');

  const register = useMutation({
    mutationFn: () =>
      suppliersApi.registerPayment({
        payableId: payable.id,
        amount: Number(amount),
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        method: method || undefined,
      }),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ['supplier-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['payables', payable.supplierId] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['cash-movements'] });
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      toast.success(`Pago de ${money(p.amount)} registrado.`, {
        action: { label: 'Ver en caja', onClick: () => router.push('/caja') },
      });
      onDone();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo registrar el pago.'),
  });

  const canSave = Number(amount) > 0 && Number(amount) <= payable.balance + 0.005 && !register.isPending;

  async function handleRegister() {
    const ok = await confirm({
      title: 'Confirmar pago',
      message: `Vas a pagar ${money(Number(amount))} de "${payable.description}". Se descuenta del saldo y queda como egreso en el flujo de caja.`,
      confirmLabel: 'Registrar pago',
    });
    if (ok) register.mutate();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Pagar — {payable.description}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground-muted">Saldo del comprobante: <span className="font-semibold text-foreground">{money(payable.balance)}</span></p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Monto" htmlFor="pf-amt" required>
            <Input id="pf-amt" autoFocus type="number" inputMode="decimal" step="0.01" min={0} prefix="$" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Fecha" htmlFor="pf-date">
            <Input id="pf-date" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </Field>
          <Field label="Método" htmlFor="pf-method" hint="Efectivo, transferencia, cheque…">
            <Input id="pf-method" placeholder="Transferencia" value={method} onChange={(e) => setMethod(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>Cancelar</Button>
          <Button onClick={handleRegister} loading={register.isPending} loadingText="Registrando..." disabled={!canSave}>
            <HandCoins className="h-4 w-4" /> Registrar pago
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Detalle de un proveedor: comprobantes + acciones ---
function SupplierDetail({ supplierId, supplierName, balance, onBack }: { supplierId: string; supplierName: string; balance: number; onBack: () => void }) {
  const [showNew, setShowNew] = useState(false);
  const [paying, setPaying] = useState<Payable | null>(null);
  const payablesQuery = useQuery({ queryKey: ['payables', supplierId], queryFn: () => suppliersApi.payables(supplierId) });
  const label = balance > 0.005 ? 'Le debés' : balance < -0.005 ? 'A favor' : 'Al día';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Volver a proveedores
        </Button>
        <Button onClick={() => { setShowNew((s) => !s); setPaying(null); }}>
          <Plus className="h-4 w-4" /> {showNew ? 'Cerrar' : 'Nuevo comprobante'}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-base font-medium text-foreground">{supplierName}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-foreground-muted">Saldo</p>
          <div className="flex items-baseline gap-3">
            <p className={`font-display text-3xl font-bold tracking-tight ${balanceTone(balance)}`}>{money(balance)}</p>
            <span className="text-sm text-foreground-muted">{label}</span>
          </div>
        </CardContent>
      </Card>

      {showNew && <NewPayableForm supplierId={supplierId} onDone={() => setShowNew(false)} />}
      {paying && <PayForm payable={paying} onDone={() => setPaying(null)} />}

      {payablesQuery.isLoading ? (
        <TableSkeleton rows={5} />
      ) : (
        <DataTable
          data={payablesQuery.data ?? []}
          getKey={(p) => p.id}
          emptyText="Este proveedor no tiene comprobantes cargados."
          columns={[
            { key: 'desc', header: 'Detalle', primary: true, render: (p: Payable) => p.description, sortValue: (p: Payable) => p.description },
            { key: 'date', header: 'Fecha', secondary: true, render: (p: Payable) => dateFmt(p.occurredAt), sortValue: (p: Payable) => new Date(p.occurredAt).getTime() },
            { key: 'due', header: 'Vence', render: (p: Payable) => (p.dueDate ? dateFmt(p.dueDate) : '—'), sortValue: (p: Payable) => (p.dueDate ? new Date(p.dueDate).getTime() : 0) },
            { key: 'amount', header: 'Monto', align: 'right', render: (p: Payable) => money(p.amount), sortValue: (p: Payable) => p.amount },
            { key: 'balance', header: 'Saldo', align: 'right', render: (p: Payable) => <span className={`font-semibold ${balanceTone(p.balance)}`}>{money(p.balance)}</span>, sortValue: (p: Payable) => p.balance },
            { key: 'status', header: 'Estado', render: (p: Payable) => { const b = statusBadge(p); return <StatusBadge status={b.variant}>{b.label}</StatusBadge>; }, sortValue: (p: Payable) => p.status },
            {
              key: 'actions', header: '', align: 'right',
              render: (p: Payable) =>
                p.balance > 0.005 ? (
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setPaying(p); setShowNew(false); }}>
                    <HandCoins className="h-4 w-4" /> Pagar
                  </Button>
                ) : <span className="text-xs text-foreground-muted">{STATUS_LABEL[p.status]}</span>,
            },
          ]}
        />
      )}
    </div>
  );
}

export default function CuentasPagarPage() {
  const [selected, setSelected] = useState<SupplierBalance | null>(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const accountsQuery = useQuery({ queryKey: ['supplier-accounts'], queryFn: () => suppliersApi.accounts() });
  const accounts = accountsQuery.data ?? [];

  if (selected) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Cuentas por pagar" description="Comprobantes a pagar de tus proveedores de insumos." />
        <FinanceTabs />
        <SupplierDetail
          supplierId={selected.supplierId}
          supplierName={selected.supplierName}
          balance={selected.balance}
          onBack={() => setSelected(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cuentas por pagar"
        description="Lo que le debés a cada proveedor de insumos (fermento, sal, envases) y los pagos que hacés."
        action={
          <Button onClick={() => setShowNewSupplier((s) => !s)}>
            <Plus className="h-4 w-4" /> {showNewSupplier ? 'Cerrar' : 'Nuevo proveedor'}
          </Button>
        }
      />
      <FinanceTabs />

      {showNewSupplier && <NewSupplierForm onDone={() => setShowNewSupplier(false)} />}

      {accountsQuery.isLoading ? (
        <TableSkeleton />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No hay proveedores cargados"
          description="Cargá un proveedor de insumos y sus comprobantes para ver acá lo que les debés."
          action={<Button onClick={() => setShowNewSupplier(true)}>Cargar el primer proveedor</Button>}
        />
      ) : (
        <DataTable
          data={accounts}
          getKey={(a) => a.supplierId}
          onRowClick={(a) => setSelected(a)}
          getSearchText={(a: SupplierBalance) => a.supplierName}
          searchPlaceholder="Buscar proveedor…"
          columns={[
            { key: 'name', header: 'Proveedor', primary: true, render: (a: SupplierBalance) => a.supplierName, sortValue: (a: SupplierBalance) => a.supplierName },
            { key: 'owed', header: 'Total', align: 'right', render: (a: SupplierBalance) => money(a.totalOwed), sortValue: (a: SupplierBalance) => a.totalOwed },
            { key: 'paid', header: 'Pagado', align: 'right', render: (a: SupplierBalance) => money(a.totalPaid), sortValue: (a: SupplierBalance) => a.totalPaid },
            { key: 'overdue', header: 'Vencido', align: 'right', render: (a: SupplierBalance) => a.overdue > 0.005 ? <span className="font-medium text-danger">{money(a.overdue)}</span> : '—', sortValue: (a: SupplierBalance) => a.overdue },
            { key: 'balance', header: 'Le debés', align: 'right', sortValue: (a: SupplierBalance) => a.balance, render: (a: SupplierBalance) => <span className={`font-semibold ${balanceTone(a.balance)}`}>{money(a.balance)}</span> },
          ]}
        />
      )}
    </div>
  );
}
