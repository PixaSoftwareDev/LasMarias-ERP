import type { RecipeByproduct } from '@lasmarias/shared-schemas';

// CLAUDE.md §4.7 — Costeo con subproductos:
// el queso no carga todo el costo de la leche porque parte del valor está en
// el suero y la ricota que se obtienen del mismo proceso.

export interface CostInputs {
  totalMilkCost: number;       // costo total de la leche consumida (litros * precio promedio)
  ingredientsCost: number;     // costo de insumos consumidos
  laborCost: number;           // imputado desde marcaciones (opcional, 0 si no se calcula)
  totalPrincipalKg: number;
  byproducts: RecipeByproduct[];
  byproductActualQuantities: Record<string, number>; // nombre → cantidad real
}

export interface CostResult {
  totalCost: number;            // costo total imputable al producto principal
  byproductCreditTotal: number; // total restado por valor de subproductos
  unitCost: number;             // $/kg del producto principal
}

export function computeProductionCost(input: CostInputs): CostResult {
  const grossCost = input.totalMilkCost + input.ingredientsCost + input.laborCost;
  const byproductCredit = input.byproducts.reduce((sum, bp) => {
    if (!bp.referenceValuePerUnit) return sum;
    const qty = input.byproductActualQuantities[bp.name] ?? 0;
    return sum + qty * bp.referenceValuePerUnit;
  }, 0);
  const totalCost = Math.max(0, grossCost - byproductCredit);
  const unitCost = input.totalPrincipalKg > 0 ? totalCost / input.totalPrincipalKg : 0;
  return {
    totalCost: Math.round(totalCost * 100) / 100,
    byproductCreditTotal: Math.round(byproductCredit * 100) / 100,
    unitCost: Math.round(unitCost * 10000) / 10000,
  };
}
