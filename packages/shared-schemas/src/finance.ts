import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// Fase comercial — Flujo de caja simple (sin partida doble ni plan de cuentas).
// Ingresos (cobros) y egresos (gastos) con categoría y fecha.

export const cashMovementKindSchema = z.enum(['income', 'expense']);
export type CashMovementKind = z.infer<typeof cashMovementKindSchema>;

export const cashMovementSchema = z.object({
  id: uuidSchema,
  kind: cashMovementKindSchema,
  amount: z.number().nonnegative(),
  category: z.string(),
  occurredAt: isoDateTimeSchema,
  referenceType: z.string().nullable(),
  referenceId: uuidSchema.nullable(),
  notes: z.string().nullable(),
  createdById: uuidSchema.nullable(),
});
export type CashMovement = z.infer<typeof cashMovementSchema>;

// Carga manual de un movimiento de caja (típicamente un gasto).
export const createCashMovementInputSchema = z.object({
  kind: cashMovementKindSchema,
  amount: z.number().positive('El importe tiene que ser mayor a 0'),
  category: z.string().min(1, 'Indicá una categoría').max(40),
  occurredAt: isoDateTimeSchema.optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateCashMovementInput = z.infer<typeof createCashMovementInputSchema>;

// Flujo de caja agregado por período.
export const cashFlowRowSchema = z.object({
  period: z.string(), // ISO del inicio del período (día o mes)
  income: z.number(),
  expense: z.number(),
  net: z.number(), // income − expense
});
export type CashFlowRow = z.infer<typeof cashFlowRowSchema>;

export const cashFlowReportSchema = z.object({
  rows: z.array(cashFlowRowSchema),
  totalIncome: z.number(),
  totalExpense: z.number(),
  net: z.number(),
});
export type CashFlowReport = z.infer<typeof cashFlowReportSchema>;
