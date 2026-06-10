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
  accountId: uuidSchema.nullable().optional(),
  accountName: z.string().optional(),
  referenceType: z.string().nullable(),
  referenceId: uuidSchema.nullable(),
  notes: z.string().nullable(),
  createdById: uuidSchema.nullable(),
  reconciled: z.boolean(),
});
export type CashMovement = z.infer<typeof cashMovementSchema>;

export const createCashMovementInputSchema = z.object({
  kind: cashMovementKindSchema,
  amount: z.number().positive('El importe tiene que ser mayor a 0'),
  category: z.string().min(1, 'Indicá una categoría').max(40),
  occurredAt: isoDateTimeSchema.optional(),
  accountId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
  reconciled: z.boolean().optional(),
});
export type CreateCashMovementInput = z.infer<typeof createCashMovementInputSchema>;

export const reconcileMovementInputSchema = z.object({
  reconciled: z.boolean(),
});
export type ReconcileMovementInput = z.infer<typeof reconcileMovementInputSchema>;

// --- Cuentas (caja / banco) con saldo calculado ---
export const accountKindSchema = z.enum(['caja', 'banco']);
export type AccountKind = z.infer<typeof accountKindSchema>;

export const accountSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: accountKindSchema,
  openingBalance: z.number(),
  balance: z.number(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type Account = z.infer<typeof accountSchema>;

export const createAccountInputSchema = z.object({
  name: z.string().min(1, 'Ingresá el nombre de la cuenta').max(120),
  kind: accountKindSchema,
  openingBalance: z.number().default(0),
});
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const updateAccountInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  openingBalance: z.number().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

// --- Catálogo de categorías de gasto (normalizado) ---
export const expenseCategorySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  isActive: z.boolean(),
});
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const createExpenseCategoryInputSchema = z.object({
  name: z.string().min(1, 'Ingresá el nombre').max(40),
});
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategoryInputSchema>;

// --- Cheques (recibidos de terceros / propios emitidos) ---
export const chequeKindSchema = z.enum(['recibido', 'propio']);
export type ChequeKind = z.infer<typeof chequeKindSchema>;

export const chequeStatusSchema = z.enum(['en_cartera', 'cobrado', 'rechazado']);
export type ChequeStatus = z.infer<typeof chequeStatusSchema>;

export const CHEQUE_REJECTION_REASONS = [
  'Sin fondos suficientes',
  'Sin firma / Firma disconforme',
  'Cuenta cerrada',
  'Cheque vencido',
  'Endoso irregular',
  'Orden de no pagar',
  'Datos incorrectos',
  'Otro',
] as const;
export type ChequeRejectionReason = typeof CHEQUE_REJECTION_REASONS[number];

export const chequeSchema = z.object({
  id: uuidSchema,
  kind: chequeKindSchema,
  number: z.string(),
  amount: z.number().nonnegative(),
  dueDate: isoDateTimeSchema.nullable(),
  status: chequeStatusSchema,
  accountId: uuidSchema.nullable(),
  accountName: z.string().optional(),
  counterparty: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type Cheque = z.infer<typeof chequeSchema>;

export const createChequeInputSchema = z.object({
  kind: chequeKindSchema,
  number: z.string().min(1, 'Ingresá el número').max(40),
  amount: z.number().positive('El importe tiene que ser mayor a 0'),
  dueDate: isoDateTimeSchema.nullable().optional(),
  accountId: uuidSchema.optional(),
  counterparty: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateChequeInput = z.infer<typeof createChequeInputSchema>;

export const updateChequeStatusInputSchema = z.object({
  status: chequeStatusSchema,
  accountId: uuidSchema.optional(),
  rejectionReason: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});
export type UpdateChequeStatusInput = z.infer<typeof updateChequeStatusInputSchema>;

// Flujo de caja agregado por período.
export const cashFlowRowSchema = z.object({
  period: z.string(),
  income: z.number(),
  expense: z.number(),
  net: z.number(),
});
export type CashFlowRow = z.infer<typeof cashFlowRowSchema>;

export const cashFlowReportSchema = z.object({
  rows: z.array(cashFlowRowSchema),
  totalIncome: z.number(),
  totalExpense: z.number(),
  net: z.number(),
});
export type CashFlowReport = z.infer<typeof cashFlowReportSchema>;
