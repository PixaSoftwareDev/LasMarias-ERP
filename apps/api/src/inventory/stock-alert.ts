import type { StockSummary } from '@lasmarias/shared-schemas';

export type AlertLevel = NonNullable<StockSummary['alertLevel']>;

export interface ResolveAlertLevelInput {
  totalQuantity: number;
  // Stock mínimo configurado para el producto. null/undefined = sin umbral.
  minStock?: number | null;
  // Días hasta el vencimiento más próximo. null/undefined = sin lote con vencimiento.
  daysToExpire?: number | null;
}

// Decide el nivel de alerta de un producto en stock (CLAUDE.md §4.4).
// Prioridad: critical > low > expiring > ok.
//   - critical: hay un lote vencido (daysToExpire <= 0).
//   - low: hay stock mínimo y el stock total está en o por debajo del umbral (borde inclusivo).
//   - expiring: el lote más próximo vence dentro de 7 días.
//   - ok: nada de lo anterior.
// Función pura, sin dependencias, para testear el criterio aislado.
export function resolveAlertLevel({
  totalQuantity,
  minStock,
  daysToExpire,
}: ResolveAlertLevelInput): AlertLevel {
  const hasExpiry = daysToExpire != null;

  // 1. critical — un lote ya vencido tiene la prioridad máxima.
  if (hasExpiry && daysToExpire! <= 0) return 'critical';

  // 2. low — stock en o por debajo del mínimo configurado (borde inclusivo).
  if (minStock != null && totalQuantity <= minStock) return 'low';

  // 3. expiring — próximo a vencer.
  if (hasExpiry && daysToExpire! <= 7) return 'expiring';

  // 4. ok.
  return 'ok';
}
