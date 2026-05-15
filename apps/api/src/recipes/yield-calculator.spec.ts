import { computeIngredients, computeYield } from './yield-calculator';

describe('computeYield', () => {
  it('usa baseline cuando no se pasa fat/protein', () => {
    const r = computeYield({
      liters: 1000,
      baseYieldKgPerLiter: 0.1,
      yieldSensitivityFat: 0.01,
      yieldSensitivityProtein: 0.01,
      baselineFatPercent: 3.4,
      baselineProteinPercent: 3.2,
      standardWastePercent: 0,
    });
    expect(r.appliedYieldKgPerLiter).toBeCloseTo(0.1);
    expect(r.expectedYieldKg).toBeCloseTo(100);
  });

  it('aumenta el rendimiento con más grasa', () => {
    const r = computeYield({
      liters: 1000,
      baseYieldKgPerLiter: 0.1,
      yieldSensitivityFat: 0.01,
      yieldSensitivityProtein: 0,
      baselineFatPercent: 3.4,
      baselineProteinPercent: 3.2,
      standardWastePercent: 0,
      fatPercent: 4.4, // +1% grasa
    });
    expect(r.appliedYieldKgPerLiter).toBeCloseTo(0.11);
    expect(r.expectedYieldKg).toBeCloseTo(110);
  });

  it('aplica merma estándar al rendimiento bruto', () => {
    const r = computeYield({
      liters: 1000,
      baseYieldKgPerLiter: 0.1,
      yieldSensitivityFat: 0,
      yieldSensitivityProtein: 0,
      baselineFatPercent: 3.4,
      baselineProteinPercent: 3.2,
      standardWastePercent: 5,
    });
    expect(r.expectedYieldKg).toBeCloseTo(95);
  });

  it('no devuelve rendimiento negativo aunque la calidad esté muy abajo', () => {
    const r = computeYield({
      liters: 1000,
      baseYieldKgPerLiter: 0.05,
      yieldSensitivityFat: 0.1,
      yieldSensitivityProtein: 0,
      baselineFatPercent: 3.4,
      baselineProteinPercent: 3.2,
      standardWastePercent: 0,
      fatPercent: 1, // mucho menos
    });
    expect(r.appliedYieldKgPerLiter).toBe(0);
    expect(r.expectedYieldKg).toBe(0);
  });
});

describe('computeIngredients', () => {
  it('calcula por base correcta', () => {
    const plan = computeIngredients(
      1000, // litros
      100,  // kg producto
      [
        { productId: '1', productName: 'Cuajo', quantity: 0.001, unit: 'litro', basis: 'per_liter_milk' },
        { productId: '2', productName: 'Sal', quantity: 0.02, unit: 'kg', basis: 'per_kg_product' },
        { productId: '3', productName: 'Etiquetas', quantity: 50, unit: 'unidad', basis: 'fixed_per_order' },
      ],
    );
    expect(plan[0]?.quantity).toBe(1);   // 0.001 * 1000
    expect(plan[1]?.quantity).toBe(2);   // 0.02 * 100
    expect(plan[2]?.quantity).toBe(50);
  });
});
