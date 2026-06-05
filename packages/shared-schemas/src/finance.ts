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
  // Cuenta (caja o banco) a la que impacta el movimiento. Nullable en datos viejos.
  accountId: uuidSchema.nullable().optional(),
  accountName: z.string().optional(),
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
  // Cuenta a la que impacta. Si se omite, va a la cuenta "Caja" por defecto.
  accountId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateCashMovementInput = z.infer<typeof createCashMovementInputSchema>;

// --- Cuentas (caja / banco) con saldo calculado ---
export const accountKindSchema = z.enum(['caja', 'banco']);
export type AccountKind = z.infer<typeof accountKindSchema>;

export const accountSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  kind: accountKindSchema,
  openingBalance: z.number(), // saldo inicial
  balance: z.number(), // saldo inicial + Σ ingresos − Σ egresos
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

// en_cartera = pendiente; cobrado = acreditado (impacta saldo); rechazado = no se cobró.
export const chequeStatusSchema = z.enum(['en_cartera', 'cobrado', 'rechazado']);
export type ChequeStatus = z.infer<typeof chequeStatusSchema>;

export const chequeSchema = z.object({
  id: uuidSchema,
  kind: chequeKindSchema,
  number: z.string(),
  amount: z.number().nonnegative(),
  dueDate: isoDateTimeSchema.nullable(),
  status: chequeStatusSchema,
  // Cuenta a la que impacta cuando se cobra/acredita.
  accountId: uuidSchema.nullable(),
  accountName: z.string().optional(),
  counterparty: z.string().nullable(), // de quién es / a quién se le dio
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

// Cambio de estado del cheque. Al pasar a "cobrado" impacta el saldo de la cuenta.
export const updateChequeStatusInputSchema = z.object({
  status: chequeStatusSchema,
  accountId: uuidSchema.optional(), // cuenta donde se acredita al cobrar (si no, la del cheque)
});
export type UpdateChequeStatusInput = z.infer<typeof updateChequeStatusInputSchema>;

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
