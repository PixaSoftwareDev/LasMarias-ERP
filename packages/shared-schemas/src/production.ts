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

// Línea del detalle de costo (una por lote de leche/masa o por insumo): cantidad × precio = subtotal.
export const costDetailLineSchema = z.object({
  name: z.string(),
  cantidad: z.string(),
  unitCost: z.string(),
  subtotal: z.string(),
});
export type CostDetailLine = z.infer<typeof costDetailLineSchema>;

// Desglose de costo de una elaboración (calculadora — CLAUDE.md §5). Valores DECIMAL como string.
export const elaborationCostResultSchema = z.object({
  costoInputs: z.string(), // leche o masa
  costoInsumos: z.string(),
  // Detalle línea por línea, verificable a mano. Opcional: las órdenes cerradas antes
  // de este campo no lo tienen guardado.
  detalleInputs: z.array(costDetailLineSchema).optional(),
  detalleInsumos: z.array(costDetailLineSchema).optional(),
  costoBruto: z.string(),
  valorSubproductos: z.string(),
  costoNeto: z.string(),
  rendimiento: z.string().nullable(),
  costoPorKg: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type ElaborationCostResultDto = z.infer<typeof elaborationCostResultSchema>;

export const elaborationVarianceSchema = z.object({
  desvioCostoNeto: z.string(),
  desvioCostoNetoPct: z.string().nullable(),
  desvioCostoPorKg: z.string().nullable(),
  desvioCostoPorKgPct: z.string().nullable(),
  desvioRendimiento: z.string().nullable(),
  desvioRendimientoPct: z.string().nullable(),
});
export type ElaborationVarianceDto = z.infer<typeof elaborationVarianceSchema>;

export const productionCostBreakdownSchema = z.object({
  real: elaborationCostResultSchema,
  // Estándar y variación son null cuando la receta no tiene rendimiento esperado: en ese
  // caso la orden muestra solo el costo real (pedido #12).
  estandar: elaborationCostResultSchema.nullable(),
  variance: elaborationVarianceSchema.nullable(),
});
export type ProductionCostBreakdown = z.infer<typeof productionCostBreakdownSchema>;

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
  costBreakdown: productionCostBreakdownSchema.optional(),
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
  // Cámara/sector donde se almacena el lote de producto resultante (opcional).
  warehouseId: uuidSchema.optional(),
  // Rendimiento ESPERADO (kg/litro) cargado a mano al cerrar (pedido #12: el rendimiento
  // se conoce al producir, no en la receta). Si se carga, habilita la comparación real vs
  // estándar de esta orden; si se omite, se muestra solo el costo real.
  expectedYieldKgPerLiter: z.number().positive().optional(),
  notes: z.string().max(2000).optional(),
});
export type CloseProductionInput = z.infer<typeof closeProductionInputSchema>;
