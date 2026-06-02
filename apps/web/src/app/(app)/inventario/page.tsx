'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeftRight,
  Box,
  Boxes,
  ClipboardCheck,
  Droplets,
  FlaskConical,
  Layers,
  Milk,
  Package,
  PackageX,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { RowActions } from '@/components/ui/row-actions';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { inventoryApi, productsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { labelOr, movementReasonLabel, movementTypeLabel } from '@/lib/labels';
import type { StockSummary, DiscardReason } from '@lasmarias/shared-schemas';

type AdjustMode = 'discard' | 'count';

function alertBadge(level?: StockSummary['alertLevel']): { variant: Status; label: string } {
  switch (level) {
    case 'critical': return { variant: 'danger', label: 'Vencido' };
    case 'expiring': return { variant: 'warning', label: 'Por vencer' };
    case 'low': return { variant: 'warning', label: 'Stock bajo' };
    default: return { variant: 'success', label: 'OK' };
  }
}

const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

// Metadata de cada categoría para agrupar y dar identidad visual al inventario.
const CATEGORY_META: Record<string, { label: string; icon: LucideIcon; tone: string; order: number }> = {
  materia_prima: { label: 'Materia prima', icon: Milk, tone: 'bg-secondary-50 text-secondary-700', order: 1 },
  intermedio: { label: 'En proceso', icon: Layers, tone: 'bg-amber-50 text-amber-700', order: 2 },
  queso: { label: 'Productos terminados', icon: Package, tone: 'bg-primary-50 text-primary-700', order: 3 },
  subproducto: { label: 'Subproductos', icon: Droplets, tone: 'bg-sky-50 text-sky-700', order: 4 },
  insumo: { label: 'Insumos', icon: FlaskConical, tone: 'bg-violet-50 text-violet-700', order: 5 },
  envase: { label: 'Envases', icon: Box, tone: 'bg-slate-100 text-slate-700', order: 6 },
};
const FALLBACK_META = { label: 'Otros', icon: Boxes, tone: 'bg-surface-subtle text-foreground-muted', order: 9 };
const metaFor = (cat?: string) => (cat && CATEGORY_META[cat]) || FALLBACK_META;

// --- Chip de resumen (lenguaje del Home) ---
const CHIP_TONE = {
  primary: 'bg-primary-50 text-primary-700',
  amber: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
} as const;

function SummaryChip({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: keyof typeof CHIP_TONE }) {
  return (
    <div className="flex min-w-[11rem] flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${CHIP_TONE[tone]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">{label}</span>
        <span className="block font-display text-lg font-bold tracking-tight text-foreground">{value}</span>
      </span>
    </div>
  );
}

function ChipSkeleton() {
  return <div className="h-[60px] min-w-[11rem] flex-1 animate-pulse rounded-lg bg-surface-subtle" />;
}

// --- Card de un ítem de stock ---
function StockCard({ s, icon: Icon, tone, onAction }: { s: StockSummary; icon: LucideIcon; tone: string; onAction?: (mode: AdjustMode, s: StockSummary) => void }) {
  const noStock = s.totalQuantity <= 0;
  const b: { variant: Status; label: string } = noStock ? { variant: 'danger', label: 'Sin stock' } : alertBadge(s.alertLevel);
  const showBar = typeof s.minStock === 'number' && s.minStock > 0;
  const pct = showBar ? Math.min(100, (s.totalQuantity / (s.minStock as number)) * 100) : 0;
  const barColor = noStock || s.alertLevel === 'critical' ? 'bg-red-500' : s.alertLevel === 'low' ? 'bg-amber-500' : 'bg-primary-600';
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tone}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{s.productName}</p>
            {s.sku && s.sku !== '—' && <p className="font-mono text-xs text-foreground-muted">{s.sku}</p>}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <StatusBadge status={b.variant}>{b.label}</StatusBadge>
          {onAction && s.productId !== 'leche-cruda' && (
            <RowActions
              label={`Acciones de ${s.productName}`}
              actions={[
                { label: 'Ajustar por conteo', icon: ClipboardCheck, onClick: () => onAction('count', s) },
                { label: 'Dar de baja', icon: Trash2, onClick: () => onAction('discard', s), destructive: true },
              ]}
            />
          )}
        </div>
      </div>

      <p className="font-display text-2xl font-bold tracking-tight text-foreground">
        {num(s.totalQuantity)} <span className="text-base font-normal text-foreground-muted">{s.unit}</span>
      </p>

      {showBar && (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-foreground-muted">mínimo: {num(s.minStock as number)} {s.unit}</p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
        {s.warehouses && s.warehouses.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {s.warehouses.map((w) => (
              <span key={w} className="inline-flex items-center rounded-md bg-surface-subtle px-2 py-0.5 text-foreground">{w}</span>
            ))}
          </span>
        )}
        {s.batchCount > 0 && <span>{s.batchCount} lote{s.batchCount === 1 ? '' : 's'}</span>}
        {s.nearestExpiration && <span>vence {new Date(s.nearestExpiration).toLocaleDateString('es-AR')}</span>}
      </div>
    </Card>
  );
}

