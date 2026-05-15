import { z } from 'zod';
import { cuitSchema, emailSchema, isoDateTimeSchema, phoneSchema, uuidSchema } from './common';

// CLAUDE.md §4.5 — Compras, proveedores, liquidación a productores.

export const supplierSchema = z.object({
  id: uuidSchema,
  businessName: z.string(),
  taxId: cuitSchema.optional(),
  contactName: z.string().optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Supplier = z.infer<typeof supplierSchema>;

export const purchaseOrderStatusSchema = z.enum([
  'draft',
  'approved',
  'received',
  'invoiced',
  'cancelled',
]);
export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;

export const purchaseOrderLineSchema = z.object({
  productId: uuidSchema,
  productName: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  unitPrice: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
});
export type PurchaseOrderLine = z.infer<typeof purchaseOrderLineSchema>;

export const purchaseOrderSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  supplierId: uuidSchema,
  supplierName: z.string(),
  status: purchaseOrderStatusSchema,
  orderedAt: isoDateTimeSchema,
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lines: z.array(purchaseOrderLineSchema),
  total: z.number().nonnegative(),
  notes: z.string().max(1000).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

export const createSupplierInputSchema = z.object({
  businessName: z.string().min(1).max(200),
  taxId: z.string().optional(),
  contactName: z.string().max(120).optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  address: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierInputSchema>;

export const createPurchaseOrderInputSchema = z.object({
  supplierId: uuidSchema,
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lines: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
      }),
    )
    .min(1, 'Cargá al menos un ítem'),
  notes: z.string().max(1000).optional(),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderInputSchema>;

export const producerSettlementSchema = z.object({
  id: uuidSchema,
  producerId: uuidSchema,
  producerName: z.string(),
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalLiters: z.number(),
  averagePricePerLiter: z.number(),
  totalAmount: z.number(),
  notes: z.string().max(1000).optional(),
  createdAt: isoDateTimeSchema,
});
export type ProducerSettlement = z.infer<typeof producerSettlementSchema>;

export const calculateSettlementInputSchema = z.object({
  producerId: uuidSchema,
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CalculateSettlementInput = z.infer<typeof calculateSettlementInputSchema>;
