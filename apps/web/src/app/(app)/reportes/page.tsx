'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BarChart3,
  Coins,
  Download,
  Factory,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PageHeader } from '@/components/page-header';
import { reportsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { formatMoney as money, formatDate } from '@/lib/utils';
import type {
  ProductionReportRow,
  ProfitabilityRow,
  SalesByClientRow,
  SalesByPeriodRow,
  SalesByProductRow,
  YieldReportRow,
  ReportGranularity,
} from '@lasmarias/shared-schemas';

// CLAUDE.md §4.9 / §5.3 — Reportes en pestañas: una sección a la vez para no
// abrumar. Rango de fechas compartido arriba. Solo lectura, lenguaje del negocio.

const num = (n: number, max = 0) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: max });
const pct = (n: number) =>
  `${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
// Rendimiento en kg/litro: número chico (~0,10), necesita 4 decimales.
const kgL = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

// YYYY-MM-DD del primer y último día del mes actual (por defecto).
function monthDefaults() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: fmt(first), to: fmt(last) };
}

// ─── KPI chip compacto (mismo lenguaje visual que el Home) ────────────────────
type KpiTone = 'primary' | 'amber' | 'secondary' | 'danger';

const KPI_TONE: Record<KpiTone, string> = {
  primary: 'bg-primary-50 text-primary-700',
  amber: 'bg-amber-50 text-amber-700',
  secondary: 'bg-secondary-50 text-secondary-700',
  danger: 'bg-red-50 text-red-700',
};

function KpiChip({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: KpiTone;
  hint?: string;
}) {
  return (
    <div title={hint} className="flex min-w-[11rem] flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${KPI_TONE[tone]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">{label}</span>
        <span className="block font-display text-lg font-bold tracking-tight text-foreground">{value}</span>
      </span>
    </div>
  );
}

function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

function LoadingCard() {
  return <Card className="h-40 animate-pulse bg-surface-subtle" />;
}

function ErrorCard() {
  return (
    <Card>
      <CardContent className="py-6 text-center text-sm text-danger">
        No se pudo cargar el reporte. Probá de nuevo en un momento.
      </CardContent>
    </Card>
  );
}

// ─── Pestaña Producción ───────────────────────────────────────────────────────
function ProductionSection({ from, to }: { from: string; to: string }) {
  const [granularity, setGranularity] = useState<ReportGranularity>('day');
  const query = useQuery({
    queryKey: ['report', 'production', from, to, granularity],
    queryFn: () => reportsApi.production(from, to, granularity),
  });

  const periodLabel = (iso: string) =>
    granularity === 'month'
      ? new Date(iso).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
      : granularity === 'week'
        ? `Semana del ${formatDate(iso)}`
        : formatDate(iso);

  const rows = query.data ?? [];

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          orders: acc.orders + r.ordersCount,
          milk: acc.milk + r.totalMilkLiters,
          kg: acc.kg + r.totalPrincipalKg,
          cost: acc.cost + r.totalCost,
        }),
        { orders: 0, milk: 0, kg: 0, cost: 0 },
      ),
    [rows],
  );

  if (query.isLoading) return <LoadingCard />;
  if (query.isError) return <ErrorCard />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Factory}
        title="No hubo producción en este período"
        description="Probá ampliar el rango de fechas."
      />
    );

  return (
    <div className="space-y-4">
      <KpiRow>
        <KpiChip label="Kg producidos" value={num(totals.kg, 1)} icon={Factory} tone="primary" hint="Total de kg de producto terminado en el período." />
        <KpiChip label="Litros de leche" value={num(totals.milk, 1)} icon={TrendingUp} tone="secondary" hint="Litros de leche que entraron a producción en el período." />
        <KpiChip label="Costo total" value={money(totals.cost)} icon={Coins} tone="amber" hint="Costo de toda la producción del período: leche, insumos y mano de obra, menos subproductos." />
      </KpiRow>

      <div className="flex justify-end">
        <SegmentedControl
          label="Agrupar producción"
          value={granularity}
          onChange={setGranularity}
          options={[
            { value: 'day', label: 'Por día' },
            { value: 'week', label: 'Por semana' },
            { value: 'month', label: 'Por mes' },
          ]}
        />
      </div>

      <DataTable
        data={rows}
        getKey={(r) => r.period}
        columns={[
          { key: 'period', header: 'Período', primary: true, render: (r: ProductionReportRow) => periodLabel(r.period), sortValue: (r: ProductionReportRow) => new Date(r.period).getTime() },
          { key: 'orders', header: 'Órdenes', align: 'right', render: (r: ProductionReportRow) => num(r.ordersCount), sortValue: (r: ProductionReportRow) => r.ordersCount },
          { key: 'milk', header: 'Litros de leche', align: 'right', render: (r: ProductionReportRow) => num(r.totalMilkLiters, 1), sortValue: (r: ProductionReportRow) => r.totalMilkLiters },
          { key: 'kg', header: 'Kg producidos', align: 'right', render: (r: ProductionReportRow) => num(r.totalPrincipalKg, 1), sortValue: (r: ProductionReportRow) => r.totalPrincipalKg },
          { key: 'cost', header: 'Costo total', align: 'right', render: (r: ProductionReportRow) => money(r.totalCost), sortValue: (r: ProductionReportRow) => r.totalCost },
        ]}
      />
    </div>
  );
}

// ─── Pestaña Ventas ────────────────────────────────────────────────────────────
function SalesSection({ from, to }: { from: string; to: string }) {
  const [by, setBy] = useState<'period' | 'client' | 'product'>('period');
  // Granularidad para la vista "Por período" (total $ por día / semana / mes).
  const [granularity, setGranularity] = useState<ReportGranularity>('month');

  const periodQuery = useQuery({
    queryKey: ['report', 'sales', 'period', from, to, granularity],
    queryFn: () => reportsApi.salesByPeriod(from, to, granularity),
    enabled: by === 'period',
  });
  const clientQuery = useQuery({
    queryKey: ['report', 'sales', 'client', from, to],
    queryFn: () => reportsApi.sales(from, to, 'client'),
    enabled: by === 'client',
  });
  const productQuery = useQuery({
    queryKey: ['report', 'sales', 'product', from, to],
    queryFn: () => reportsApi.sales(from, to, 'product'),
    enabled: by === 'product',
  });

  const periodLabel = (iso: string) =>
    granularity === 'month'
      ? new Date(iso).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
      : granularity === 'week'
        ? `Semana del ${formatDate(iso)}`
        : formatDate(iso);

  const exportCsv = useMutation({
    mutationFn: () => reportsApi.exportSalesXlsx(from, to),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo exportar. Probá de nuevo.'),
  });

  const active = by === 'period' ? periodQuery : by === 'client' ? clientQuery : productQuery;
  const periodRows = periodQuery.data ?? [];
  const clientRows = clientQuery.data ?? [];
  const productRows = productQuery.data ?? [];
  const totalPeriodo = useMemo(() => periodRows.reduce((acc, r) => acc + r.total, 0), [periodRows]);

  const totalFacturado = useMemo(() => clientRows.reduce((acc, r) => acc + r.total, 0), [clientRows]);
  const totalDespachos = useMemo(() => clientRows.reduce((acc, r) => acc + r.dispatchCount, 0), [clientRows]);

  return (
    <div className="space-y-4">
      {by === 'client' && !clientQuery.isLoading && !clientQuery.isError && clientRows.length > 0 && (
        <KpiRow>
          <KpiChip label="Total facturado" value={money(totalFacturado)} icon={Coins} tone="primary" hint="Suma de todas las ventas del período." />
          <KpiChip label="Ventas" value={num(totalDespachos)} icon={ShoppingCart} tone="secondary" hint="Cantidad de ventas (despachos) registradas en el período." />
          <KpiChip label="Clientes" value={num(clientRows.length)} icon={TrendingUp} tone="secondary" hint="Cantidad de clientes distintos que compraron en el período." />
        </KpiRow>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SegmentedControl
            label="Agrupar ventas"
            value={by}
            onChange={setBy}
            options={[
              { value: 'period', label: 'Por período' },
              { value: 'client', label: 'Por cliente' },
              { value: 'product', label: 'Por producto' },
            ]}
          />
          {by === 'period' && (
            <SegmentedControl
              label="Granularidad"
              value={granularity}
              onChange={setGranularity}
              options={[
                { value: 'day', label: 'Día' },
                { value: 'week', label: 'Semana' },
                { value: 'month', label: 'Mes' },
              ]}
            />
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => exportCsv.mutate()}
          loading={exportCsv.isPending}
          loadingText="Generando..."
        >
          <Download className="h-4 w-4" /> Exportar ventas
        </Button>
      </div>

      {active.isLoading ? (
        <LoadingCard />
      ) : active.isError ? (
        <ErrorCard />
      ) : by === 'period' ? (
        periodRows.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No hubo ventas en este período" description="Probá ampliar el rango de fechas." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-subtle/50 px-4 py-3">
              <span className="text-sm text-foreground-muted">Total facturado en el rango</span>
              <span className="font-display text-xl font-bold tracking-tight text-foreground">{money(totalPeriodo)}</span>
            </div>
            <DataTable
              data={periodRows}
              getKey={(r) => r.period}
              columns={[
                { key: 'period', header: 'Período', primary: true, render: (r: SalesByPeriodRow) => periodLabel(r.period), sortValue: (r: SalesByPeriodRow) => new Date(r.period).getTime() },
                { key: 'dispatches', header: 'Ventas', align: 'right', render: (r: SalesByPeriodRow) => num(r.dispatchCount), sortValue: (r: SalesByPeriodRow) => r.dispatchCount },
                { key: 'total', header: 'Total', align: 'right', render: (r: SalesByPeriodRow) => money(r.total), sortValue: (r: SalesByPeriodRow) => r.total },
              ]}
            />
          </>
        )
      ) : by === 'client' ? (
        clientRows.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No hubo ventas en este período" description="Probá ampliar el rango de fechas." />
        ) : (
          <DataTable
            data={clientRows}
            getKey={(r) => r.clientId}
            getSearchText={(r: SalesByClientRow) => r.clientName}
            searchPlaceholder="Buscar cliente…"
            columns={[
              { key: 'client', header: 'Cliente', primary: true, render: (r: SalesByClientRow) => r.clientName, sortValue: (r: SalesByClientRow) => r.clientName },
              { key: 'dispatches', header: 'Ventas', align: 'right', render: (r: SalesByClientRow) => num(r.dispatchCount), sortValue: (r: SalesByClientRow) => r.dispatchCount },
              { key: 'total', header: 'Total', align: 'right', render: (r: SalesByClientRow) => money(r.total), sortValue: (r: SalesByClientRow) => r.total },
            ]}
          />
        )
      ) : productRows.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No hubo ventas en este período" description="Probá ampliar el rango de fechas." />
      ) : (
        <DataTable
          data={productRows}
          getKey={(r) => r.productId}
          getSearchText={(r: SalesByProductRow) => r.productName}
          searchPlaceholder="Buscar producto…"
          columns={[
            { key: 'product', header: 'Producto', primary: true, render: (r: SalesByProductRow) => r.productName, sortValue: (r: SalesByProductRow) => r.productName },
            { key: 'quantity', header: 'Cantidad', align: 'right', render: (r: SalesByProductRow) => num(r.quantity, 2), sortValue: (r: SalesByProductRow) => r.quantity },
            { key: 'subtotal', header: 'Subtotal', align: 'right', render: (r: SalesByProductRow) => money(r.subtotal), sortValue: (r: SalesByProductRow) => r.subtotal },
          ]}
        />
      )}
    </div>
  );
}

// ─── Pestaña Rentabilidad por cliente ─────────────────────────────────────────
function ProfitabilitySection({ from, to }: { from: string; to: string }) {
  const query = useQuery({
    queryKey: ['report', 'profitability', from, to],
    queryFn: () => reportsApi.profitability(from, to),
  });

  const rows = query.data ?? [];
  const anyMissingCost = rows.some((r) => r.hasMissingCost);

  // Totales solo sobre filas con costo cargado (las demás no son comparables).
  const totals = useMemo(() => {
    const complete = rows.filter((r) => !r.hasMissingCost);
    const revenue = complete.reduce((acc, r) => acc + r.revenue, 0);
    const margin = complete.reduce((acc, r) => acc + r.margin, 0);
    return { revenue, margin, marginPct: revenue > 0 ? (margin / revenue) * 100 : null };
  }, [rows]);

  // Margen $: si el costo está incompleto, el margen no es confiable → "—".
  const renderMargin = (r: ProfitabilityRow) => {
    if (r.hasMissingCost) return <span className="text-foreground-muted">—</span>;
    const positive = r.margin >= 0;
    return (
      <span className={positive ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
        {positive ? '' : '−'}
        {money(Math.abs(r.margin))}
      </span>
    );
  };

  // Margen %: idem; si falta costo mostramos "s/ costo" para que se entienda.
  const renderMarginPct = (r: ProfitabilityRow) => {
    if (r.hasMissingCost) return <span className="text-amber-600">s/ costo</span>;
    if (r.marginPct == null) return <span className="text-foreground-muted">—</span>;
    const positive = r.marginPct >= 0;
    return (
      <span className={positive ? 'text-emerald-600' : 'text-red-600'}>
        {positive ? '' : '−'}
        {pct(Math.abs(r.marginPct))}
      </span>
    );
  };

  const renderCost = (r: ProfitabilityRow) =>
    r.hasMissingCost ? (
      <span className="text-amber-600">s/ costo</span>
    ) : (
      money(r.cost)
    );

  if (query.isLoading) return <LoadingCard />;
  if (query.isError) return <ErrorCard />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Coins}
        title="No hubo ventas en este período"
        description="La rentabilidad se calcula sobre las ventas del rango elegido."
      />
    );

  return (
    <div className="space-y-4">
      <KpiRow>
        <KpiChip label="Facturado (con costo)" value={money(totals.revenue)} icon={Coins} tone="primary" hint="Lo que vendiste de productos que tienen costo calculado (los que pasaron por producción)." />
        <KpiChip
          label="Margen total"
          value={`${totals.margin < 0 ? '−' : ''}${money(Math.abs(totals.margin))}`}
          icon={TrendingUp}
          tone={totals.margin < 0 ? 'danger' : 'primary'}
          hint="Facturado menos el costo de lo vendido. Es la ganancia bruta, antes de gastos."
        />
        {totals.marginPct != null && (
          <KpiChip
            label="Margen %"
            value={`${totals.marginPct < 0 ? '−' : ''}${pct(Math.abs(totals.marginPct))}`}
            icon={TrendingUp}
            tone={totals.marginPct < 0 ? 'danger' : 'secondary'}
            hint="Qué porción de lo facturado es ganancia. Margen ÷ facturado."
          />
        )}
      </KpiRow>

      <DataTable
        data={rows}
        getKey={(r) => r.clientId}
        getSearchText={(r: ProfitabilityRow) => r.clientName}
        searchPlaceholder="Buscar cliente…"
        columns={[
          {
            key: 'client',
            header: 'Cliente',
            primary: true,
            sortValue: (r: ProfitabilityRow) => r.clientName,
            render: (r: ProfitabilityRow) => (
              <span>
                {r.clientName}
                {r.hasMissingCost && (
                  <span className="ml-1 text-amber-600" title="Incluye lotes sin costo cargado">
                    *
                  </span>
                )}
              </span>
            ),
          },
          { key: 'revenue', header: 'Facturado', align: 'right', render: (r: ProfitabilityRow) => money(r.revenue), sortValue: (r: ProfitabilityRow) => r.revenue },
          { key: 'cost', header: 'Costo', align: 'right', render: renderCost, sortValue: (r: ProfitabilityRow) => r.cost ?? 0 },
          { key: 'margin', header: 'Margen $', align: 'right', render: renderMargin, sortValue: (r: ProfitabilityRow) => r.margin ?? 0 },
          { key: 'marginPct', header: 'Margen %', align: 'right', render: renderMarginPct, sortValue: (r: ProfitabilityRow) => r.marginPct ?? 0 },
        ]}
      />

      {anyMissingCost && (
        <p className="text-xs text-amber-600">
          * Incluye lotes sin costo cargado; el costo y el margen no se muestran porque no serían confiables.
        </p>
      )}
    </div>
  );
}

// ─── Pestaña Rendimiento real vs esperado ─────────────────────────────────────
function YieldSection({ from, to }: { from: string; to: string }) {
  const query = useQuery({
    queryKey: ['report', 'yield', from, to],
    queryFn: () => reportsApi.yield(from, to),
  });

  const rows = query.data ?? [];

  // Rendimiento en kg/litro (número chico): 4 decimales. null → "—".
  const renderYield = (v: number | null) =>
    v == null ? <span className="text-foreground-muted">—</span> : <span className="tabular-nums">{kgL(v)}</span>;

  // Desvío en % con signo y color (verde ≥0, rojo <0). null → "—".
  const renderDesvio = (r: YieldReportRow) => {
    if (r.desvioRendimientoPct == null) return <span className="text-foreground-muted">—</span>;
    const positive = r.desvioRendimientoPct >= 0;
    return (
      <span className={positive ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
        {positive ? '+' : '−'}
        {pct(Math.abs(r.desvioRendimientoPct))}
      </span>
    );
  };

  const desvCount = useMemo(
    () => rows.filter((r) => r.desvioRendimientoPct != null && r.desvioRendimientoPct < 0).length,
    [rows],
  );

  if (query.isLoading) return <LoadingCard />;
  if (query.isError) return <ErrorCard />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={TrendingUp}
        title="No hay órdenes cerradas en este período"
        description="El rendimiento se calcula sobre las órdenes de producción cerradas."
      />
    );

  return (
    <div className="space-y-4">
      <KpiRow>
        <KpiChip label="Órdenes cerradas" value={num(rows.length)} icon={Factory} tone="secondary" hint="Cantidad de órdenes de producción cerradas en el período." />
        <KpiChip
          label="Por debajo de lo esperado"
          value={num(desvCount)}
          icon={TrendingUp}
          tone={desvCount > 0 ? 'amber' : 'primary'}
          hint="Órdenes que rindieron menos kg de lo que dice la receta. Conviene revisarlas."
        />
      </KpiRow>

      <DataTable
        data={rows}
        getKey={(r) => r.orderCode}
        getSearchText={(r: YieldReportRow) => `${r.orderCode} ${r.productName}`}
        searchPlaceholder="Buscar por orden o producto…"
        columns={[
          { key: 'order', header: 'Orden', secondary: true, render: (r: YieldReportRow) => <span className="font-mono text-xs">{r.orderCode}</span>, sortValue: (r: YieldReportRow) => r.orderCode },
          { key: 'product', header: 'Producto', primary: true, render: (r: YieldReportRow) => r.productName, sortValue: (r: YieldReportRow) => r.productName },
          { key: 'litros', header: 'Litros', align: 'right', render: (r: YieldReportRow) => num(r.litros, 1), sortValue: (r: YieldReportRow) => r.litros },
          { key: 'kg', header: 'Kg real', align: 'right', render: (r: YieldReportRow) => num(r.kgReal, 1), sortValue: (r: YieldReportRow) => r.kgReal },
          { key: 'real', header: 'Rend. real (kg/L)', align: 'right', render: (r: YieldReportRow) => renderYield(r.rendimientoReal), sortValue: (r: YieldReportRow) => r.rendimientoReal ?? 0 },
          { key: 'esperado', header: 'Rend. esperado (kg/L)', align: 'right', render: (r: YieldReportRow) => renderYield(r.rendimientoEsperado), sortValue: (r: YieldReportRow) => r.rendimientoEsperado ?? 0 },
          { key: 'desvio', header: 'Desvío', align: 'right', render: renderDesvio, sortValue: (r: YieldReportRow) => r.desvioRendimientoPct ?? 0 },
        ]}
      />
    </div>
  );
}

// ─── Página con pestañas ──────────────────────────────────────────────────────
type TabId = 'production' | 'sales' | 'profitability' | 'yield';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'production', label: 'Producción', icon: Factory },
  { id: 'sales', label: 'Ventas', icon: ShoppingCart },
  { id: 'profitability', label: 'Rentabilidad', icon: Coins },
  { id: 'yield', label: 'Rendimiento', icon: TrendingUp },
];

export default function ReportsPage() {
  const defaults = useMemo(monthDefaults, []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [tab, setTab] = useState<TabId>('production');

  // El rango aplicado solo cambia cuando ambas fechas son válidas y from ≤ to.
  const validRange = !!from && !!to && from <= to;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reportes"
        description="Producción, ventas, rentabilidad y rendimiento del período elegido."      />

      {/* Rango de fechas compartido por todas las pestañas. */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-end">
          <Field
            label="Desde"
            htmlFor="from"
            className="sm:w-48"
            error={validRange ? undefined : 'Revisá las fechas: "desde" no puede ser mayor que "hasta".'}
          >
            <Input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Hasta" htmlFor="to" className="sm:w-48">
            <Input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {validRange ? (
        <>
          {/* Pestañas: una sección a la vez para no abrumar. */}
          <div role="tablist" aria-label="Tipo de reporte" className="flex flex-wrap gap-2 border-b border-border-subtle">
            {TABS.map(({ id, label, icon: Icon }) => {
              const selected = tab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  onClick={() => setTab(id)}
                  className={
                    'flex min-h-touch items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
                    (selected
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-foreground-muted hover:text-foreground')
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Contenido de la pestaña activa. */}
          <div role="tabpanel">
            {tab === 'production' && <ProductionSection from={from} to={to} />}
            {tab === 'sales' && <SalesSection from={from} to={to} />}
            {tab === 'profitability' && <ProfitabilitySection from={from} to={to} />}
            {tab === 'yield' && <YieldSection from={from} to={to} />}
          </div>
        </>
      ) : (
        <EmptyState
          icon={BarChart3}
          title="Elegí un rango de fechas válido"
          description='La fecha "desde" debe ser anterior o igual a "hasta".'
        />
      )}
    </div>
  );
}
