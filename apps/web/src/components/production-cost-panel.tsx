'use client';

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ProductionCostBreakdown } from '@lasmarias/shared-schemas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatMoney } from '@/lib/utils';

// Panel de costo — el corazón del sistema (CLAUDE.md §4.7). Muestra el desglose REAL,
// el costo por kg destacado, y la comparación REAL vs ESTÁNDAR con el desvío en $ y %.
// Los valores llegan como string DECIMAL (o null) desde el backend; los formateamos en pesos.

// Mapa amigable de códigos de warning del backend a texto del negocio (cero jerga técnica).
const WARNING_LABELS: Record<string, string> = {
  KG_PRODUCTO_CERO: 'Todavía no se cargó producción, no se puede calcular el costo por kg.',
  LITROS_CERO: 'No se cargaron litros de leche en la orden.',
  SIN_RECETA: 'La orden no tiene una receta asociada.',
};

function warningLabel(w: string): string {
  return WARNING_LABELS[w] ?? w;
}

function pesos(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return formatMoney(n);
}

function pct(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
}

function kg(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

// Desvío: si el real está POR DEBAJO del estándar (negativo) es bueno (verde);
// por encima (positivo) es malo (rojo); 0 es neutro.
function varianceTone(value: string | null | undefined): 'good' | 'bad' | 'neutral' {
  if (value === null || value === undefined || value === '') return 'neutral';
  const n = Number(value);
  if (Number.isNaN(n) || n === 0) return 'neutral';
  return n < 0 ? 'good' : 'bad';
}

interface Props {
  breakdown: ProductionCostBreakdown;
  className?: string;
}

export function ProductionCostPanel({ breakdown, className }: Props) {
  const { real, estandar, variance } = breakdown;
  const hasWarnings = real.warnings.length > 0;
  const costPerKgMissing = real.costoPorKg === null || real.costoPorKg === '';

  const netTone = varianceTone(variance.desvioCostoNeto);
  const kgTone = varianceTone(variance.desvioCostoPorKg);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Costo del lote</CardTitle>
        <p className="text-sm text-foreground-muted">
          Costo real de esta elaboración, comparado con el estándar de la receta.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Aviso si no se puede calcular (ej: no se cargó producción). */}
        {hasWarnings && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <ul className="space-y-0.5">
              {real.warnings.map((w) => (
                <li key={w}>{warningLabel(w)}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Costo por kg destacado — el número que más importa. */}
        <div className="rounded-lg border border-border-subtle bg-surface-subtle/40 p-5 text-center">
          <p className="text-sm font-medium text-foreground-muted">Costo por kg</p>
          {costPerKgMissing ? (
            <p className="mt-1 text-2xl font-semibold text-foreground-muted">Sin datos</p>
          ) : (
            <p className="mt-1 font-display text-4xl font-bold text-foreground">{pesos(real.costoPorKg)}</p>
          )}
          {real.rendimiento && (
            <p className="mt-1 text-sm text-foreground-muted">
              Rendimiento: {kg(real.rendimiento)} kg/litro
            </p>
          )}
        </div>

        {/* Desglose del costo real. */}
        <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-2 sm:gap-x-8">
          <div className="flex items-center justify-between border-b border-border-subtle py-1.5">
            <dt className="text-foreground-muted">Costo de leche / masa</dt>
            <dd className="font-medium">{pesos(real.costoInputs)}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-border-subtle py-1.5">
            <dt className="text-foreground-muted">Costo de insumos</dt>
            <dd className="font-medium">{pesos(real.costoInsumos)}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-border-subtle py-1.5">
            <dt className="text-foreground-muted">Costo bruto</dt>
            <dd className="font-medium">{pesos(real.costoBruto)}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-border-subtle py-1.5">
            <dt className="text-foreground-muted">Valor recuperado de subproductos</dt>
            <dd className="font-medium text-primary-700">− {pesos(real.valorSubproductos)}</dd>
          </div>
          <div className="flex items-center justify-between py-1.5 sm:col-span-2">
            <dt className="text-base font-semibold text-foreground">Costo neto del lote</dt>
            <dd className="text-base font-bold text-foreground">{pesos(real.costoNeto)}</dd>
          </div>
        </dl>

        {/* REAL vs ESTÁNDAR con desvío resaltado. */}
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Real vs. estándar</p>
          <div className="overflow-hidden rounded-lg border border-border-subtle">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle/40 text-xs uppercase tracking-wide text-foreground-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Indicador</th>
                  <th className="px-3 py-2 text-right font-medium">Real</th>
                  <th className="px-3 py-2 text-right font-medium">Estándar</th>
                  <th className="px-3 py-2 text-right font-medium">Desvío</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border-subtle">
                  <td className="px-3 py-2 text-foreground-muted">Costo neto</td>
                  <td className="px-3 py-2 text-right font-medium">{pesos(real.costoNeto)}</td>
                  <td className="px-3 py-2 text-right text-foreground-muted">{pesos(estandar.costoNeto)}</td>
                  <td className="px-3 py-2 text-right">
                    <VarianceCell tone={netTone} amount={pesos(variance.desvioCostoNeto)} percent={pct(variance.desvioCostoNetoPct)} />
                  </td>
                </tr>
                <tr className="border-t border-border-subtle">
                  <td className="px-3 py-2 text-foreground-muted">Costo por kg</td>
                  <td className="px-3 py-2 text-right font-medium">{pesos(real.costoPorKg)}</td>
                  <td className="px-3 py-2 text-right text-foreground-muted">{pesos(estandar.costoPorKg)}</td>
                  <td className="px-3 py-2 text-right">
                    <VarianceCell tone={kgTone} amount={pesos(variance.desvioCostoPorKg)} percent={pct(variance.desvioCostoPorKgPct)} />
                  </td>
                </tr>
                <tr className="border-t border-border-subtle">
                  <td className="px-3 py-2 text-foreground-muted">Rendimiento (kg/l)</td>
                  <td className="px-3 py-2 text-right font-medium">{kg(real.rendimiento)}</td>
                  <td className="px-3 py-2 text-right text-foreground-muted">{kg(estandar.rendimiento)}</td>
                  <td className="px-3 py-2 text-right text-foreground-muted">
                    {variance.desvioRendimiento ? `${kg(variance.desvioRendimiento)} (${pct(variance.desvioRendimientoPct)})` : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-foreground-muted">
            En verde, el costo real quedó por debajo del estándar; en rojo, por encima.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function VarianceCell({ tone, amount, percent }: { tone: 'good' | 'bad' | 'neutral'; amount: string; percent: string }) {
  const Icon = tone === 'good' ? ArrowDownRight : tone === 'bad' ? ArrowUpRight : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-end gap-1 font-semibold',
        tone === 'good' && 'text-primary-700',
        tone === 'bad' && 'text-red-600',
        tone === 'neutral' && 'text-foreground-muted',
      )}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>
        {amount} {percent !== '—' && <span className="font-normal">({percent})</span>}
      </span>
    </span>
  );
}
