import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

// Producto final del catálogo (queso cremoso, ricota, etc).

export const productUnitSchema = z.enum(['kg', 'unidad', 'litro']);
export type ProductUnit = z.infer<typeof productUnitSchema>;

export const productCategorySchema = z.enum([
  'queso',
  'subproducto',  // ricota, suero
  'materia_prima',
  'envase',
  'insumo',
]);
export type ProductCategory = z.infer<typeof productCategorySchema>;

export const productSchema = z.object({
  id: uuidSchema,
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: productCategorySchema,
  unit: productUnitSchema,
  trackBatches: z.boolean(), // ¿se trabaja por lote?
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Product = z.infer<typeof productSchema>;

export const createProductInputSchema = productSchema.omit({
  id: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateProductInput = z.infer<typeof createProductInputSchema>;

export const updateProductInputSchema = createProductInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;