// --- Formulario de ingreso de stock (insumos/envases) ---
function StockEntryForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: () => inventoryApi.listWarehouses() });

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  // Se ingresan a mano: insumos, envases y materia prima (no productos terminados).
  const entryProducts = useMemo(
    () => (productsQuery.data ?? []).filter((p) => ['insumo', 'envase', 'materia_prima'].includes(p.category) && p.isActive),
    [productsQuery.data],
  );

  const save = useMutation({
    mutationFn: () =>
      inventoryApi.addStockEntry({
        productId,
        quantity: Number(quantity),
        unitCost: unitCost ? Number(unitCost) : undefined,
        warehouseId: warehouseId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['inv-movements'] });
      toast.success('Stock ingresado.');
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo ingresar el stock.'),
  });

  const canSave = !!productId && Number(quantity) > 0 && !save.isPending;

  return (
    <Card>
      <CardHeader><CardTitle>Ingresar stock</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Insumo / envase" htmlFor="entry-product" required>
            <select
              id="entry-product"
              className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Elegí un producto</option>
              {entryProducts.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
              ))}
            </select>
          </Field>
          <Field label="Cantidad" htmlFor="entry-qty" required>
            <Input id="entry-qty" type="number" inputMode="decimal" step="0.01" min={0} placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Costo unitario ($)" htmlFor="entry-cost" hint="Opcional.">
            <Input id="entry-cost" type="number" inputMode="decimal" step="0.01" min={0} placeholder="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </Field>
          <Field label="Cámara / sector" htmlFor="entry-wh" hint="Opcional.">
            <select
              id="entry-wh"
              className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">Sin asignar</option>
              {(warehousesQuery.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} loadingText="Guardando..." disabled={!canSave}>
            <Plus className="h-4 w-4" /> Ingresar
          </Button>
        </div>
        {entryProducts.length === 0 && !productsQuery.isLoading && (
          <p className="text-xs text-foreground-muted">No hay insumos/envases cargados. Creálos primero en Datos maestros → Productos.</p>
        )}
      </CardContent>
    </Card>
  );
}

const DISCARD_REASONS: { value: DiscardReason; label: string }[] = [
  { value: 'vencido', label: 'Vencido' },
  { value: 'merma', label: 'Merma' },
  { value: 'descarte', label: 'Descarte' },
  { value: 'rotura', label: 'Rotura' },
];

const SELECT_CLASS =
  'min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

