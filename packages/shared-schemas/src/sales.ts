import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// CLAUDE.md §4.6 — Ventas, listas de precios, pedidos con calendario.

export const priceListSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().optional(),
  clientType: z.enum(['minorista', 'mayorista', 'distribuidor']),
  validFrom: isoDateTimeSchema.optional(),
  validTo: isoDateTimeSchema.optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PriceList = z.infer<typeof priceListSchema>;

export const priceListItemSchema = z.object({
  id: uuidSchema,
  priceListId: uuidSchema,
  productId: uuidSchema,
  productName: z.string(),
  unitPrice: z.number().nonnegative(),
});
export type PriceListItem = z.infer<typeof priceListItemSchema>;

export const salesOrderStatusSchema = z.enum([
  'taken',
  'confirmed',
  'prepared',
  'loaded',
  'in_delivery',
  'delivered',
  'cancelled',
]);
export type SalesOrderStatus = z.infer<typeof salesOrderStatusSchema>;

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
  zoneId: uuidSchema.optional(),
  status: salesOrderStatusSchema,
  takenAt: isoDateTimeSchema,
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(salesOrderLineSchema),
  total: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).default(0),
  notes: z.string().max(1000).optional(),
  createdById: uuidSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type SalesOrder = z.infer<typeof salesOrderSchema>;

export const createSalesOrderInputSchema = z.object({
  clientId: uuidSchema,
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lines: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: z.number().positive('La cantidad tiene que ser mayor a 0'),
      }),
    )
    .min(1, 'Cargá al menos un ítem'),
  discountPercent: z.number().min(0).max(100).default(0).optional(),
  notes: z.string().max(1000).optional(),
});
export type CreateSalesOrderInput = z.infer<typeof createSalesOrderInputSchema>;

export const createPriceListInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  clientType: z.enum(['minorista', 'mayorista', 'distribuidor']),
  validFrom: isoDateTimeSchema.optional(),
  validTo: isoDateTimeSchema.optional(),
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        unitPrice: z.number().nonnegative(),
      }),
    )
    .default([]),
});
export type CreatePriceListInput = z.infer<typeof createPriceListInputSchema>;
