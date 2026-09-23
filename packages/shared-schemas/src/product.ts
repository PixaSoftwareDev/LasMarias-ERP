import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';
import { currencySchema, ivaModeSchema } from './money';

// Producto final del catálogo (queso cremoso, ricota, etc).

export const productUnitSchema = z.enum(['kg', 'unidad', 'litro']);
export type ProductUnit = z.infer<typeof productUnitSchema>;

export const productCategorySchema = z.enum([
  'queso',
  'intermedio',   // masa — producto en proceso que es stock y luego se elabora (ej: mozzarella)
  'subproducto',  // ricota, suero
  'materia_prima',
  'envase',
  'insumo',
]);
export type ProductCategory = z.infer<typeof productCategorySchema>;

// Categorías que se manejan por BULTOS (bolsas de masa, cajas de queso): lo que se
// produce y se despacha. Quedan afuera envases e insumos —ya se cuentan en 'unidad',
// y un segundo contador sobre lo mismo solo confunde— y la materia prima, que es granel.
export const CATEGORIAS_CON_BULTOS: ProductCategory[] = ['queso', 'intermedio', 'subproducto'];
export const usaBultos = (category?: string | null): boolean =>
  CATEGORIAS_CON_BULTOS.includes(category as ProductCategory);

export const productSchema = z.object({
  id: uuidSchema,
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: productCategorySchema,
  unit: productUnitSchema,
  trackBatches: z.boolean(), // ¿se trabaja por lote?
  // Stock mínimo: cuando el stock total cae a este valor o menos, se alerta (CLAUDE.md §4.4).
  minStockLevel: z.number().nonnegative().optional(),
  // Costo de referencia (insumos/envases/materia prima): pre-llena el ingreso de stock.
  defaultCost: z.number().nonnegative().optional(),
  defaultCostCurrency: currencySchema.optional(),
  costIvaMode: ivaModeSchema.optional(),
  // Kg que trae un bulto (bolsa/caja) de este producto. Es solo REFERENCIA: sugiere los
  // bultos al cargar producción y avisa si el número no cierra. El valor real de cada
  // lote es el que carga el operario (una bolsa de masa no pesa siempre lo mismo).
  kgPorBulto: z.number().positive().optional(),
  // Insumo trazable: exige N° de lote del proveedor al ingresar stock (bromatología).
  requiresLotNumber: z.boolean().optional(),
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
