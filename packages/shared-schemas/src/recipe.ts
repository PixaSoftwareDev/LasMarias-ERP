import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// CLAUDE.md §4.2 — receta formal por producto con rendimiento base,
// lista de insumos (per litro de leche, per kg de producto, o fijos),
// subproductos esperados con destino, merma estándar. Versionado.

export const ingredientBasisSchema = z.enum([
  'per_liter_milk',
  'per_kg_product',
  'fixed_per_order',
]);
export type IngredientBasis = z.infer<typeof ingredientBasisSchema>;

export const recipeIngredientSchema = z.object({
  productId: uuidSchema,
  productName: z.string().min(1),
  quantity: z.number().nonnegative(),
  unit: z.enum(['kg', 'litro', 'unidad', 'gramo']),
  basis: ingredientBasisSchema,
  // Costo unitario congelado en la versión de receta ($/unidad del insumo).
  // Opcional para tolerar recetas viejas sin costo; ausente = 0 (CLAUDE.md §5.5).
  unitCost: z.number().nonnegative().optional(),
});
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;

export const byproductDestinationSchema = z.enum(['product', 'sale', 'discard']);
export type ByproductDestination = z.infer<typeof byproductDestinationSchema>;

export const recipeByproductSchema = z.object({
  name: z.string().min(1).max(120),
  expectedYield: z.number().nonnegative(),
  unit: z.enum(['kg', 'litro']),
  basis: z.enum(['per_liter_milk', 'per_kg_product']),
  destination: byproductDestinationSchema,
  destinationProductId: uuidSchema.optional(),
  referenceValuePerUnit: z.number().nonnegative().optional(),
});
export type RecipeByproduct = z.infer<typeof recipeByproductSchema>;

export const recipeVersionSchema = z.object({
  id: uuidSchema,
  recipeId: uuidSchema,
  versionNumber: z.number().int().positive(),
  baseYieldKgPerLiter: z.number().positive(),
  yieldSensitivityFat: z.number().default(0),
  yieldSensitivityProtein: z.number().default(0),
  baselineFatPercent: z.number().default(3.4),
  baselineProteinPercent: z.number().default(3.2),
  standardWastePercent: z.number().min(0).max(100).default(0),
  ingredients: z.array(recipeIngredientSchema),
  byproducts: z.array(recipeByproductSchema),
  isActive: z.boolean(),
  notes: z.string().max(2000).optional(),
  createdAt: isoDateTimeSchema,
});
export type RecipeVersion = z.infer<typeof recipeVersionSchema>;

export const recipeSchema = z.object({
  id: uuidSchema,
  productId: uuidSchema,
  productName: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  activeVersion: recipeVersionSchema.optional(),
  // Historial completo de versiones (incluye la activa), ordenado de más nueva a más vieja.
  versions: z.array(recipeVersionSchema).optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Recipe = z.infer<typeof recipeSchema>;

export const createRecipeVersionInputSchema = z.object({
  baseYieldKgPerLiter: z.number().positive('El rendimiento tiene que ser mayor a 0'),
  yieldSensitivityFat: z.number().default(0),
  yieldSensitivityProtein: z.number().default(0),
  baselineFatPercent: z.number().default(3.4),
  baselineProteinPercent: z.number().default(3.2),
  standardWastePercent: z.number().min(0).max(100).default(0),
  ingredients: z.array(recipeIngredientSchema.omit({ productName: true })).default([]),
  byproducts: z.array(recipeByproductSchema).default([]),
  notes: z.string().max(2000).optional(),
});
export type CreateRecipeVersionInput = z.infer<typeof createRecipeVersionInputSchema>;

export const createRecipeInputSchema = z.object({
  productId: uuidSchema,
  name: z.string().min(1, 'Ingresá el nombre de la receta').max(200),
  description: z.string().max(2000).optional(),
  initialVersion: createRecipeVersionInputSchema,
});
export type CreateRecipeInput = z.infer<typeof createRecipeInputSchema>;

export const simulateRecipeInputSchema = z.object({
  recipeId: uuidSchema,
  liters: z.number().positive(),
  fatPercent: z.number().nonnegative().optional(),
  proteinPercent: z.number().nonnegative().optional(),
});
export type SimulateRecipeInput = z.infer<typeof simulateRecipeInputSchema>;

export const recipeSimulationResultSchema = z.object({
  expectedYieldKg: z.number(),
  appliedYieldKgPerLiter: z.number(),
  ingredients: z.array(
    z.object({ productId: uuidSchema, productName: z.string(), quantity: z.number(), unit: z.string() }),
  ),
  byproducts: z.array(
    z.object({ name: z.string(), expectedQuantity: z.number(), unit: z.string() }),
  ),
});
export type RecipeSimulationResult = z.infer<typeof recipeSimulationResultSchema>;
