import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// CLAUDE.md §4.6 — Comprobantes simples (sin AFIP por ahora).

export const invoiceStatusSchema = z.enum(['draft', 'issued', 'paid', 'cancelled']);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const invoiceSchema = z.object({
  id: uuidSchema,
  number: z.string(),
  clientId: uuidSchema,
  clientName: z.string(),
  salesOrderId: uuidSchema.optional(),
  issuedAt: isoDateTimeSchema,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: invoiceStatusSchema,
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative(),
  total: z.number().nonnegative(),
  paidAmount: z.number().nonnegative().default(0),
  notes: z.string().max(1000).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Invoice = z.infer<typeof invoiceSchema>;

export const createInvoiceFromOrderInputSchema = z.object({
  salesOrderId: uuidSchema,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  taxPercent: z.number().min(0).max(100).default(21),
});
export type CreateInvoiceFromOrderInput = z.infer<typeof createInvoiceFromOrderInputSchema>;

export const recordPaymentInputSchema = z.object({
  amount: z.number().positive(),
  paidAt: isoDateTimeSchema.optional(),
  method: z.enum(['cash', 'transfer', 'check', 'other']).default('transfer'),
  notes: z.string().max(500).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentInputSchema>;
