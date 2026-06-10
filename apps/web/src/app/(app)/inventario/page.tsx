'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  Box,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  Droplets,
  FlaskConical,
  Layers,
  Milk,
  Package,
  PackageX,
  Plus,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { RowActions } from '@/components/ui/row-actions';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusBadge, type Status } from '@/components/ui/status-badge';
import { inventoryApi, productsApi, exchangeRatesApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { labelOr, movementReasonLabel, movementTypeLabel } from '@/lib/labels';
import { CURRENCY_OPTIONS, currencySymbol, equivalentArs } from '@/features/currency';
import type { StockSummary, DiscardReason, Currency } from '@lasmarias/shared-schemas';

type AdjustMode = 'discard' | 'count' | 'min';

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

function SummaryChip({
  icon: Icon, label, value, tone, onClick, active,
}: {
  icon: LucideIcon; label: string; value: string; tone: keyof typeof CHIP_TONE;
  onClick?: () => void; active?: boolean;
}) {
  const base = 'flex min-w-[11rem] flex-1 items-center gap-3 rounded-lg border bg-surface-elevated px-4 py-3 shadow-sm text-left transition-colors';
  const state = active
    ? 'border-primary-500 ring-2 ring-primary-200'
    : onClick
      ? 'border-border-subtle hover:border-primary-300 hover:bg-surface-subtle/40 cursor-pointer'
      : 'border-border-subtle';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${state}`}>
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${CHIP_TONE[tone]}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">{label}</span>
          <span className="block font-display text-lg font-bold tracking-tight text-foreground">{value}</span>
        </span>
      </button>
    );
  }
  return (
    <div className={`${base} ${state}`}>
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

// --- Fila de un ítem de stock (lista escaneable) ---
function StockRow({
  s,
  icon: Icon,
  tone,
  onAction,
  onOpen,
}: {
  s: StockSummary;
  icon: LucideIcon;
  tone: string;
  onAction?: (mode: AdjustMode, s: StockSummary) => void;
  onOpen?: (s: StockSummary) => void;
}) {
  const noStock = s.totalQuantity <= 0;
  const b: { variant: Status; label: string } = noStock ? { variant: 'danger', label: 'Sin stock' } : alertBadge(s.alertLevel);
  const showBar = typeof s.minStock === 'number' && s.minStock > 0;
  const pct = showBar ? Math.min(100, (s.totalQuantity / (s.minStock as number)) * 100) : 0;
  const barColor = noStock || s.alertLevel === 'critical' ? 'bg-red-500' : s.alertLevel === 'low' ? 'bg-amber-500' : 'bg-primary-600';
  // La leche cruda es una fila sintética (sus movimientos no tienen producto): no es clickeable.
  const clickable = !!onOpen && s.productId !== 'leche-cruda';
  const meta = [
    s.warehouses && s.warehouses.length > 0 ? s.warehouses.join(', ') : null,
    s.nearestExpiration ? `vence ${new Date(s.nearestExpiration).toLocaleDateString('es-AR')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      onClick={clickable ? () => onOpen!(s) : undefined}
      className={`flex items-center gap-3 px-4 py-3 ${clickable ? 'cursor-pointer transition-colors hover:bg-surface-subtle/40' : ''}`}
    >
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      {/* Nombre + metadatos */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{s.productName}</p>
        {(s.sku && s.sku !== '—') || meta ? (
          <p className="truncate text-xs text-foreground-muted">
            {s.sku && s.sku !== '—' ? <span className="font-mono">{s.sku}</span> : null}
            {s.sku && s.sku !== '—' && meta ? ' · ' : ''}
            {meta}
          </p>
        ) : null}
      </div>

      {/* Barra vs mínimo (solo insumos, desktop) */}
      {showBar && (
        <div className="hidden w-32 flex-shrink-0 sm:block">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-right text-[11px] text-foreground-muted">mín {num(s.minStock as number)}</p>
        </div>
      )}

      {/* Cantidad */}
      <div className="w-24 flex-shrink-0 text-right">
        <span className="font-display text-lg font-bold tracking-tight text-foreground">{num(s.totalQuantity)}</span>
        <span className="ml-1 text-xs text-foreground-muted">{s.unit}</span>
      </div>

      {/* Estado */}
      <div className="flex-shrink-0">
        <StatusBadge status={b.variant}>{b.label}</StatusBadge>
      </div>

      {/* Acciones */}
      {onAction && s.productId !== 'leche-cruda' ? (
        <RowActions
          label={`Acciones de ${s.productName}`}
          actions={[
            { label: typeof s.minStock === 'number' && s.minStock > 0 ? 'Cambiar aviso de stock bajo' : 'Definir aviso de stock bajo', icon: Bell, onClick: () => onAction('min', s) },
            { label: 'Ajustar por conteo', icon: ClipboardCheck, onClick: () => onAction('count', s) },
            { label: 'Dar de baja', icon: Trash2, onClick: () => onAction('discard', s), destructive: true },
          ]}
        />
      ) : (
        <span className="w-9 flex-shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}

// --- Formulario de ingreso de stock (insumos/envases) ---
function StockEntryForm({ onClose, stockHints }: { onClose: () => void; stockHints: StockSummary[] }) {
  const queryClient = useQueryClient();
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const warehousesQuery = useQuery({ queryKey: ['warehouses'], queryFn: () => inventoryApi.listWarehouses() });
  const latestRate = useQuery({ queryKey: ['exchange-rate-latest'], queryFn: () => exchangeRatesApi.latest() });

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [costPrefilled, setCostPrefilled] = useState(false);
  const [currency, setCurrency] = useState<Currency>('ARS');
  const [warehouseId, setWarehouseId] = useState('');

  const entryProducts = useMemo(
    () => (productsQuery.data ?? []).filter((p) => p.isActive),
    [productsQuery.data],
  );

  function handleProductChange(id: string) {
    setProductId(id);
    // Pre-rellenar con el último costo conocido del producto (en ARS).
    const hint = stockHints.find((s) => s.productId === id);
    if (hint?.lastUnitCost != null) {
      setUnitCost(String(hint.lastUnitCost));
      setCurrency('ARS');
      setCostPrefilled(true);
    } else {
      setCostPrefilled(false);
    }
  }

  const save = useMutation({
    mutationFn: () =>
      inventoryApi.addStockEntry({
        productId,
        quantity: Number(quantity),
        unitCost: unitCost ? Number(unitCost) : undefined,
        currency,
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
          <Field label="Producto" htmlFor="entry-product" required>
            <select
              id="entry-product"
              className="min-h-touch w-full rounded-md border border-border bg-surface-elevated px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
              value={productId}
              onChange={(e) => handleProductChange(e.target.value)}
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
          <Field
            label="Costo unitario"
            htmlFor="entry-cost"
            hint={costPrefilled ? 'Pre-relleno con el último precio conocido. Modificalo si cambió.' : 'Opcional.'}
          >
            <div className="flex gap-2">
              <Input
                id="entry-cost"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                prefix={currencySymbol(currency)}
                placeholder="0"
                className={`flex-1 ${costPrefilled ? 'border-amber-300 bg-amber-50' : ''}`}
                value={unitCost}
                onChange={(e) => { setUnitCost(e.target.value); setCostPrefilled(false); }}
              />
              <select
                aria-label="Moneda del costo"
                className="min-h-touch w-24 flex-none rounded-md border border-border bg-surface-elevated px-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value}</option>)}
              </select>
            </div>
            {(() => {
              const eq = equivalentArs(unitCost, currency, latestRate.data ?? undefined);
              if (eq != null) return <p className="mt-1 text-xs text-foreground-muted">≈ {formatMoney(eq)} /unidad (cotización del día)</p>;
              if (currency !== 'ARS' && Number(unitCost) > 0)
                return <p className="mt-1 text-xs text-warning">Cargá la cotización del día para ver el equivalente en pesos.</p>;
              return null;
            })()}
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
          <p className="text-xs text-foreground-muted">No hay productos activos. Creálos primero en Datos maestros → Productos.</p>
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
  const [minVal, setMinVal] = useState(typeof s.minStock === 'number' && s.minStock > 0 ? String(s.minStock) : '');
  const [notes, setNotes] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      if (mode === 'discard') {
        await inventoryApi.discardStock({ productId: s.productId, quantity: Number(quantity), reason, notes: notes || undefined });
      } else if (mode === 'count') {
        await inventoryApi.countAdjust({ productId: s.productId, countedQuantity: Number(counted), notes: notes || undefined });
      } else {
        // Aviso de stock bajo = mínimo del producto. 0 (o vacío) = sin aviso.
        await productsApi.update(s.productId, { minStockLevel: minVal === '' ? 0 : Number(minVal) });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['inv-movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(mode === 'discard' ? 'Stock dado de baja.' : mode === 'count' ? 'Stock ajustado al conteo.' : 'Aviso de stock bajo actualizado.');
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });

  const canSave =
    mode === 'discard'
      ? Number(quantity) > 0 && Number(quantity) <= s.totalQuantity && !mut.isPending
      : mode === 'count'
        ? counted !== '' && Number(counted) >= 0 && !mut.isPending
        : minVal !== '' && Number(minVal) >= 0 && !mut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>{mode === 'discard' ? 'Dar de baja' : mode === 'count' ? 'Ajustar por conteo' : 'Aviso de stock bajo'} — {s.productName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground-muted">
            Stock actual: <span className="font-medium text-foreground">{num(s.totalQuantity)} {s.unit}</span>
          </p>
          {mode === 'min' ? (
            <Field
              label={`Avisarme cuando baje de (${s.unit})`}
              htmlFor="adj-min"
              hint="Cuando el stock llegue a este número o menos, el ítem se marca como 'stock bajo'. Poné 0 para no avisar."
            >
              <Input id="adj-min" type="number" inputMode="decimal" step="0.01" min={0} placeholder="Ej: 20" value={minVal} onChange={(e) => setMinVal(e.target.value)} autoFocus />
            </Field>
          ) : mode === 'discard' ? (
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
            <>
              <Field label={`Cantidad contada (${s.unit})`} htmlFor="adj-counted" required hint="El sistema lleva el stock a este valor y registra la diferencia.">
                <Input id="adj-counted" type="number" inputMode="decimal" step="0.01" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} />
              </Field>
              {counted !== '' && Number.isFinite(Number(counted)) && (() => {
                const diff = Number(counted) - s.totalQuantity;
                if (Math.abs(diff) < 1e-9) {
                  return <p className="text-sm text-foreground-muted">Coincide con el sistema, no hay diferencia.</p>;
                }
                const up = diff > 0;
                return (
                  <p className={`text-sm font-medium ${up ? 'text-primary-700' : 'text-danger'}`}>
                    Diferencia: {up ? '+' : '−'}{num(Math.abs(diff))} {s.unit}{' '}
                    <span className="font-normal text-foreground-muted">(el sistema tiene {num(s.totalQuantity)} {s.unit})</span>
                  </p>
                );
              })()}
            </>
          )}
          {mode !== 'min' && (
            <Field label="Notas" htmlFor="adj-notes" hint="Opcional.">
              <Input id="adj-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>Cancelar</Button>
            <Button onClick={() => mut.mutate()} loading={mut.isPending} loadingText="Guardando..." disabled={!canSave}>
              {mode === 'discard' ? 'Dar de baja' : mode === 'count' ? 'Ajustar' : 'Guardar aviso'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type QuickFilter = null | 'low' | 'expiring';

export default function InventoryPage() {
  const [showEntry, setShowEntry] = useState(false);
  const [adjust, setAdjust] = useState<{ s: StockSummary; mode: AdjustMode } | null>(null);
  const [view, setView] = useState<'stock' | 'movimientos'>('stock');
  const [movFilter, setMovFilter] = useState<string | null>(null); // nombre de producto
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);

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

  // Grupos filtrados por el chip activo (vacíos se descartan).
  const displayGroups = useMemo(() => {
    if (!quickFilter) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((s) =>
          quickFilter === 'low'
            ? s.alertLevel === 'low'
            : s.alertLevel === 'expiring' || s.alertLevel === 'critical',
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, quickFilter]);

  function toggleFilter(f: Exclude<QuickFilter, null>) {
    setQuickFilter((prev) => (prev === f ? null : f));
    setView('stock');
  }

  const movements = movementsQuery.data ?? [];
  const filteredMovements = useMemo(
    () => (movFilter ? movements.filter((m) => (m.productName ?? '') === movFilter) : movements),
    [movements, movFilter],
  );

  const openMovements = (s: StockSummary) => {
    setMovFilter(s.productName);
    setView('movimientos');
  };
  const toggleCat = (cat: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat);
      else n.add(cat);
      return n;
    });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock"
        description="Todo el stock de la planta: materia prima, productos, subproductos e insumos."
        action={
          view === 'stock' ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setMovFilter(null); setView('movimientos'); }}>
                <ArrowLeftRight className="h-4 w-4" /> Movimientos
              </Button>
              <Button onClick={() => setShowEntry((v) => !v)}>
                <Plus className="h-4 w-4" /> {showEntry ? 'Cerrar' : 'Ingresar stock'}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setView('stock')}>
              <ArrowLeft className="h-4 w-4" /> Volver al stock
            </Button>
          )
        }
      />

      {view === 'movimientos' ? (
        /* --- Vista de movimientos (separada; opcionalmente filtrada por un ítem) --- */
        <section className="flex flex-col gap-3">
          {movFilter && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-foreground-muted">Movimientos de</span>
              <span className="inline-flex items-center gap-2 rounded-full bg-surface-subtle px-3 py-1 font-medium text-foreground">
                {movFilter}
                <button type="button" onClick={() => setMovFilter(null)} aria-label="Quitar filtro" className="text-foreground-muted hover:text-foreground">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            </div>
          )}
          {movementsQuery.isLoading ? (
            <TableSkeleton />
          ) : (
            <DataTable
              data={filteredMovements}
              getKey={(m) => m.id}
              emptyText={movFilter ? `Sin movimientos de ${movFilter}.` : 'Sin movimientos registrados.'}
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
      ) : (
        /* --- Vista de stock --- */
        <>
          {showEntry && <StockEntryForm onClose={() => setShowEntry(false)} stockHints={stock ?? []} />}

          <section aria-label="Resumen de inventario" className="flex flex-wrap gap-3">
            {stockQuery.isLoading ? (
              Array.from({ length: 3 }, (_, i) => <ChipSkeleton key={i} />)
            ) : summary ? (
              <>
                <SummaryChip
                  icon={Boxes}
                  label="Ítems con stock"
                  value={num(summary.products)}
                  tone="primary"
                  onClick={() => setQuickFilter(null)}
                  active={quickFilter === null}
                />
                <SummaryChip
                  icon={Package}
                  label="Con stock bajo"
                  value={num(summary.low)}
                  tone={summary.low > 0 ? 'amber' : 'primary'}
                  onClick={() => toggleFilter('low')}
                  active={quickFilter === 'low'}
                />
                <SummaryChip
                  icon={PackageX}
                  label="Por vencer o vencidos"
                  value={num(summary.expiring)}
                  tone={summary.expiring > 0 ? 'danger' : 'primary'}
                  onClick={() => toggleFilter('expiring')}
                  active={quickFilter === 'expiring'}
                />
              </>
            ) : null}
          </section>

          {/* Banner contextual cuando hay un filtro activo */}
          {quickFilter === 'low' && summary && (
            <div className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div>
                <p className="font-medium text-amber-800">
                  {summary.low === 0 ? 'Ningún ítem con stock bajo' : `${summary.low} ${summary.low === 1 ? 'ítem tiene' : 'ítems tienen'} stock bajo o por debajo del mínimo`}
                </p>
                <p className="mt-0.5 text-sm text-amber-700">Ingresá stock para normalizar. Hacé click en un ítem para ver sus movimientos.</p>
              </div>
              <Button size="sm" onClick={() => setShowEntry(true)} className="flex-none">
                <Plus className="h-4 w-4" /> Ingresar stock
              </Button>
            </div>
          )}
          {quickFilter === 'expiring' && summary && (
            <div className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <div>
                <p className="font-medium text-red-800">
                  {summary.expiring === 0 ? 'Ningún ítem por vencer o vencido' : `${summary.expiring} ${summary.expiring === 1 ? 'ítem' : 'ítems'} por vencer o vencidos`}
                </p>
                <p className="mt-0.5 text-sm text-red-700">Revisá estos lotes. Podés darlos de baja o hacer un ajuste de inventario desde las acciones de cada fila.</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickFilter(null)}
                className="flex-none text-sm text-red-600 hover:text-red-800"
                aria-label="Cerrar filtro"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {stockQuery.isLoading ? (
            <TableSkeleton />
          ) : displayGroups.length === 0 && quickFilter ? (
            <EmptyState
              icon={quickFilter === 'low' ? Package : PackageX}
              title={quickFilter === 'low' ? 'Ningún ítem con stock bajo' : 'Ningún ítem por vencer o vencido'}
              description={quickFilter === 'low' ? '¡Todo el stock está en nivel normal!' : '¡Todos los lotes están dentro de fecha!'}
              action={<Button variant="secondary" onClick={() => setQuickFilter(null)}>Ver todo el stock</Button>}
            />
          ) : groups.length === 0 ? (
            <EmptyState icon={Package} title="Sin stock cargado" description="A medida que recibas leche, cierres producción o ingreses insumos, el stock aparece acá." />
          ) : (
            displayGroups.map(({ cat, meta, items }) => {
              const Icon = meta.icon;
              const isOpen = !collapsed.has(cat);
              return (
                <section key={cat}>
                  <button
                    type="button"
                    onClick={() => toggleCat(cat)}
                    className="mb-3 flex w-full items-center gap-2 text-base font-semibold text-foreground"
                  >
                    <ChevronDown className={`h-4 w-4 text-foreground-muted transition-transform ${isOpen ? '' : '-rotate-90'}`} aria-hidden="true" />
                    <Icon className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
                    {meta.label}
                    {quickFilter && <span className="ml-auto text-xs font-normal text-foreground-muted">{items.length} {items.length === 1 ? 'ítem' : 'ítems'}</span>}
                  </button>
                  {isOpen && (
                    <Card className="divide-y divide-border-subtle overflow-hidden p-0">
                      {items.map((s) => (
                        <StockRow
                          key={s.productId}
                          s={s}
                          icon={meta.icon}
                          tone={meta.tone}
                          onAction={(mode, item) => setAdjust({ s: item, mode })}
                          onOpen={openMovements}
                        />
                      ))}
                    </Card>
                  )}
                </section>
              );
            })
          )}
        </>
      )}

      {adjust && <AdjustDialog s={adjust.s} mode={adjust.mode} onClose={() => setAdjust(null)} />}
    </div>
  );
}
