import { z } from 'zod';

// Reportes básicos (CLAUDE.md §4.9 / Fase 2). Solo SELECT agregados, sin BI.
// Los valores de dinero/cantidades se devuelven como number ya agregados.

// --- Producción agrupada por período ---
export const reportGranularitySchema = z.enum(['day', 'month']);
export type ReportGranularity = z.infer<typeof reportGranularitySchema>;

export const productionReportRowSchema = z.object({
  period: z.string(), // ISO date del inicio del período (date_trunc)
  ordersCount: z.number(),
  totalMilkLiters: z.number(),
  totalPrincipalKg: z.number(),
  totalCost: z.number(),
});
export type ProductionReportRow = z.infer<typeof productionReportRowSchema>;

// --- Ventas por cliente ---
export const salesByClientRowSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  dispatchCount: z.number(),
  total: z.number(),
});
export type SalesByClientRow = z.infer<typeof salesByClientRowSchema>;

// --- Ventas por producto ---
export const salesByProductRowSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.number(),
  subtotal: z.number(),
});
export type SalesByProductRow = z.infer<typeof salesByProductRowSchema>;

// --- Rendimiento real vs esperado por orden cerrada ---
export const yieldReportRowSchema = z.object({
  orderCode: z.string(),
  productName: z.string(),
  litros: z.number(),
  kgReal: z.number(),
  rendimientoReal: z.number().nullable(),
  rendimientoEsperado: z.number().nullable(),
  desvioRendimiento: z.number().nullable(),
  desvioRendimientoPct: z.number().nullable(),
});
export type YieldReportRow = z.infer<typeof yieldReportRowSchema>;

// --- Rentabilidad por cliente (ingresos − costo de lo despachado) ---
export const profitabilityRowSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  revenue: z.number(), // Σ total de despachos, neto de notas de crédito
  cost: z.number(), // Σ(cantidad despachada × unitCost del lote)
  margin: z.number(), // revenue − cost
  marginPct: z.number().nullable(), // margin / revenue (null si revenue 0)
  hasMissingCost: z.boolean(), // true si algún lote despachado no tenía unitCost
});
export type ProfitabilityRow = z.infer<typeof profitabilityRowSchema>;
