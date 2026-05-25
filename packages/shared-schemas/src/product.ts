import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

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
  trackBatches: z.boolean(),
  // Alícuota de IVA argentina. Lácteos procesados: 10.5%; leche fluida: 0%; dulce de leche: 21%.
  ivaRatePercent: z.number().min(0).max(100).default(10.5),
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

// Presentación de envase de un producto (400g, 1kg, 4kg del mismo queso).
export const productPresentationSchema = z.object({
  id: uuidSchema,
  productId: uuidSchema,
  name: z.string().min(1).max(120),
  sku: z.string().min(1).max(50),
  netWeightG: z.number().positive().optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ProductPresentation = z.infer<typeof productPresentationSchema>;

export const createProductPresentationInputSchema = z.object({
  name: z.string().min(1, 'Ingresá el nombre de la presentación').max(120),
  sku: z.string().min(1, 'Ingresá el SKU').max(50),
  netWeightG: z.number().positive().optional(),
});
export type CreateProductPresentationInput = z.infer<typeof createProductPresentationInputSchema>;
