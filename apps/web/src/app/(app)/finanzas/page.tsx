'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Landmark, Receipt, ScrollText, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { FinanceTabs } from '@/components/finance-tabs';
import { financeApi, salesApi, suppliersApi, producersApi } from '@/features/api';
import { formatMoney as money, formatSignedMoney as signedMoney } from '@/lib/utils';

// Resumen de plata (CLAUDE.md §9 UX): responde de un vistazo "¿cuánto tengo? ¿cuánto me
// deben? ¿cuánto debo?" — todo con datos que ya calcula el sistema, cada uno linkeado a
// su detalle. Solo lectura y composición; no toca backend.

const fmtDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function StatCard({
  href, icon: Icon, label, value, tone = 'neutral', sub, cta,
}: {
  href: string; icon: LucideIcon; label: string; value: string;
  tone?: 'good' | 'bad' | 'neutral'; sub?: React.ReactNode; cta: string;
}) {
  const valueColor = tone === 'good' ? 'text-primary-700' : tone === 'bad' ? 'text-danger' : 'text-foreground';
  return (
    <Link href={href} className="group block">
      <Card className="h-full transition-all hover:border-primary-300 hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-2 pt-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-[11px] uppercase tracking-wide text-foreground-muted">{label}</p>
          <p className={`font-display text-2xl font-bold tracking-tight ${valueColor}`}>{value}</p>
          {sub && <div className="text-xs text-foreground-muted">{sub}</div>}
          <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium text-primary-700">
            {cta} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function FinanzasPage() {
  const accountsQ = useQuery({ queryKey: ['finance-accounts'], queryFn: () => financeApi.accounts() });
  const chequesQ = useQuery({ queryKey: ['cheques'], queryFn: () => financeApi.cheques() });
  const clientsAccQ = useQuery({ queryKey: ['accounts'], queryFn: () => salesApi.accounts() });
  const suppliersAccQ = useQuery({ queryKey: ['supplier-accounts'], queryFn: () => suppliersApi.accounts() });
  const tambosAccQ = useQuery({ queryKey: ['producer-accounts'], queryFn: () => producersApi.accounts() });

  const now = new Date();
  const monthFrom = fmtDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthTo = `${fmtDay(now)}T23:59:59.999`;
  const cashFlowQ = useQuery({
    queryKey: ['cash-flow', monthFrom, fmtDay(now), 'month'],
    queryFn: () => financeApi.cashFlow(monthFrom, monthTo, 'month'),
  });

  // --- Composición de KPIs (todo de endpoints existentes) ---
  const disponible = (accountsQ.data ?? []).reduce((a, c) => a + c.balance, 0);
  const chequesCartera = (chequesQ.data ?? []).filter((c) => c.status === 'en_cartera');
  const chequesTotal = chequesCartera.reduce((a, c) => a + c.amount, 0);

  const meDeben = (clientsAccQ.data ?? []).filter((c) => c.balance > 0).reduce((a, c) => a + c.balance, 0);
  const meDebenVencido = (clientsAccQ.data ?? []).reduce((a, c) => a + Math.max(0, c.overdue), 0);

  const deboTambos = (tambosAccQ.data ?? []).reduce((a, t) => a + Math.max(0, t.balance), 0);
  const deboProv = (suppliersAccQ.data ?? []).reduce((a, s) => a + Math.max(0, s.balance), 0);
  const provVencido = (suppliersAccQ.data ?? []).reduce((a, s) => a + Math.max(0, s.overdue), 0);
  const totalDebo = deboTambos + deboProv;

  const neta = disponible + meDeben - totalDebo;
  const mes = cashFlowQ.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Finanzas" description="Toda la plata de la quesería en un solo lugar." />
      <FinanceTabs />

      {/* Posición de hoy */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          href="/caja" icon={Wallet} label="Plata disponible" tone="good"
          value={money(disponible)} cta="Ver caja y bancos"
          sub={`En ${(accountsQ.data ?? []).length} ${(accountsQ.data ?? []).length === 1 ? 'cuenta' : 'cuentas'} (caja + bancos)`}
        />
        <StatCard
          href="/cuentas" icon={Landmark} label="Me deben (clientes)" tone={meDeben > 0 ? 'good' : 'neutral'}
          value={money(meDeben)} cta="Ver cobranzas"
          sub={meDebenVencido > 0 ? <span className="font-medium text-danger">{money(meDebenVencido)} vencido</span> : 'Al día'}
        />
        {/* "Le debo" abre a DOS lugares (tambos e insumos), así el número no es un clic muerto. */}
        <Card className="h-full">
          <CardContent className="flex h-full flex-col gap-2 pt-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <Receipt className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="text-[11px] uppercase tracking-wide text-foreground-muted">Le debo (total)</p>
            <p className={`font-display text-2xl font-bold tracking-tight ${totalDebo > 0 ? 'text-danger' : 'text-foreground'}`}>{money(totalDebo)}</p>
            <div className="text-xs text-foreground-muted">
              Tambos {money(deboTambos)} · Insumos {money(deboProv)}
              {provVencido > 0 ? <> · <span className="font-medium text-danger">{money(provVencido)} vencido</span></> : null}
            </div>
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs font-medium text-primary-700">
              <Link href="/pagos-tambos" className="inline-flex items-center gap-1 hover:underline">Pagar tambos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
              <Link href="/cuentas-pagar" className="inline-flex items-center gap-1 hover:underline">Pagar insumos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
          </CardContent>
        </Card>
        <StatCard
          href="/cheques" icon={ScrollText} label="Cheques en cartera"
          value={money(chequesTotal)} cta="Ver cheques"
          sub={`${chequesCartera.length} ${chequesCartera.length === 1 ? 'cheque' : 'cheques'} sin cobrar`}
        />
      </div>

      {/* Posición neta + mes en curso */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <p className="text-[11px] uppercase tracking-wide text-foreground-muted" title="Plata disponible + lo que te deben − lo que debés">
              Posición neta
            </p>
            <p className={`mt-1 font-display text-3xl font-bold tracking-tight ${neta < 0 ? 'text-danger' : 'text-foreground'}`}>{signedMoney(neta)}</p>
            <p className="mt-1 text-xs text-foreground-muted">Disponible {money(disponible)} + por cobrar {money(meDeben)} − por pagar {money(totalDebo)}</p>
          </CardContent>
        </Card>

        <Link href="/caja" className="group block">
          <Card className="h-full transition-all hover:border-primary-300 hover:shadow-md">
            <CardContent className="pt-6">
              <p className="text-[11px] uppercase tracking-wide text-foreground-muted">Caja del mes</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1 text-primary-700"><TrendingUp className="h-4 w-4" aria-hidden="true" /> {money(mes?.totalIncome ?? 0)}</span>
                <span className="inline-flex items-center gap-1 text-danger"><TrendingDown className="h-4 w-4" aria-hidden="true" /> {money(mes?.totalExpense ?? 0)}</span>
                <span className={`font-display text-xl font-bold tracking-tight ${(mes?.net ?? 0) < 0 ? 'text-danger' : 'text-foreground'}`}>Neto {signedMoney(mes?.net ?? 0)}</span>
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-700">
                Ver flujo de caja <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
