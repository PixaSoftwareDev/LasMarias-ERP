'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronRight, Circle, Factory, Milk, Receipt, ShoppingCart, Tractor, Users, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api-client';
import { producersApi, clientsApi, productsApi } from '@/features/api';
import { useAuth } from '@/hooks/use-auth';

interface DashboardData {
  milkReceivedTodayLiters: number;
  receptionsToday: number;
  productionsClosedToday: number;
  ordersTakenToday: number;
  openInvoicesCount: number;
  openInvoicesAmount: number;
  stockAlerts: number;
}

function SetupChecklist({ producers, clients, products }: { producers: number; clients: number; products: number }) {
  const steps = [
    { done: producers > 0, label: 'Cargá al menos un productor (tambo)', href: '/productores', hint: 'Necesitás un productor para registrar la entrada de leche' },
    { done: products > 0, label: 'Cargá los productos que fabricás', href: '/productos', hint: 'Ej: queso cremoso, mozzarella, ricota' },
    { done: clients > 0, label: 'Cargá tus clientes', href: '/clientes', hint: 'Los comercios y compradores a quienes les vendés' },
  ];
  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  return (
    <Card className="border-primary-200 bg-primary-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-primary-800">
          <CheckCircle2 className="h-5 w-5" />
          Primeros pasos — completá esto para empezar a usar el sistema
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <li key={i}>
              {s.done ? (
                <div className="flex items-center gap-3 text-sm text-foreground-muted line-through">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  {s.label}
                </div>
              ) : (
                <Link href={s.href} className="flex items-start gap-3 rounded-lg border border-primary-200 bg-white p-3 hover:bg-primary-50 transition-colors">
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-primary-400" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.label}</p>
                    <p className="text-xs text-foreground-muted mt-0.5">{s.hint}</p>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-foreground-muted mt-0.5" />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/api/reports/dashboard'),
    refetchInterval: 60_000,
  });

  const { data: producers = [] } = useQuery({ queryKey: ['producers'], queryFn: () => producersApi.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list() });

  const kpis = [
    {
      label: 'Leche recibida hoy',
      value: data ? `${data.milkReceivedTodayLiters.toLocaleString('es-AR', { maximumFractionDigits: 0 })} L` : '—',
      sub: `${data?.receptionsToday ?? 0} recepciones`,
      icon: Milk,
      href: '/recepciones',
      accent: 'text-primary-600',
      bg: 'bg-primary-50',
    },
    {
      label: 'Producciones hoy',
      value: data ? String(data.productionsClosedToday) : '—',
      sub: 'órdenes cerradas',
      icon: Factory,
      href: '/produccion',
      accent: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Pedidos tomados hoy',
      value: data ? String(data.ordersTakenToday) : '—',
      sub: 'nuevos pedidos',
      icon: ShoppingCart,
      href: '/ventas',
      accent: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: 'A cobrar',
      value: data ? `$${data.openInvoicesAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—',
      sub: `${data?.openInvoicesCount ?? 0} comprobantes`,
      icon: Wallet,
      href: '/comprobantes',
      accent: data && data.openInvoicesAmount > 0 ? 'text-warning' : 'text-foreground-muted',
      bg: data && data.openInvoicesAmount > 0 ? 'bg-yellow-50' : 'bg-surface-subtle',
    },
    {
      label: 'Alertas de stock',
      value: data ? String(data.stockAlerts) : '—',
      sub: data && data.stockAlerts > 0 ? 'productos con stock bajo' : 'todo en orden',
      icon: AlertTriangle,
      href: '/inventario',
      accent: data && data.stockAlerts > 0 ? 'text-danger' : 'text-success',
      bg: data && data.stockAlerts > 0 ? 'bg-red-50' : 'bg-green-50',
    },
  ];

  const acciones = [
    { href: '/recepciones/nueva', label: 'Registrar entrada de leche', icon: Milk, desc: 'Llegó un camión del tambo' },
    { href: '/produccion/nueva', label: 'Abrir orden de producción', icon: Factory, desc: 'Empezar a fabricar un producto' },
    { href: '/ventas/nuevo', label: 'Tomar un pedido', icon: ShoppingCart, desc: 'Un cliente quiere comprar' },
    { href: '/productores', label: 'Ver productores', icon: Tractor, desc: 'Los tambos que te traen leche' },
    { href: '/clientes', label: 'Ver clientes', icon: Users, desc: 'Los comercios a quienes vendés' },
    { href: '/comprobantes', label: 'Comprobantes', icon: Receipt, desc: 'Facturas y cuentas por cobrar' },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={user ? `Buen día${user.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}` : 'Inicio'}
        description="Vista general de la planta hoy."
      />

      <SetupChecklist
        producers={producers.length}
        clients={clients.length}
        products={products.length}
      />

      <section aria-label="Indicadores del día">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-foreground-muted">Lo de hoy</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <Link key={k.label} href={k.href} className="block">
                <Card className={`flex items-center gap-4 p-4 hover:shadow-md transition-shadow cursor-pointer`}>
                  <div className={`rounded-xl p-3 ${k.bg} shrink-0`}>
                    <Icon className={`h-6 w-6 ${k.accent}`} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-foreground-muted">{k.label}</p>
                    <p className="text-2xl font-bold text-foreground leading-tight">
                      {isLoading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-surface-subtle" /> : k.value}
                    </p>
                    <p className="text-xs text-foreground-muted">{k.sub}</p>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-foreground-muted" />
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-label="Acciones rápidas">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-foreground-muted">¿Qué querés hacer?</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {acciones.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-elevated p-4 hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
              >
                <Icon className="h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{a.label}</p>
                  <p className="text-xs text-foreground-muted truncate">{a.desc}</p>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-foreground-muted" />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
