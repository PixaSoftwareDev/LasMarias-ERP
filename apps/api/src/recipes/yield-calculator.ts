import { envaseSugerido, esEnvase, type RecipeByproduct, type RecipeIngredient } from '@lasmarias/shared-schemas';

// Cálculo de rendimiento ajustado por calidad de la leche (CLAUDE.md §4.2).
// Modelo lineal simple: yield = base + sensFat * (fatReal - baselineFat) + sensProtein * (proteinReal - baselineProtein)
// El resultado se acota a >= 0.

export interface YieldInputs {
  liters: number;
  baseYieldKgPerLiter: number;
  yieldSensitivityFat: number;
  yieldSensitivityProtein: number;
  baselineFatPercent: number;
  baselineProteinPercent: number;
  standardWastePercent: number;
  fatPercent?: number;
  proteinPercent?: number;
}

export interface YieldResult {
  appliedYieldKgPerLiter: number;
  expectedYieldKg: number;
}

export function computeYield(input: YieldInputs): YieldResult {
  const fat = input.fatPercent ?? input.baselineFatPercent;
  const protein = input.proteinPercent ?? input.baselineProteinPercent;
  const adjusted =
    input.baseYieldKgPerLiter +
    input.yieldSensitivityFat * (fat - input.baselineFatPercent) +
    input.yieldSensitivityProtein * (protein - input.baselineProteinPercent);
  const applied = Math.max(0, adjusted);
  const grossKg = applied * input.liters;
  const expected = grossKg * (1 - input.standardWastePercent / 100);
  return {
    appliedYieldKgPerLiter: applied,
    expectedYieldKg: Math.max(0, expected),
  };
}

export interface IngredientPlan {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
}

// `bultos`: bultos estimados (kg esperados ÷ kg por bulto de la ficha), para los envases
// "por bulto". Los envases se cuentan enteros, igual que al cerrar (envaseSugerido).
export function computeIngredients(
  liters: number,
  expectedYieldKg: number,
  ingredients: RecipeIngredient[],
  bultos = 0,
): IngredientPlan[] {
  return ingredients.map((ing) => {
    let qty = 0;
    if (esEnvase(ing)) qty = envaseSugerido(ing, expectedYieldKg, bultos);
    else switch (ing.basis) {
      case 'per_liter_milk':
        qty = ing.quantity * liters;
        break;
      case 'per_1000_liters_milk':
        qty = (ing.quantity * liters) / 1000;
        break;
      case 'per_kg_product':
        qty = ing.quantity * expectedYieldKg;
        break;
      case 'per_bulto':
        qty = ing.quantity * bultos;
        break;
      case 'fixed_per_order':
        qty = ing.quantity;
        break;
    }
    return {
      productId: ing.productId,
      productName: ing.productName,
      quantity: Math.round(qty * 1000) / 1000,
      unit: ing.unit,
    };
  });
}

export interface ByproductPlan {
  name: string;
  expectedQuantity: number;
  unit: string;
}

export function computeByproducts(
  liters: number,
  expectedYieldKg: number,
  byproducts: RecipeByproduct[],
): ByproductPlan[] {
  return byproducts.map((bp) => {
    const qty =
      bp.basis === 'per_liter_milk' ? bp.expectedYield * liters : bp.expectedYield * expectedYieldKg;
    return {
      name: bp.name,
      expectedQuantity: Math.round(qty * 1000) / 1000,
      unit: bp.unit,
    };
  });
}
