import type { RecipeByproduct } from '@lasmarias/shared-schemas';
import { computeByproducts, computeYield } from '../recipes/yield-calculator';
import {
  computeElaborationCost,
  computeElaborationVariance,
  type CostDetailLine,
  type ElaborationCostResult,
  type ElaborationVariance,
  type IngredientCost,
  type PrimaryInput,
} from './elaboration-cost';

// Costo real + estándar + desvío de una orden. Es el paso 3 del cierre, sacado a una función
// pura para que lo usen IGUAL el cierre y "Recalcular con la receta corregida": misma
// calculadora, mismas reglas, sin tocar stock.

export interface OrderCostVersion {
  byproducts: RecipeByproduct[];
  yieldSensitivityFat: number | string;
  yieldSensitivityProtein: number | string;
  baselineFatPercent: number | string;
  baselineProteinPercent: number | string;
  standardWastePercent: number | string;
}

export interface OrderCostInput {
  totalLiters: number;
  kgProductoTotal: string; // principal + otros formatos
  bultos: number; // bultos de la tachada (principal + formatos): driver de los envases "por bulto"
  primaryInputs: PrimaryInput[];
  ingredients: IngredientCost[]; // ya con su precio resuelto
  version: OrderCostVersion;
  byproductActuals: Record<string, number>; // kg reales por nombre de subproducto
  expectedYield: number | null; // kg/L esperado; null = sin estándar
}

export interface OrderCost {
  real: ElaborationCostResult;
  estandar: ElaborationCostResult | null;
  variance: ElaborationVariance | null;
}

export function computeOrderCost(input: OrderCostInput): OrderCost {
  const { totalLiters, version } = input;
  const recupero = (bp: RecipeByproduct) =>
    bp.referenceValuePerUnit != null ? String(bp.referenceValuePerUnit) : null;

  const real = computeElaborationCost({
    mode: 'real',
    litros: String(totalLiters),
    productKg: input.kgProductoTotal,
    bultos: String(input.bultos),
    primaryInputs: input.primaryInputs,
    ingredients: input.ingredients,
    byproducts: version.byproducts.map((bp) => ({
      name: bp.name,
      quantity: String(input.byproductActuals[bp.name] ?? 0),
      valorRecupero: recupero(bp),
    })),
  });

  if (input.expectedYield == null) return { real, estandar: null, variance: null };

  const expectedYieldKg = computeYield({
    liters: totalLiters,
    baseYieldKgPerLiter: input.expectedYield,
    yieldSensitivityFat: Number(version.yieldSensitivityFat),
    yieldSensitivityProtein: Number(version.yieldSensitivityProtein),
    baselineFatPercent: Number(version.baselineFatPercent),
    baselineProteinPercent: Number(version.baselineProteinPercent),
    standardWastePercent: Number(version.standardWastePercent),
  }).expectedYieldKg;
  const expectedByproducts = computeByproducts(totalLiters, expectedYieldKg, version.byproducts);
  const estandar = computeElaborationCost({
    mode: 'estandar',
    litros: String(totalLiters),
    productKg: String(expectedYieldKg),
    // Los envases del estándar son los mismos bultos reales: no hay un "bultos esperados".
    bultos: String(input.bultos),
    primaryInputs: input.primaryInputs,
    ingredients: input.ingredients,
    byproducts: version.byproducts.map((bp) => ({
      name: bp.name,
      quantity: String(expectedByproducts.find((e) => e.name === bp.name)?.expectedQuantity ?? 0),
      valorRecupero: recupero(bp),
    })),
  });
  return { real, estandar, variance: computeElaborationVariance(estandar, real) };
}

// --- Costos fijos de planta -------------------------------------------------------------

// Línea de costos fijos que se suma sola al cerrar (sin estar en la receta):
//   litros de leche cruda de la orden × $/litro del mes activo.
// Va como "fijo por orden" con cantidad = litros, así la calculadora la suma tal cual en el
// real y en el estándar (no escala con kg). Sin leche cruda o sin $/litro → no hay línea.
export function fixedCostIngredient(name: string, milkLiters: string, costoPorLitro: string | null): IngredientCost | null {
  if (costoPorLitro == null || !(Number(milkLiters) > 0)) return null;
  return { name, quantity: milkLiters, unitCost: costoPorLitro, basis: 'fixed_per_order' };
}

// --- Recalcular con la receta corregida -------------------------------------------------

// Los lotes de origen se toman TAL CUAL quedaron al cerrar (cantidad y $/kg): lo único que
// cambia al recalcular es la receta. Se leen del detalle guardado en el cierre.
export function primaryInputsFromBreakdown(detalle: CostDetailLine[]): PrimaryInput[] {
  return detalle.map((d) => ({ name: d.name, quantity: d.cantidad, unitCost: d.unitCost }));
}

// Rendimiento esperado (kg/L) que se cargó al cerrar. Las órdenes nuevas lo guardan; en las
// viejas se reconstruye del estándar guardado: rendimiento estándar = esperado × (1 − merma%)
// (sin análisis de grasa/proteína el ajuste por sensibilidad es 0). null = no hubo estándar.
export function expectedYieldFromBreakdown(
  breakdown: { estandar: { rendimiento: string | null } | null; expectedYieldKgPerLiter?: number | null },
  oldWastePercent: number | string,
): number | null {
  if (breakdown.expectedYieldKgPerLiter != null) return breakdown.expectedYieldKgPerLiter;
  const rend = breakdown.estandar?.rendimiento;
  if (rend == null) return null;
  const factor = 1 - Number(oldWastePercent) / 100;
  if (!(factor > 0)) return null;
  return Number(rend) / factor;
}
