'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Factory,
  Milk,
  Package,
  PackageX,
  ShoppingCart,
  TrendingUp,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { MonthCalendar } from '@/components/month-calendar';
import { SetupChecklist } from '@/components/setup-checklist';
import { useAuth } from '@/hooks/use-auth';
import { homeApi, inventoryApi, salesApi } from '@/features/api';
import { formatMoney as money } from '@/lib/utils';
import type { HomeCalendarEvent, StockSummary, AccountBalance } from '@lasmarias/shared-schemas';

// Home "Centro de comando" (CLAUDE.md §5.3 / §5.4): panel administrativo denso
// y ordenado. Izquierda (2/3): saludo + KPIs en chips + "Para resolver" (lo
// accionable). Derecha (1/3): mini calendario + "Próximos".

const num = (n: number | undefined) => (n ?? 0).toLocaleString('es-AR');

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Fecha relativa en lenguaje claro: "hoy", "mañana", "en 2 días", "hace 1 día".
function relativeDate(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  if (diff > 1) return `en ${diff} días`;
  return `hace ${Math.abs(diff)} días`;
}

// ─── KPIs compactos (chips que envuelven) ────────────────────────────────────
interface Kpi {
  href: string;
  label: string;
  value: string;
  icon: LucideIcon;
  tone: 'primary' | 'amber' | 'secondary' | 'danger';
  hint?: string;
}

const KPI_TONE: Record<Kpi['tone'], string> = {
  primary: 'bg-primary-50 text-primary-700',
  amber: 'bg-amber-50 text-amber-700',
  secondary: 'bg-secondary-50 text-secondary-700',
  danger: 'bg-red-50 text-red-700',
};

