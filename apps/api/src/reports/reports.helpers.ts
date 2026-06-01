import Big from 'big.js';
import type {
  ProductionCostBreakdown,
  ProfitabilityRow,
  SalesByProductRow,
  SalesOrderLine,
  YieldReportRow,
} from '@lasmarias/shared-schemas';

// Convierte un valor que puede venir como string DECIMAL, number o null a number|null.
function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Agregación en memoria de ventas por producto a partir de las líneas (jsonb) de
// las órdenes del rango. Suma cantidad y subtotal por productId, conservando el
// último nombre visto. Devuelve ordenado por subtotal descendente.
export function aggregateSalesByProduct(
  ordersLines: ReadonlyArray<ReadonlyArray<SalesOrderLine>>,
): SalesByProductRow[] {
  const byProduct = new Map<string, SalesByProductRow>();

  for (const lines of ordersLines) {
    for (const line of lines) {
      const existing = byProduct.get(line.productId);
      if (existing) {
        existing.productName = line.productName;
        existing.quantity += line.quantity;
        existing.subtotal += line.subtotal;
      } else {
        byProduct.set(line.productId, {
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          subtotal: line.subtotal,
        });
      }
    }
  }

  return [...byProduct.values()].sort((a, b) => b.subtotal - a.subtotal);
}

// Arma una fila de rendimiento reutilizando el costBreakdown ya persistido al
// cerrar la orden. NO recalcula nada: lee real.rendimiento, estandar.rendimiento
// y variance.desvioRendimiento*.
export function buildYieldRow(input: {
  orderCode: string;
  productName: string;
  totalMilkLiters: string | number | null;
  totalPrincipalKg: string | number | null;
  costBreakdown: ProductionCostBreakdown | null;
}): YieldReportRow {
  const cb = input.costBreakdown;
  return {
    orderCode: input.orderCode,
    productName: input.productName,
    litros: num(input.totalMilkLiters) ?? 0,
    kgReal: num(input.totalPrincipalKg) ?? 0,
    rendimientoReal: cb ? num(cb.real.rendimiento) : null,
    rendimientoEsperado: cb ? num(cb.estandar.rendimiento) : null,
    desvioRendimiento: cb ? num(cb.variance.desvioRendimiento) : null,
    desvioRendimientoPct: cb ? num(cb.variance.desvioRendimientoPct) : null,
  };
}

// --- Rentabilidad por cliente (CLAUDE.md §4.7) ---
// Cruza ingresos (Σ total de despachos, neto de notas de crédito) con el costo de lo
// despachado (Σ cantidad × unitCost del lote). Función pura: recibe filas ya cruzadas.
const MONEY_DP = 2;
const RATE_DP = 4;

export interface RevenueRow {
  clientId: string;
  clientName: string;
  revenue: string | number | null; // total de despachos del cliente
  creditNotes?: string | number | null; // notas de crédito a netear
}

// Cada renglón de costo: una salida de stock (reason='sale') con su unitCost de lote.
export interface CostRow {
  clientId: string;
  quantity: string | number | null;
  unitCost: string | number | null; // null = lote sin costo (se marca, NO se asume 0)
}

// Agrega costos por cliente y calcula margen. Lotes sin unitCost marcan hasMissingCost
// y NO suman al costo (no se asume 0). marginPct = null si revenue es 0.
export function computeMargin(
  revenueRows: ReadonlyArray<RevenueRow>,
  costRows: ReadonlyArray<CostRow>,
): ProfitabilityRow[] {
  // Acumular costo por cliente.
  const costByClient = new Map<string, { cost: Big; missing: boolean }>();
  for (const r of costRows) {
    const entry = costByClient.get(r.clientId) ?? { cost: new Big(0), missing: false };
    const qty = num(r.quantity);
    const uc = num(r.unitCost);
    if (qty === null || uc === null) {
      // Lote sin costo (o cantidad inválida): se marca, no se suma.
      entry.missing = true;
    } else {
      entry.cost = entry.cost.plus(new Big(qty).times(new Big(uc)));
    }
    costByClient.set(r.clientId, entry);
  }

  const rows: ProfitabilityRow[] = revenueRows.map((rv) => {
    const grossRevenue = new Big(num(rv.revenue) ?? 0);
    const credit = new Big(num(rv.creditNotes) ?? 0);
    const revenue = grossRevenue.minus(credit);
    const costEntry = costByClient.get(rv.clientId) ?? { cost: new Big(0), missing: false };
    const cost = costEntry.cost;
    const margin = revenue.minus(cost);
    const marginPct = revenue.eq(0)
      ? null
      : margin.div(revenue).times(100).round(RATE_DP).toNumber();
    return {
      clientId: rv.clientId,
      clientName: rv.clientName,
      revenue: revenue.round(MONEY_DP).toNumber(),
      cost: cost.round(MONEY_DP).toNumber(),
      margin: margin.round(MONEY_DP).toNumber(),
      marginPct,
      hasMissingCost: costEntry.missing,
    };
  });

  return rows.sort((a, b) => b.margin - a.margin);
}
