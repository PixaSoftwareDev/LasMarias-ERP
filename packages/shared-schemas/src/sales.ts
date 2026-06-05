import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';
import { clientTypeSchema } from './client';

// Fase comercial — Despacho de mercadería: cliente + líneas con precio (lista por
// tipo de cliente, editable a mano) → baja de stock + cargo en cuenta corriente.

export const salesOrderLineSchema = z.object({
  productId: uuidSchema,
  productName: z.string(),
  sku: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  unit: z.string(),
  subtotal: z.number().nonnegative(),
});
export type SalesOrderLine = z.infer<typeof salesOrderLineSchema>;

export const salesOrderSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  clientId: uuidSchema,
  clientName: z.string(),
  dispatchedAt: isoDateTimeSchema,
  lines: z.array(salesOrderLineSchema),
  total: z.number().nonnegative(),
  notes: z.string().max(1000).optional(),
  documentType: z.enum(['remito']).default('remito'), // remito interno (NO fiscal)
  // Forma de pago con la que se registró la venta (informativo). Nullable en ventas viejas.
  paymentMode: z.enum(['contado', 'cuenta_corriente']).nullable().optional(),
  createdById: uuidSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type SalesOrder = z.infer<typeof salesOrderSchema>;

export const createSalesOrderInputSchema = z.object({
  clientId: uuidSchema,
  lines: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: z.number().positive('La cantidad tiene que ser mayor a 0'),
        unitPrice: z.number().nonnegative('El precio no puede ser negativo'),
      }),
    )
    .min(1, 'Cargá al menos un ítem'),
  notes: z.string().max(1000).optional(),
  // Condición de pago de este despacho. Si se omite, se usa la del cliente
  // (paymentTermDays). Si es contado, además se registra el cobro → saldo 0.
  paymentMode: z.enum(['contado', 'cuenta_corriente']).optional(),
});
export type CreateSalesOrderInput = z.infer<typeof createSalesOrderInputSchema>;

// --- Listas de precio por tipo de cliente (editable a mano) ---
// Un precio por (tipo de cliente, producto). Sin vigencias: la fila vigente es is_active.
export const priceListItemSchema = z.object({
  id: uuidSchema,
  clientType: clientTypeSchema,
  productId: uuidSchema,
  productName: z.string(),
  sku: z.string(),
  unit: z.string(),
  unitPrice: z.number().nonnegative(),
  isActive: z.boolean(),
});
export type PriceListItem = z.infer<typeof priceListItemSchema>;

// Upsert masivo: reemplaza los precios vigentes del tipo de cliente indicado.
export const upsertPriceListInputSchema = z.object({
  clientType: clientTypeSchema,
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        unitPrice: z.number().nonnegative('El precio no puede ser negativo'),
      }),
    )
    .min(1, 'Cargá al menos un precio'),
});
export type UpsertPriceListInput = z.infer<typeof upsertPriceListInputSchema>;

// --- Cuenta corriente ---
export const accountMovementKindSchema = z.enum(['charge', 'payment', 'credit_note']);
export type AccountMovementKind = z.infer<typeof accountMovementKindSchema>;

export const accountMovementSchema = z.object({
  id: uuidSchema,
  clientId: uuidSchema,
  kind: accountMovementKindSchema,
  amount: z.number().nonnegative(), // siempre positivo; el signo lo da el kind
  referenceType: z.string().nullable(),
  referenceId: uuidSchema.nullable(),
  occurredAt: isoDateTimeSchema,
  dueDate: isoDateTimeSchema.nullable(),
  notes: z.string().nullable(),
  createdById: uuidSchema.nullable(),
});
export type AccountMovement = z.infer<typeof accountMovementSchema>;

// Saldo por cliente (vista lista de cuentas corrientes).
export const accountBalanceSchema = z.object({
  clientId: uuidSchema,
  clientName: z.string(),
  balance: z.number(), // Σcharge − Σpayment − Σcredit_note (puede ser negativo = saldo a favor)
  overdue: z.number(), // deuda vencida (cargos cuyo vencimiento ya pasó)
  warnings: z.array(z.string()),
});
export type AccountBalance = z.infer<typeof accountBalanceSchema>;

// Antigüedad de saldo por tramos (sobre cargos impagos, imputación FIFO).
export const accountAgingSchema = z.object({
  current: z.number(), // 0-30 días (≤30)
  d31to60: z.number(), // 31-60
  over60: z.number(), // 60+
});
export type AccountAging = z.infer<typeof accountAgingSchema>;

export const accountDetailSchema = z.object({
  clientId: uuidSchema,
  clientName: z.string(),
  balance: z.number(),
  aging: accountAgingSchema,
  movements: z.array(accountMovementSchema),
  warnings: z.array(z.string()),
});
export type AccountDetail = z.infer<typeof accountDetailSchema>;

export const registerPaymentInputSchema = z.object({
  clientId: uuidSchema,
  amount: z.number().positive('El cobro tiene que ser mayor a 0'),
  occurredAt: isoDateTimeSchema.optional(),
  method: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
});
export type RegisterPaymentInput = z.infer<typeof registerPaymentInputSchema>;

// --- Devoluciones / Nota de crédito ---
export const creditNoteSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  salesOrderId: uuidSchema,
  clientId: uuidSchema,
  lines: z.array(salesOrderLineSchema),
  total: z.number().nonnegative(),
  createdById: uuidSchema,
  createdAt: isoDateTimeSchema,
});
export type CreditNote = z.infer<typeof creditNoteSchema>;

export const createReturnInputSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: z.number().positive('La cantidad tiene que ser mayor a 0'),
      }),
    )
    .min(1, 'Cargá al menos un ítem a devolver'),
  notes: z.string().max(1000).optional(),
});
export type CreateReturnInput = z.infer<typeof createReturnInputSchema>;
