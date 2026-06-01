// Calculadora de costo de elaboración — el corazón del sistema (CLAUDE.md §5).
//
// Recibe DATOS CRUDOS y computa todo internamente:
//   - inputs principales: el/los lote(s) consumidos (leche o masa) con su costo unitario.
//     Funciona igual para los dos pasos del proceso (leche→masa y masa→mozzarella):
//     en el paso 2 el "input principal" es el lote de masa con su costo/kg heredado.
//   - insumos de receta: fermento, cuajo, sal, mano de obra, energía, envase, etc.,
//     cada uno con su costo unitario y su base de consumo (por litro / por kg / fijo).
//   - subproductos: suero, ricota, crema, con su valor de recupero ($/kg).
//
// Reglas no negociables (QA, CLAUDE.md §5.3 y §5.5):
//   - DECIMAL EXACTO (string), nunca float binario. "0.10" + "0.20" debe dar "0.30".
//   - Nada hardcodeado: todo sale de la receta + datos del lote.
//   - Bordes (kg_producto = 0, litros = 0) NO rompen: devuelven null + advertencia.
//   - El costo neto PUEDE ser negativo (subproducto que vale más que los insumos).
//     No se clampea a 0.
//
// ⚠️ STUB: hoy solo existe el CONTRATO. La lógica se implementa en el paso 3.
// La batería de tests de QA (elaboration-cost.spec.ts) corre en ROJO hasta entonces.

import Big from 'big.js';
import type { IngredientBasis } from '@lasmarias/shared-schemas';

/** Valor decimal representado como string para evitar float binario. Ej: "300.00". */
export type Decimal = string;

export type ElaborationMode = 'estandar' | 'real';

export type ElaborationWarning =
  | 'KG_PRODUCTO_CERO' // no se puede calcular costo/kg: kg de producto = 0
  | 'LITROS_CERO' // rendimiento indefinido: litros elaborados = 0
  | 'COSTO_NETO_NEGATIVO'; // informativo: el subproducto vale más que los insumos

/** Lote consumido como materia prima principal: leche (litros) o masa (kg). */
export interface PrimaryInput {
  name: string;
  quantity: Decimal; // litros de leche o kg de masa consumidos
  unitCost: Decimal; // $/unidad al que entró ese lote
}

export interface IngredientCost {
  name: string;
  quantity: Decimal; // cantidad de receta por unidad de la base
  unitCost: Decimal; // $/unidad del insumo
  basis: IngredientBasis; // per_liter_milk | per_kg_product | fixed_per_order
}

export interface ByproductCost {
  name: string;
  quantity: Decimal; // kg reales (modo real) o esperados (modo estándar)
  valorRecupero: Decimal | null; // $/kg; null si no se valoriza (destino descarte)
}

export interface ElaborationCostInput {
  mode: ElaborationMode;
  litros: Decimal; // litros elaborados (driver de la base "por litro" y del rendimiento)
  productKg: Decimal; // kg de producto principal (real o esperado según mode)
  primaryInputs: PrimaryInput[];
  ingredients: IngredientCost[];
  byproducts: ByproductCost[];
}

export interface ElaborationCostResult {
  costoInputs: Decimal; // costo de leche/masa (Σ quantity × unitCost)
  costoInsumos: Decimal; // costo de insumos de receta (según base)
  costoBruto: Decimal; // costoInputs + costoInsumos
  valorSubproductos: Decimal; // crédito por subproductos (Σ kg × valor_recupero)
  costoNeto: Decimal; // costoBruto − valorSubproductos (puede ser negativo)
  rendimiento: Decimal | null; // productKg / litros; null si litros = 0
  costoPorKg: Decimal | null; // costoNeto / productKg; null si productKg = 0
  warnings: ElaborationWarning[];
}

export interface ElaborationVariance {
  desvioCostoNeto: Decimal; // real − estándar ($)
  desvioCostoNetoPct: Decimal | null; // % sobre estándar; null si estándar = 0
  desvioCostoPorKg: Decimal | null; // null si falta algún costoPorKg
  desvioCostoPorKgPct: Decimal | null;
  desvioRendimiento: Decimal | null; // real − estándar (kg/litro)
  desvioRendimientoPct: Decimal | null;
}

// Decimales de presentación (half-up es el default de big.js: Big.RM = 1).
const MONEY_DP = 2; // montos en $
const RATE_DP = 4; // $/kg, rendimiento (kg/litro) y porcentajes

