import { z } from 'zod';
import { uuidSchema } from './common';

// Fase comercial — Home: resumen de KPIs comerciales/financieros + calendario.

export const homeSummarySchema = z.object({
  saldoTotalPorCobrar: z.number(), // Σ saldos positivos de cuenta corriente
  cobrosEstaSemana: z.number(), // Σ cobros (payment) de la semana corriente
  despachosHoy: z.number().int(), // cantidad de despachos de hoy
  ventasMes: z.number(), // Σ total de despachos del mes corriente
  cajaNetaMes: z.number(), // income − expense del mes corriente
  lotesPorVencer: z.number().int(), // lotes activos que vencen en los próximos 7 días
});
export type HomeSummary = z.infer<typeof homeSummarySchema>;

export const homeEventTypeSchema = z.enum(['cobro', 'vencimiento_lote', 'despacho']);
export type HomeEventType = z.infer<typeof homeEventTypeSchema>;

export const homeCalendarEventSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  type: homeEventTypeSchema,
  label: z.string(),
  amount: z.number().optional(),
  refId: uuidSchema.nullable(),
});
export type HomeCalendarEvent = z.infer<typeof homeCalendarEventSchema>;

export const homeCalendarSchema = z.object({
  month: z.string(), // YYYY-MM
  events: z.array(homeCalendarEventSchema),
});
export type HomeCalendar = z.infer<typeof homeCalendarSchema>;
