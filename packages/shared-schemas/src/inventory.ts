import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// CLAUDE.md §4.4 — Inventario por lote, FEFO, alertas.

export const movementTypeSchema = z.enum(['in', 'out', 'adjustment', 'transfer']);
export type MovementType = z.infer<typeof movementTypeSchema>;

export const movementReasonSchema = z.enum([
  'production',
  'purchase',
  'sale',
  'consumption',
  'count',
  'discard',
  'transfer',
]);
export type MovementReason = z.infer<typeof movementReasonSchema>;

export const warehouseSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  kind: z.enum(['cold_chamber', 'sector', 'dry_storage', 'maturation']),
  targetTemperatureCelsius: z.number().optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Warehouse = z.infer<typeof warehouseSchema>;

export const inventoryMovementSchema = z.object({
  id: uuidSchema,
  batchId: uuidSchema,
  batchCode: z.string(),
  productId: uuidSchema,
  productName: z.string(),
  type: movementTypeSchema,
  reason: movementReasonSchema,
  quantity: z.number(),
  unit: z.string(),
  warehouseId: uuidSchema.optional(),
  warehouseName: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
  createdById: uuidSchema,
  createdAt: isoDateTimeSchema,
});
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;

export const stockSummarySchema = z.object({
  productId: uuidSchema,
  productName: z.string(),
  sku: z.string(),
  unit: z.string(),
  totalQuantity: z.number(),
  batchCount: z.number().int(),
  nearestExpiration: isoDateTimeSchema.optional(),
  minStock: z.number().optional(),
  alertLevel: z.enum(['ok', 'low', 'critical', 'expiring']).optional(),
});
export type StockSummary = z.infer<typeof stockSummarySchema>;

export const createWarehouseInputSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  kind: z.enum(['cold_chamber', 'sector', 'dry_storage', 'maturation']),
  targetTemperatureCelsius: z.number().optional(),
});
export type CreateWarehouseInput = z.infer<typeof createWarehouseInputSchema>;

export const stockCountInputSchema = z.object({
  warehouseId: uuidSchema.optional(),
  counts: z
    .array(
      z.object({
        batchId: uuidSchema,
        countedQuantity: z.number().nonnegative(),
      }),
    )
    .min(1),
  notes: z.string().max(1000).optional(),
});
export type StockCountInput = z.infer<typeof stockCountInputSchema>;
