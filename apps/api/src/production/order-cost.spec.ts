import type { IngredientCost } from './elaboration-cost';
import { computeOrderCost, expectedYieldFromBreakdown, fixedCostIngredient, primaryInputsFromBreakdown } from './order-cost';

// "Recalcular con la receta corregida" — caso real del dueño (09/11/2026), OP-20261109-0002:
// CHEDDAR EN SALSA, 54,5 kg de origen (masa 35 + ricota 3,5 + ricota 11 + crema 5) → 65 kg
// (30 en baldes de 10 + 35 en baldes de 5). La receta v1 tenía SH500 0,259 kg/kg (error de
// carga); la v2 corregida dice 0,0269. Todo verificable a mano.

const version = {
  byproducts: [],
  yieldSensitivityFat: '0',
  yieldSensitivityProtein: '0',
  baselineFatPercent: '3.4',
  baselineProteinPercent: '3.2',
  standardWastePercent: '0',
};

// Lotes de origen tal cual quedaron guardados en el cierre.
const detalleInputs = [
  { name: 'LM-PP-20261102-0001', cantidad: '35', unitCost: '4869.2161', subtotal: '170422.56' },
  { name: 'LM-AJ-MW51FRE5-308', cantidad: '3.5', unitCost: '244.2526', subtotal: '854.88' },
  { name: 'LM-PP-20261102-0003', cantidad: '11', unitCost: '244.2526', subtotal: '2686.78' },
  { name: 'LM-AJ-MW51G9O1-816', cantidad: '5', unitCost: '2991.0978', subtotal: '14955.49' },
];

const insumos = (sh500: string): IngredientCost[] => [
  { name: 'SORBATO DE POTACIO', quantity: '0.00148', unitCost: '6952.5', basis: 'per_kg_product' },
  { name: 'SH500', quantity: sh500, unitCost: '20548.5', basis: 'per_kg_product' },
  { name: 'SAL', quantity: '0.0074', unitCost: '580', basis: 'per_kg_product' },
  { name: 'SABORIZANTE CHEDDAR', quantity: '0.00148', unitCost: '37389', basis: 'per_kg_product' },
  { name: 'COLORANTE CHEDDAR', quantity: '0.00074', unitCost: '3847.05', basis: 'per_kg_product' },
  { name: 'BALDES X 10 LTS', quantity: '0.1', unitCost: '3460.8', basis: 'per_kg_product' },
  { name: 'ETIQUETAS CREMA', quantity: '0.1', unitCost: '162', basis: 'per_kg_product' },
];

const base = {
  totalLiters: 54.5,
  kgProductoTotal: '65',
  primaryInputs: primaryInputsFromBreakdown(detalleInputs),
  version,
  byproductActuals: {},
  expectedYield: 1.2,
};

describe('computeOrderCost — recalcular con la receta corregida (cheddar 09/11/2026)', () => {
  it('con la receta vieja reproduce exactamente lo que se guardó al cerrar', () => {
    const { real } = computeOrderCost({ ...base, ingredients: insumos('0.259') });
    // SH500: 0,259 × 65 = 16,835 kg × 20.548,5 = 345.934,00
    expect(real.detalleInsumos.find((l) => l.name === 'SH500')?.subtotal).toBe('345934.00');
    expect(real.costoInputs).toBe('188919.72');
    expect(real.costoNeto).toBe('563131.59');
    expect(real.costoPorKg).toBe('8663.5629');
  });

  it('con la receta corregida: SH500 1,7485 kg y $3.894,256 por kg', () => {
    const { real, estandar, variance } = computeOrderCost({ ...base, ingredients: insumos('0.0269') });
    // SH500: 0,0269 × 65 = 1,7485 kg × 20.548,5 = 35.929,05
    const sh = real.detalleInsumos.find((l) => l.name === 'SH500')!;
    expect(sh.cantidad).toBe('1.7485');
    expect(sh.subtotal).toBe('35929.05');
    // Origen igual que antes (no se recalcula): 188.919,72
    expect(real.costoInputs).toBe('188919.72');
    // La calculadora suma las líneas SIN redondear y redondea solo el resultado (a mano, con
    // todos los decimales): insumos 64.206,9277 → 64.206,93; total 253.126,6429 → 253.126,64.
    expect(real.costoInsumos).toBe('64206.93');
    expect(real.costoNeto).toBe('253126.64');
    expect(real.costoPorKg).toBe('3894.2560');
    // Estándar con 1,2 kg/L: 54,5 × 1,2 = 65,4 kg esperados.
    expect(estandar?.rendimiento).toBe('1.2000');
    expect(estandar?.costoNeto).toBe('253521.76');
    expect(variance?.desvioCostoNeto).toBe('-395.12');
  });
});

describe('expectedYieldFromBreakdown', () => {
  it('usa el rendimiento guardado al cerrar si está', () => {
    expect(expectedYieldFromBreakdown({ estandar: { rendimiento: '0.9' }, expectedYieldKgPerLiter: 1.2 }, 0)).toBe(1.2);
  });

  it('orden vieja: lo reconstruye del estándar guardado descontando la merma', () => {
    // esperado 0,12 con 10% de merma → estándar 0,108
    expect(expectedYieldFromBreakdown({ estandar: { rendimiento: '0.1080' } }, '10')).toBeCloseTo(0.12, 10);
  });

  it('sin estándar al cerrar → sin estándar al recalcular', () => {
    expect(expectedYieldFromBreakdown({ estandar: null }, 0)).toBeNull();
  });
});

describe('costos fijos de planta (se suman solos al cerrar)', () => {
  it('sin leche cruda o sin $/litro no hay línea', () => {
    expect(fixedCostIngredient('CF', '0', '27.4840')).toBeNull();
    expect(fixedCostIngredient('CF', '1000', null)).toBeNull();
  });

  it('masa de 1.000 L con $27,484/L: suma $27.484,00 y no escala con los kg', () => {
    const base = {
      totalLiters: 1000,
      primaryInputs: [{ name: 'LECHE', quantity: '1000', unitCost: '500' }], // 500.000
      version,
      byproductActuals: {},
      expectedYield: 0.1, // estándar: 100 kg
    };
    const fijo = fixedCostIngredient('COSTOS FIJOS DE PLANTA', '1000', '27.4840')!;
    const sin = computeOrderCost({ ...base, kgProductoTotal: '100', ingredients: [] });
    const con = computeOrderCost({ ...base, kgProductoTotal: '100', ingredients: [fijo] });
    const linea = con.real.detalleInsumos.find((l) => l.name === 'COSTOS FIJOS DE PLANTA')!;
    expect(linea.cantidad).toBe('1000');
    expect(linea.subtotal).toBe('27484.00');
    // 500.000 + 27.484 = 527.484 → / 100 kg = 5.274,84
    expect(sin.real.costoNeto).toBe('500000.00');
    expect(con.real.costoNeto).toBe('527484.00');
    expect(con.real.costoPorKg).toBe('5274.8400');
    // En el estándar es la misma plata (mismos litros): el desvío no cambia por los fijos.
    expect(con.estandar?.costoNeto).toBe('527484.00');
    expect(con.variance?.desvioCostoNeto).toBe(sin.variance?.desvioCostoNeto);
    // Con 90 kg en vez de 100, la línea sigue siendo 27.484 (no escala con kg).
    const menos = computeOrderCost({ ...base, kgProductoTotal: '90', ingredients: [fijo] });
    expect(menos.real.detalleInsumos.find((l) => l.name === 'COSTOS FIJOS DE PLANTA')!.subtotal).toBe('27484.00');
  });
});
