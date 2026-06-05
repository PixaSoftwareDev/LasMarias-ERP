import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// Proveedores de insumos (fermento, sal, envases, servicios) y cuentas por pagar.
// Módulo SEPARADO de los tambos: la deuda a tambos se deriva de las recepciones y
// NO se toca acá (CLAUDE.md §4 — candado). Acá la deuda son comprobantes a pagar.

export const supplierSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  taxId: z.string().max(20).optional(),
  phone: z.string().max(40).optional(),
  city: z.string().max(120).optional(),
  // Plazo de pago en días para calcular el vencimiento de cada comprobante. Null = contado.
  paymentTermDays: z.number().int().nonnegative().nullable().optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Supplier = z.infer<typeof supplierSchema>;

export const createSupplierInputSchema = z.object({
  name: z.string().min(1, 'Ingresá el nombre del proveedor').max(200),
  taxId: z.string().max(20).optional(),
  phone: z.string().max(40).optional(),
  city: z.string().max(120).optional(),
  paymentTermDays: z.number().int().nonnegative().nullable().optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierInputSchema>;

export const updateSupplierInputSchema = createSupplierInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateSupplierInput = z.infer<typeof updateSupplierInputSchema>;

// Estado del comprobante a pagar, derivado de pagos vs monto.
export const payableStatusSchema = z.enum(['pendiente', 'parcial', 'pagada']);
export type PayableStatus = z.infer<typeof payableStatusSchema>;

// Pago aplicado a un comprobante.
export const supplierPaymentSchema = z.object({
  id: uuidSchema,
  payableId: uuidSchema,
  supplierId: uuidSchema,
  amount: z.number().nonnegative(),
  occurredAt: isoDateTimeSchema,
  method: z.string().max(40).nullable(),
  notes: z.string().max(1000).nullable(),
});
export type SupplierPayment = z.infer<typeof supplierPaymentSchema>;

// Comprobante a pagar con su saldo y estado calculados.
export const payableSchema = z.object({
  id: uuidSchema,
  supplierId: uuidSchema,
  supplierName: z.string(),
  description: z.string(),
  amount: z.number().nonnegative(),
  paid: z.number().nonnegative(),
  balance: z.number(), // amount − paid
  status: payableStatusSchema,
  occurredAt: isoDateTimeSchema,
  dueDate: isoDateTimeSchema.nullable(),
  // Origen del comprobante (ingreso de stock, recepción, manual).
  referenceType: z.string().nullable(),
  referenceId: uuidSchema.nullable(),
  payments: z.array(supplierPaymentSchema).optional(),
  createdAt: isoDateTimeSchema,
});
export type Payable = z.infer<typeof payableSchema>;

export const createPayableInputSchema = z.object({
  supplierId: uuidSchema,
  description: z.string().min(1, 'Ingresá un detalle').max(300),
  amount: z.number().positive('El monto tiene que ser mayor a 0'),
  occurredAt: isoDateTimeSchema.optional(),
  // Si se omite, se calcula con el plazo de pago del proveedor (o sin vencimiento si es contado).
  dueDate: isoDateTimeSchema.nullable().optional(),
});
export type CreatePayableInput = z.infer<typeof createPayableInputSchema>;

export const registerSupplierPaymentInputSchema = z.object({
  payableId: uuidSchema,
  amount: z.number().positive('El pago tiene que ser mayor a 0'),
  occurredAt: isoDateTimeSchema.optional(),
  method: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
});
export type RegisterSupplierPaymentInput = z.infer<typeof registerSupplierPaymentInputSchema>;

// Saldo por proveedor (vista lista de cuentas por pagar).
export const supplierBalanceSchema = z.object({
  supplierId: uuidSchema,
  supplierName: z.string(),
  totalOwed: z.number(), // Σ montos de comprobantes
  totalPaid: z.number(), // Σ pagos
  balance: z.number(), // totalOwed − totalPaid (lo que le debés)
  overdue: z.number(), // saldo de comprobantes cuyo vencimiento ya pasó
});
export type SupplierBalance = z.infer<typeof supplierBalanceSchema>;
