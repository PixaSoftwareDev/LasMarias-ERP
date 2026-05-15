import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// CLAUDE.md §4.3 — Producción es el núcleo del sistema.

export const productionStatusSchema = z.enum(['open', 'in_progress', 'closed', 'cancelled']);
export type ProductionStatus = z.infer<typeof productionStatusSchema>;

export const productionMilkInputSchema = z.object({
  batchId: uuidSchema,
  batchCode: z.string(),
  liters: z.number().positive(),
});
export type ProductionMilkInput = z.infer<typeof productionMilkInputSchema>;

export const productionOutputSchema = z.object({
  productId: uuidSchema,
  productName: z.string(),
  quantity: z.number().nonnegative(),
  unit: z.enum(['kg', 'litro', 'unidad']),
  batchId: uuidSchema.optional(),
  batchCode: z.string().optional(),
  isPrincipal: z.boolean(),
});
export type ProductionOutput = z.infer<typeof productionOutputSchema>;

export const productionOrderSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  recipeId: uuidSchema,
  recipeVersionId: uuidSchema,
  recipeName: z.string(),
  status: productionStatusSchema,
  startedAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.optional(),
  operatorId: uuidSchema,
  operatorName: z.string(),
  milkInputs: z.array(productionMilkInputSchema),
  expectedOutputs: z.array(productionOutputSchema),
  actualOutputs: z.array(productionOutputSchema),
  totalMilkLiters: z.number(),
  totalPrincipalKg: z.number().optional(),
  totalCost: z.number().optional(),
  unitCost: z.number().optional(),
  notes: z.string().max(2000).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ProductionOrder = z.infer<typeof productionOrderSchema>;

export const openProductionInputSchema = z.object({
  recipeId: uuidSchema,
  operatorId: uuidSchema,
  startedAt: z.string().min(1),
  milkInputs: z
    .array(z.object({ batchId: uuidSchema, liters: z.number().positive() }))
    .min(1, 'Tenés que elegir al menos un lote de leche'),
  notes: z.string().max(2000).optional(),
});
export type OpenProductionInput = z.infer<typeof openProductionInputSchema>;

export const closeProductionInputSchema = z.object({
  actualOutputs: z.array(
    z.object({
      productId: uuidSchema,
      quantity: z.number().nonnegative(),
      isPrincipal: z.boolean(),
    }),
  ),
  notes: z.string().max(2000).optional(),
});
export type CloseProductionInput = z.infer<typeof closeProductionInputSchema>;
