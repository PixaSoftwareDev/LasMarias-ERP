import { computeProductionCost } from './cost-calculator';

describe('computeProductionCost', () => {
  it('reparte costos entre principal y subproductos con valor de referencia', () => {
    const r = computeProductionCost({
      totalMilkCost: 100_000,
      ingredientsCost: 5_000,
      laborCost: 0,
      totalPrincipalKg: 100, // queso producido
      byproducts: [
        { name: 'Ricota', expectedYield: 0.05, unit: 'kg', basis: 'per_liter_milk', destination: 'product', referenceValuePerUnit: 500 },
        { name: 'Suero', expectedYield: 0.7, unit: 'litro', basis: 'per_liter_milk', destination: 'sale', referenceValuePerUnit: 10 },
      ],
      byproductActualQuantities: { Ricota: 50, Suero: 700 },
    });
    // Credit: 50*500 + 700*10 = 25000 + 7000 = 32000
    // Total: 105000 - 32000 = 73000
    // Unit: 730/kg
    expect(r.byproductCreditTotal).toBe(32_000);
    expect(r.totalCost).toBe(73_000);
    expect(r.unitCost).toBe(730);
  });

  it('no puede dar costo negativo aunque el subproducto valga más que la leche', () => {
    const r = computeProductionCost({
      totalMilkCost: 10_000,
      ingredientsCost: 0,
      laborCost: 0,
      totalPrincipalKg: 10,
      byproducts: [{ name: 'Premium', expectedYield: 1, unit: 'kg', basis: 'per_kg_product', destination: 'sale', referenceValuePerUnit: 5000 }],
      byproductActualQuantities: { Premium: 10 },
    });
    expect(r.totalCost).toBe(0);
    expect(r.unitCost).toBe(0);
  });
});