function KpiChip({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;
  return (
    <Link
      href={kpi.href}
      title={kpi.hint}
      className="group flex min-w-[11rem] flex-1 items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3 shadow-sm transition-all hover:border-primary-300 hover:shadow-md"
    >
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${KPI_TONE[kpi.tone]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-foreground-muted">{kpi.label}</span>
        <span className="block font-display text-lg font-bold tracking-tight text-foreground">{kpi.value}</span>
      </span>
    </Link>
  );
}

function KpiChipSkeleton() {
  return <div className="h-[60px] min-w-[11rem] flex-1 animate-pulse rounded-lg bg-surface-subtle" />;
}

// ─── "Para resolver" — fila accionable ───────────────────────────────────────
type Severity = 'danger' | 'warning';

interface Pending {
  key: string;
  severity: Severity;
  icon: LucideIcon;
  text: string;
  href: string;
}

const SEVERITY_RANK: Record<Severity, number> = { danger: 0, warning: 1 };

const PENDING_ICON_STYLE: Record<Severity, string> = {
  danger: 'bg-red-50 text-red-700',
  warning: 'bg-amber-50 text-amber-700',
};

function buildPending(stock: StockSummary[] | undefined, accounts: AccountBalance[] | undefined): Pending[] {
  const items: Pending[] = [];

  for (const it of stock ?? []) {
    if (it.alertLevel === 'critical' || it.alertLevel === 'expiring') {
      items.push({
        key: `vto-${it.productId}`,
        severity: it.alertLevel === 'critical' ? 'danger' : 'warning',
        icon: PackageX,
        text: `Lote por vencer: ${it.productName}`,
        href: '/inventario',
      });
    } else if (it.alertLevel === 'low') {
      items.push({
        key: `low-${it.productId}`,
        severity: 'warning',
        icon: Package,
        text: `Stock bajo de ${it.productName}`,
        href: '/inventario',
      });
    }
  }

  for (const acc of accounts ?? []) {
    // Solo deuda VENCIDA (no todo saldo): lo que realmente hay que reclamar.
    if (acc.overdue > 0) {
      items.push({
        key: `deuda-${acc.clientId}`,
        severity: 'danger',
        icon: Banknote,
        text: `${acc.clientName} debe ${money(acc.overdue)} vencido`,
        href: '/cuentas',
      });
    }
  }

  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

function PendingRow({ item }: { item: Pending }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="group flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2.5 transition-colors hover:border-primary-300 hover:bg-surface-subtle/40"
    >
      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${PENDING_ICON_STYLE[item.severity]}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.text}</span>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-foreground-muted transition-colors group-hover:text-foreground" aria-hidden="true" />
    </Link>
  );
}

function PendingRowSkeleton() {
  return <div className="h-12 animate-pulse rounded-lg bg-surface-subtle" />;
}

// ─── "Próximos" — eventos cronológicos cercanos ──────────────────────────────
const EVENT_DOT: Record<HomeCalendarEvent['type'], string> = {
  cobro: 'bg-amber-500',
  vencimiento_lote: 'bg-red-500',
  despacho: 'bg-secondary-500',
  pago_proveedor: 'bg-orange-500',
};

function nextEvents(events: HomeCalendarEvent[] | undefined): HomeCalendarEvent[] {
  if (!events) return [];
  // Fecha de hoy YYYY-MM-DD para filtrar eventos pasados.
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return [...events]
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
}

function UpcomingRow({ ev }: { ev: HomeCalendarEvent }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${EVENT_DOT[ev.type]}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{ev.label}</span>
      <span className="flex-shrink-0 text-xs text-foreground-muted">{relativeDate(ev.date)}</span>
    </li>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonthKey);

  const summaryQuery = useQuery({ queryKey: ['home', 'summary'], queryFn: () => homeApi.summary(), enabled: !!user });
  const calendarQuery = useQuery({
    queryKey: ['home', 'calendar', month],
    queryFn: () => homeApi.calendar(month),
    enabled: !!user,
  });
  const stockQuery = useQuery({ queryKey: ['inventory', 'stock'], queryFn: () => inventoryApi.stock(), enabled: !!user });
  const accountsQuery = useQuery({ queryKey: ['sales', 'accounts'], queryFn: () => salesApi.accounts(), enabled: !!user });

  const s = summaryQuery.data;
  // Bloque PLATA: todo en $ (finanzas y comercial).
  const plata: Kpi[] = s
    ? [
        { href: '/cuentas', label: 'A cobrar', value: money(s.saldoTotalPorCobrar), icon: Wallet, tone: 'danger', hint: 'Total que te deben todos los clientes en cuenta corriente.' },
        { href: '/caja', label: 'Caja del mes', value: money(s.cajaNetaMes), icon: Banknote, tone: s.cajaNetaMes < 0 ? 'danger' : 'primary', hint: 'Cobros menos gastos de este mes. En rojo si gastaste más de lo que entró.' },
        { href: '/ventas', label: 'Ventas del mes', value: money(s.ventasMes), icon: TrendingUp, tone: 'primary', hint: 'Total facturado en lo que va del mes.' },
      ]
    : [];
  // Bloque LA PLANTA HOY: operación del día (cantidades, no $).
  const plantaHoy: Kpi[] = s
    ? [
        { href: '/recepciones', label: 'Leche recibida hoy', value: `${num(s.lecheHoyLitros)} L`, icon: Milk, tone: 'secondary', hint: 'Litros de leche aceptados en recepciones de hoy.' },
        { href: '/produccion', label: 'Producido hoy', value: `${num(s.kgProducidosHoy)} kg`, icon: Factory, tone: 'primary', hint: 'Kg de producto terminado en órdenes cerradas hoy.' },
        { href: '/ventas', label: 'Ventas hoy', value: num(s.despachosHoy), icon: ShoppingCart, tone: 'secondary', hint: 'Cantidad de ventas registradas hoy.' },
        { href: '/inventario', label: 'Lotes por vencer', value: num(s.lotesPorVencer), icon: TriangleAlert, tone: s.lotesPorVencer > 0 ? 'amber' : 'primary', hint: 'Lotes próximos a vencer o ya vencidos. Tocá para verlos en stock.' },
      ]
    : [];

  const pending = useMemo(
    () => buildPending(stockQuery.data, accountsQuery.data),
    [stockQuery.data, accountsQuery.data],
  );
  const pendingLoading = stockQuery.isLoading || accountsQuery.isLoading;
  const pendingError = stockQuery.isError && accountsQuery.isError;

  const upcoming = useMemo(() => nextEvents(calendarQuery.data?.events), [calendarQuery.data]);

  const firstName = user?.fullName?.trim().split(' ')[0] ?? '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={firstName ? `Hola, ${firstName}` : 'Inicio'}
        description="Tu centro de comando: todo lo de hoy y lo que hay que resolver, a la vista."
      />

      {/* Puesta en marcha: guía el primer uso. Se autooculta cuando ya está todo cargado. */}
      {(user?.role === 'admin' || user?.role === 'gerente') && <SetupChecklist />}

      {/* Acciones del día: lo que más se usa, a un toque (sin buscar en el menú). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: '/recepciones/nueva', label: 'Recibir leche', icon: Milk },
          { href: '/produccion/nueva', label: 'Producir', icon: Factory },
          { href: '/ventas', label: 'Vender', icon: ShoppingCart },
          { href: '/finanzas', label: 'Cobros y pagos', icon: Wallet },
        ].map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-border-subtle bg-surface-elevated p-5 text-center shadow-sm transition-all hover:border-primary-300 hover:shadow-md"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-700 transition-colors group-hover:bg-primary-600 group-hover:text-white">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-foreground">{a.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Columna principal ── */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* KPIs en dos bloques: plata (en $) y la planta hoy (cantidades). */}
          {summaryQuery.isLoading ? (
            <section aria-label="Indicadores" className="flex flex-wrap gap-3">
              {Array.from({ length: 5 }, (_, i) => <KpiChipSkeleton key={i} />)}
            </section>
          ) : summaryQuery.isError || !s ? (
            <Card className="w-full">
              <CardContent className="py-5 text-center text-sm text-danger">
                No se pudieron cargar los indicadores. Probá de nuevo en un momento.
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-5">
              <section aria-label="Plata">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Plata</p>
                <div className="flex flex-wrap gap-3">
                  {plata.map((kpi) => <KpiChip key={kpi.label} kpi={kpi} />)}
                </div>
              </section>
              <section aria-label="La planta hoy">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">La planta hoy</p>
                <div className="flex flex-wrap gap-3">
                  {plantaHoy.map((kpi) => <KpiChip key={kpi.label} kpi={kpi} />)}
                </div>
              </section>
            </div>
          )}

          {/* Para resolver. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <TriangleAlert className="h-5 w-5 text-amber-600" aria-hidden="true" />
                Para resolver
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <PendingRowSkeleton key={i} />
                  ))}
                </div>
              ) : pendingError ? (
                <p className="py-4 text-center text-sm text-danger">
                  No se pudieron cargar los pendientes. Probá de nuevo en un momento.
                </p>
              ) : pending.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Todo en orden"
                  description="No hay pendientes urgentes. Stock sano y cuentas al día."
                  className="py-8"
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {pending.map((item) => (
                    <PendingRow key={item.key} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Columna lateral (angosta) ── */}
        <aside className="flex flex-col gap-6">
          {/* Mini calendario. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-primary-700" aria-hidden="true" />
                Calendario
              </CardTitle>
            </CardHeader>
            <CardContent>
              {calendarQuery.isError ? (
                <p className="py-4 text-center text-sm text-danger">No se pudo cargar el calendario.</p>
              ) : (
                <MonthCalendar
                  compact
                  month={month}
                  onMonthChange={setMonth}
                  events={calendarQuery.data?.events ?? []}
                  loading={calendarQuery.isLoading || calendarQuery.isFetching}
                />
              )}
            </CardContent>
          </Card>

          {/* Próximos. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Próximos</CardTitle>
            </CardHeader>
            <CardContent>
              {calendarQuery.isLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="h-7 animate-pulse rounded bg-surface-subtle" />
                  ))}
                </div>
              ) : upcoming.length === 0 ? (
                <p className="py-2 text-sm text-foreground-muted">No hay eventos próximos este mes.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {upcoming.map((ev, i) => (
                    <UpcomingRow key={`${ev.refId ?? 'x'}-${i}`} ev={ev} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
