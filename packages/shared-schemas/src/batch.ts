import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

// Lote — unidad mínima de trazabilidad bidireccional (CLAUDE.md §4.4).
// Aplica tanto a leche cruda (recepción) como a productos terminados.

export const batchStatusSchema = z.enum([
  'activo',
  'en_proceso',     // siendo usado en una orden de producción / maduración
  'agotado',
  'bloqueado',      // calidad fuera de límite, retiro sanitario, etc.
  'descartado',
]);

export type BatchStatus = z.infer<typeof batchStatusSchema>;

export const batchSchema = z.object({
  id: uuidSchema,
  code: z.string().min(1).max(50),         // código legible / QR
  productId: uuidSchema.optional(),         // producto terminado, opcional para leche cruda
  productionDate: isoDateTimeSchema.optional(),
  expirationDate: isoDateTimeSchema.optional(),
  initialQuantity: z.number().positive(),
  remainingQuantity: z.number().min(0),
  unit: z.enum(['kg', 'litro', 'unidad']),
  status: batchStatusSchema,
  parentBatchId: uuidSchema.optional(),    // trazabilidad: lote padre (ej: leche que originó este queso)
  notes: z.string().max(1000).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Batch = z.infer<typeof batchSchema>;