/** Cantidad consumida de un insumo según su base de consumo. */
function consumedQuantity(ing: IngredientCost, litros: Big, productKg: Big): Big {
  const qty = new Big(ing.quantity);
  switch (ing.basis) {
    case 'per_liter_milk':
      return qty.times(litros);
    case 'per_kg_product':
      return qty.times(productKg);
    case 'fixed_per_order':
      return qty;
  }
}

export function computeElaborationCost(input: ElaborationCostInput): ElaborationCostResult {
  const litros = new Big(input.litros);
  const productKg = new Big(input.productKg);
  const warnings: ElaborationWarning[] = [];

  // Costo de la materia prima principal (leche o masa): Σ cantidad × costo unitario del lote.
  const costoInputs = input.primaryInputs.reduce(
    (acc, pi) => acc.plus(new Big(pi.quantity).times(new Big(pi.unitCost))),
    new Big(0),
  );

  // Costo de insumos de receta: cada uno según su base.
  const costoInsumos = input.ingredients.reduce(
    (acc, ing) => acc.plus(consumedQuantity(ing, litros, productKg).times(new Big(ing.unitCost))),
    new Big(0),
  );

  const costoBruto = costoInputs.plus(costoInsumos);

  // Crédito por subproductos: Σ kg × valor de recupero (los sin valor no suman).
  const valorSubproductos = input.byproducts.reduce((acc, bp) => {
    if (bp.valorRecupero === null) return acc;
    return acc.plus(new Big(bp.quantity).times(new Big(bp.valorRecupero)));
  }, new Big(0));

  // Costo neto: puede ser negativo (subproducto que vale más que los insumos). No se clampea.
  const costoNeto = costoBruto.minus(valorSubproductos);
  if (costoNeto.lt(0)) warnings.push('COSTO_NETO_NEGATIVO');

  // Rendimiento = kg / litros. Borde: litros = 0 → null + advertencia (no dividir por cero).
  let rendimiento: Decimal | null = null;
  if (litros.eq(0)) {
    warnings.push('LITROS_CERO');
  } else {
    rendimiento = productKg.div(litros).toFixed(RATE_DP);
  }

  // Costo por kg = costo neto / kg. Borde: kg = 0 → null + advertencia.
  let costoPorKg: Decimal | null = null;
  if (productKg.eq(0)) {
    warnings.push('KG_PRODUCTO_CERO');
  } else {
    costoPorKg = costoNeto.div(productKg).toFixed(RATE_DP);
  }

  return {
    costoInputs: costoInputs.toFixed(MONEY_DP),
    costoInsumos: costoInsumos.toFixed(MONEY_DP),
    costoBruto: costoBruto.toFixed(MONEY_DP),
    valorSubproductos: valorSubproductos.toFixed(MONEY_DP),
    costoNeto: costoNeto.toFixed(MONEY_DP),
    rendimiento,
    costoPorKg,
    warnings,
  };
}

/** Desvío porcentual = (real − estándar) / estándar × 100. null si el estándar es 0/ausente. */
function pctVariance(real: Big, estandar: Big): Decimal | null {
  if (estandar.eq(0)) return null;
  return real.minus(estandar).div(estandar).times(100).toFixed(RATE_DP);
}

export function computeElaborationVariance(
  estandar: ElaborationCostResult,
  real: ElaborationCostResult,
): ElaborationVariance {
  const netoReal = new Big(real.costoNeto);
  const netoEstandar = new Big(estandar.costoNeto);

  const tieneCostoPorKg = real.costoPorKg !== null && estandar.costoPorKg !== null;
  const tieneRendimiento = real.rendimiento !== null && estandar.rendimiento !== null;

  return {
    desvioCostoNeto: netoReal.minus(netoEstandar).toFixed(MONEY_DP),
    desvioCostoNetoPct: pctVariance(netoReal, netoEstandar),
    desvioCostoPorKg: tieneCostoPorKg
      ? new Big(real.costoPorKg as string).minus(new Big(estandar.costoPorKg as string)).toFixed(RATE_DP)
      : null,
    desvioCostoPorKgPct: tieneCostoPorKg
      ? pctVariance(new Big(real.costoPorKg as string), new Big(estandar.costoPorKg as string))
      : null,
    desvioRendimiento: tieneRendimiento
      ? new Big(real.rendimiento as string).minus(new Big(estandar.rendimiento as string)).toFixed(RATE_DP)
      : null,
    desvioRendimientoPct: tieneRendimiento
      ? pctVariance(new Big(real.rendimiento as string), new Big(estandar.rendimiento as string))
      : null,
  };
}