// Modal de "Dar de baja" (descarte/merma) o "Ajustar por conteo" sobre un ítem.
function AdjustDialog({ s, mode, onClose }: { s: StockSummary; mode: AdjustMode; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<DiscardReason>('vencido');
  const [counted, setCounted] = useState(String(s.totalQuantity));
  const [notes, setNotes] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === 'discard') {
        await inventoryApi.discardStock({ productId: s.productId, quantity: Number(quantity), reason, notes: notes || undefined });
      } else {
        await inventoryApi.countAdjust({ productId: s.productId, countedQuantity: Number(counted), notes: notes || undefined });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['inv-movements'] });
      toast.success(mode === 'discard' ? 'Stock dado de baja.' : 'Stock ajustado al conteo.');
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo registrar el ajuste.'),
  });

  const canSave =
    mode === 'discard'
      ? Number(quantity) > 0 && Number(quantity) <= s.totalQuantity && !mut.isPending
      : counted !== '' && Number(counted) >= 0 && !mut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>{mode === 'discard' ? 'Dar de baja' : 'Ajustar por conteo'} — {s.productName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground-muted">
            Stock actual: <span className="font-medium text-foreground">{num(s.totalQuantity)} {s.unit}</span>
          </p>
          {mode === 'discard' ? (
            <>
              <Field label={`Cantidad a dar de baja (${s.unit})`} htmlFor="adj-qty" required>
                <Input id="adj-qty" type="number" inputMode="decimal" step="0.01" min={0} max={s.totalQuantity} placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Field>
              <Field label="Motivo" htmlFor="adj-reason" required>
                <select id="adj-reason" className={SELECT_CLASS} value={reason} onChange={(e) => setReason(e.target.value as DiscardReason)}>
                  {DISCARD_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
            </>
          ) : (
            <Field label={`Cantidad contada (${s.unit})`} htmlFor="adj-counted" required hint="El sistema lleva el stock a este valor y registra la diferencia.">
              <Input id="adj-counted" type="number" inputMode="decimal" step="0.01" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} />
            </Field>
          )}
          <Field label="Notas" htmlFor="adj-notes" hint="Opcional.">
            <Input id="adj-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>Cancelar</Button>
            <Button onClick={() => mut.mutate()} loading={mut.isPending} loadingText="Guardando..." disabled={!canSave}>
              {mode === 'discard' ? 'Dar de baja' : 'Ajustar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InventoryPage() {
  const [showEntry, setShowEntry] = useState(false);
  const [adjust, setAdjust] = useState<{ s: StockSummary; mode: AdjustMode } | null>(null);
  const stockQuery = useQuery({ queryKey: ['stock'], queryFn: () => inventoryApi.stock() });
  const movementsQuery = useQuery({ queryKey: ['inv-movements'], queryFn: () => inventoryApi.movements() });

  const stock = stockQuery.data;
  const summary = useMemo(() => {
    if (!stock) return null;
    const low = stock.filter((s) => s.alertLevel === 'low').length;
    const expiring = stock.filter((s) => s.alertLevel === 'expiring' || s.alertLevel === 'critical').length;
    return { products: stock.length, low, expiring };
  }, [stock]);

  // Agrupar el stock por categoría, en el orden definido.
  const groups = useMemo(() => {
    if (!stock) return [];
    const byCat = new Map<string, StockSummary[]>();
    for (const s of stock) {
      const cat = s.category ?? 'otros';
      const arr = byCat.get(cat) ?? [];
      arr.push(s);
      byCat.set(cat, arr);
    }
    return [...byCat.entries()]
      .map(([cat, items]) => ({ cat, meta: metaFor(cat), items }))
      .sort((a, b) => a.meta.order - b.meta.order);
  }, [stock]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock"
        description="Todo el stock de la planta: materia prima, productos, subproductos e insumos."
        action={
          <Button onClick={() => setShowEntry((s) => !s)}>
            <Plus className="h-4 w-4" /> {showEntry ? 'Cerrar' : 'Ingresar stock'}
          </Button>
        }
      />

      {showEntry && <StockEntryForm onClose={() => setShowEntry(false)} />}

      {/* Resumen en chips compactos. */}
      <section aria-label="Resumen de inventario" className="flex flex-wrap gap-3">
        {stockQuery.isLoading ? (
          Array.from({ length: 3 }, (_, i) => <ChipSkeleton key={i} />)
        ) : summary ? (
          <>
            <SummaryChip icon={Boxes} label="Ítems con stock" value={num(summary.products)} tone="primary" />
            <SummaryChip icon={Package} label="Con stock bajo" value={num(summary.low)} tone={summary.low > 0 ? 'amber' : 'primary'} />
            <SummaryChip icon={PackageX} label="Por vencer o vencidos" value={num(summary.expiring)} tone={summary.expiring > 0 ? 'danger' : 'primary'} />
          </>
        ) : null}
      </section>

      {/* Stock por categoría, en cards. */}
      {stockQuery.isLoading ? (
        <Card className="h-40 animate-pulse bg-surface-subtle" />
      ) : groups.length === 0 ? (
        <EmptyState icon={Package} title="Sin stock cargado" description="A medida que recibas leche, cierres producción o ingreses insumos, el stock aparece acá." />
      ) : (
        groups.map(({ cat, meta, items }) => {
          const Icon = meta.icon;
          return (
            <section key={cat}>
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                <Icon className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
                {meta.label}
                <span className="text-sm font-normal text-foreground-muted">({items.length})</span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => (
                  <StockCard key={s.productId} s={s} icon={meta.icon} tone={meta.tone} onAction={(mode, item) => setAdjust({ s: item, mode })} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {/* Últimos movimientos. */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <ArrowLeftRight className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
          Últimos movimientos
        </h2>
        {movementsQuery.isLoading ? <Card className="h-40 animate-pulse bg-surface-subtle" /> : (
          <DataTable
            data={movementsQuery.data ?? []}
            getKey={(m) => m.id}
            emptyText="Sin movimientos registrados."
            getSearchText={(m) => `${m.batchCode ?? ''} ${m.productName ?? ''}`}
            searchPlaceholder="Buscar por lote o producto…"
            columns={[
              { key: 'when', header: 'Fecha', render: (m) => formatDateTime(m.createdAt), secondary: true, sortValue: (m) => new Date(m.createdAt).getTime() },
              { key: 'batch', header: 'Lote', render: (m) => <span className="font-mono text-xs">{m.batchCode || '—'}</span>, primary: true, sortValue: (m) => m.batchCode ?? '' },
              { key: 'product', header: 'Producto', render: (m) => m.productName || '—', sortValue: (m) => m.productName ?? '' },
              { key: 'type', header: 'Movimiento', render: (m) => (
                <StatusBadge status={m.type === 'in' ? 'success' : m.type === 'out' ? 'info' : 'warning'}>
                  {labelOr(movementTypeLabel, m.type)}
                </StatusBadge>
              )},
              { key: 'qty', header: 'Cantidad', render: (m) => `${m.quantity} ${m.unit}`, align: 'right', sortValue: (m) => Number(m.quantity) },
              { key: 'reason', header: 'Motivo', render: (m) => labelOr(movementReasonLabel, m.reason) },
            ]}
          />
        )}
      </section>

      {adjust && <AdjustDialog s={adjust.s} mode={adjust.mode} onClose={() => setAdjust(null)} />}
    </div>
  );
}
