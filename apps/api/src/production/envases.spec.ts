import { envaseSugerido, esEnvase } from '@lasmarias/shared-schemas';
import { computeElaborationCost, type IngredientCost } from './elaboration-cost';

// Envases enteros (pedido del dueño, 12/11/2026). Caso real OP-20261111-0002 (dulce de leche):
// 168 kg con BALDES X 10 LTS a 0,1 por kg ($3.460,80) → antes 16,8 baldes = $58.141,44;
// ahora 17 baldes = 17 × 3.460,80 = $58.833,60 (+$692,16).

const calcular = (ingredients: IngredientCost[], extra: { productKg?: string; bultos?: string; mode?: 'real' | 'estandar' } = {}) =>
  computeElaborationCost({
    mode: extra.mode ?? 'real',
    litros: '1000',
    productKg: extra.productKg ?? '168',
    bultos: extra.bultos,
    primaryInputs: [],
    ingredients,
    byproducts: [],
  });

const balde: IngredientCost = { name: 'BALDES X 10 LTS', quantity: '0.1', unitCost: '3460.8', basis: 'per_kg_product', unit: 'unidad' };

describe('envases en la calculadora', () => {
  it('OP-20261111-0002: 168 kg × 0,1 = 16,8 → 17 baldes, $58.833,60', () => {
    const r = calcular([balde]);
    expect(r.detalleInsumos[0]).toMatchObject({ cantidad: '17', subtotal: '58833.60' });
    expect(r.costoInsumos).toBe('58833.60');
  });

  it('cuenta exacta: 170 kg × 0,1 = 17 baldes justos (no 18)', () => {
    expect(calcular([balde], { productKg: '170' }).detalleInsumos[0]!.cantidad).toBe('17');
  });

  it('"por bulto": uno por bolsa → 44 bultos = 44 bolsas, en el real y en el estándar', () => {
    const bolsa: IngredientCost = { name: 'BOLSA MASA', quantity: '1', unitCost: '100', basis: 'per_bulto', unit: 'unidad' };
    expect(calcular([bolsa], { productKg: '701', bultos: '44' }).detalleInsumos[0]).toMatchObject({ cantidad: '44', subtotal: '4400.00' });
    expect(calcular([bolsa], { productKg: '650', bultos: '44', mode: 'estandar' }).detalleInsumos[0]!.cantidad).toBe('44');
  });

  it('"por bulto" sin bultos cargados = 0', () => {
    const bolsa: IngredientCost = { name: 'BOLSA', quantity: '1', unitCost: '100', basis: 'per_bulto', unit: 'unidad' };
    expect(calcular([bolsa]).costoInsumos).toBe('0.00');
  });

  it('envases corregidos a mano: valen en el real, el estándar sigue con la receta', () => {
    const corregido = { ...balde, cantidadReal: '18' };
    expect(calcular([corregido]).detalleInsumos[0]).toMatchObject({ cantidad: '18', subtotal: '62294.40' });
    expect(calcular([corregido], { mode: 'estandar' }).detalleInsumos[0]!.cantidad).toBe('17');
  });

  it('lo que no es envase no se redondea: sal en kg (0,025 × 101 = 2,525) y fermento por litro', () => {
    const sal: IngredientCost = { name: 'SAL', quantity: '0.025', unitCost: '300', basis: 'per_kg_product', unit: 'kg' };
    const fermento: IngredientCost = { name: 'FERMENTO', quantity: '0.0004', unitCost: '1000', basis: 'per_liter_milk', unit: 'unidad' };
    const r = calcular([sal, fermento], { productKg: '101' });
    expect(r.detalleInsumos.map((d) => d.cantidad)).toEqual(['2.525', '0.4']);
  });
});

describe('envaseSugerido (lo que propone la pantalla al cerrar)', () => {
  const b = { unit: 'unidad', basis: 'per_kg_product' as const, quantity: 0.1 };
  it('misma regla que la calculadora', () => {
    expect(envaseSugerido(b, 168, 0)).toBe(17);
    expect(envaseSugerido(b, 170, 0)).toBe(17);
    expect(envaseSugerido({ ...b, basis: 'per_bulto', quantity: 1 }, 701, 44)).toBe(44);
  });
  it('solo son envases los insumos por unidad que escalan con kg o bultos', () => {
    expect(esEnvase(b)).toBe(true);
    expect(esEnvase({ ...b, basis: 'per_bulto' })).toBe(true);
    expect(esEnvase({ ...b, unit: 'kg' })).toBe(false);
    expect(esEnvase({ ...b, basis: 'per_liter_milk' })).toBe(false);
  });
});
