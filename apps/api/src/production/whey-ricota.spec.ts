import { ProductionService } from './production.service';
import { computeOrderCost } from './order-cost';

// RICOTA DEL SUERO DE LA MASA (nov 2026). La ricota que se hace con el suero de una masa le
// descuenta su valor a esa masa (subproducto destino 'elaboracion', recupero $/kg de la receta
// de la MASA) y ese mismo valor entra como costo de la ricota (línea "Suero de OP-…"). El costo
// total se conserva: masa neto + ricota = lo que se gastó.
//
// Datos base (todo a mano):
//   MASA: 1.000 L × $500 = $500.000 + insumo fijo $10.000 = $510.000 bruto → 110 kg.
//         Sin ricota: 510.000 / 110 = $4.636,3636/kg.
//   RICOTA: 30 kg, insumo fijo $6.000. Recupero en la receta de la masa: $1.150/kg.
//         Descuento = 30 × 1.150 = $34.500.
//         Masa con descuento: 510.000 − 34.500 = 475.500 / 110 = $4.322,7273/kg.
//         Ricota: 6.000 + 34.500 = 40.500 / 30 = $1.350/kg.
//         Conservación: 475.500 + 40.500 = 516.000 = 510.000 + 6.000.

jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));
jest.mock('./production-order.entity', () => ({
  ProductionOrderEntity: { name: 'ProductionOrderEntity' },
}));
jest.mock('../products/product.entity', () => ({ ProductEntity: { name: 'ProductEntity' } }));

// ============================================================================================
// 1. La calculadora pura con los datos que le arma el servicio (la calculadora no cambió:
//    la masa recibe el subproducto con kg + recupero, la ricota una línea de origen más).
// ============================================================================================

const versionBase = {
  yieldSensitivityFat: '0',
  yieldSensitivityProtein: '0',
  baselineFatPercent: '3.4',
  baselineProteinPercent: '3.2',
  standardWastePercent: '0',
};
const ricotaBp = (valor: number | null) => ({
  name: 'RICOTA',
  unit: 'kg' as const,
  basis: 'per_liter_milk' as const,
  expectedYield: 0.03,
  destination: 'elaboracion' as const,
  destinationProductId: '00000000-0000-0000-0000-00000000000b',
  referenceValuePerUnit: valor,
});
const masaCost = (kgRicota: string | number, valor: number | null = 1150) =>
  computeOrderCost({
    totalLiters: 1000,
    kgProductoTotal: '110',
    bultos: 0,
    primaryInputs: [{ name: 'LECHE', quantity: '1000', unitCost: '500' }],
    ingredients: [{ name: 'FIJO MASA', quantity: '1', unitCost: '10000', basis: 'fixed_per_order' }],
    version: { ...versionBase, byproducts: [ricotaBp(valor) as any] },
    byproductActuals: { RICOTA: kgRicota },
    expectedYield: null,
  }).real;
const ricotaCost = (kg: string, suero: { kg: string; valor: string } | null) =>
  computeOrderCost({
    totalLiters: 0,
    kgProductoTotal: kg,
    bultos: 0,
    primaryInputs: suero ? [{ name: 'Suero de OP-MASA', quantity: suero.kg, unitCost: suero.valor }] : [],
    ingredients: [{ name: 'FIJO RICOTA', quantity: '1', unitCost: '6000', basis: 'fixed_per_order' }],
    version: { ...versionBase, byproducts: [] },
    byproductActuals: {},
    expectedYield: null,
  }).real;

describe('ricota del suero — calculadora (verificable a mano)', () => {
  it('caso 1: masa con 30 kg de ricota a $1.150 → $34.500 de descuento, $4.322,7273/kg', () => {
    const m = masaCost('30');
    // bruto 500.000 + 10.000 = 510.000; subproducto 30 × 1.150 = 34.500
    expect(m.costoBruto).toBe('510000.00');
    expect(m.valorSubproductos).toBe('34500.00');
    // neto 510.000 − 34.500 = 475.500 → / 110 = 4.322,72727… → 4.322,7273
    expect(m.costoNeto).toBe('475500.00');
    expect(m.costoPorKg).toBe('4322.7273');
  });

  it('caso 1: ricota 30 kg = $6.000 insumos + $34.500 suero = $40.500 → $1.350/kg; el total se conserva', () => {
    const r = ricotaCost('30', { kg: '30', valor: '1150' });
    expect(r.costoInputs).toBe('34500.00');
    expect(r.costoInsumos).toBe('6000.00');
    expect(r.costoNeto).toBe('40500.00');
    expect(r.costoPorKg).toBe('1350.0000');
    // Conservación: 475.500 + 40.500 = 516.000 = 510.000 (masa) + 6.000 (ricota)
    const m = masaCost('30');
    expect(Number(m.costoNeto) + Number(r.costoNeto)).toBe(516000);
  });

  it('caso 2: sin ricota todavía la masa es $4.636,3636/kg (510.000 / 110)', () => {
    expect(masaCost('0').costoPorKg).toBe('4636.3636');
  });

  it('caso 3: ricota sin descuento (masa ya pasó a mozzarella) = solo insumos: 6.000 / 30 = $200/kg', () => {
    const r = ricotaCost('30', null);
    expect(r.costoNeto).toBe('6000.00');
    expect(r.costoPorKg).toBe('200.0000');
  });

  it('caso 4: regresión ricota sin vincular: 601,3 kg con $125.242,94 de insumos → $208,2869/kg', () => {
    const r = computeOrderCost({
      totalLiters: 0,
      kgProductoTotal: '601.3',
      bultos: 0,
      primaryInputs: [],
      ingredients: [{ name: 'INSUMOS', quantity: '1', unitCost: '125242.94', basis: 'fixed_per_order' }],
      version: { ...versionBase, byproducts: [] },
      byproductActuals: {},
      expectedYield: null,
    }).real;
    // 125.242,94 / 601,3 = 208,28694… → 208,2869
    expect(r.costoNeto).toBe('125242.94');
    expect(r.costoPorKg).toBe('208.2869');
  });

  it('caso 4: recupero 0 o ausente en la receta de la masa → la masa no descuenta nada', () => {
    expect(masaCost('30', 0).costoNeto).toBe('510000.00');
    expect(masaCost('30', null).costoNeto).toBe('510000.00');
  });

  it('caso 5: dos ricotas (30 + 20 = 50 kg) → descuento 50 × 1.150 = $57.500; masa 452.500 / 110 = $4.113,6364', () => {
    const m = masaCost('50');
    expect(m.valorSubproductos).toBe('57500.00');
    expect(m.costoNeto).toBe('452500.00');
    expect(m.costoPorKg).toBe('4113.6364');
  });

  it('caso 6: ricota corregida a 25 kg → descuento 25 × 1.150 = $28.750; masa 481.250 / 110 = $4.375', () => {
    const m = masaCost('25');
    expect(m.valorSubproductos).toBe('28750.00');
    expect(m.costoNeto).toBe('481250.00');
    expect(m.costoPorKg).toBe('4375.0000');
  });

  it('caso 11: decimal exacto: 0,3 kg × $1.150,10 = $345,03; 0,1 + 0,2 kg no da 0,30000000000000004', () => {
    const m = computeOrderCost({
      totalLiters: 1000,
      kgProductoTotal: '110',
      bultos: 0,
      primaryInputs: [{ name: 'LECHE', quantity: '1000', unitCost: '500' }],
      ingredients: [],
      version: { ...versionBase, byproducts: [{ ...ricotaBp(1150.1) } as any] },
      byproductActuals: { RICOTA: '0.3' },
      expectedYield: null,
    }).real;
    expect(m.valorSubproductos).toBe('345.03');
    // Suma de kg de dos ricotas (0,1 + 0,2) como la hace el servicio (Big): 0,3 exacto.
    const Big = require('big.js');
    expect(new Big('0.1').plus('0.2').toString()).toBe('0.3');
    const r = ricotaCost('0.3', { kg: new Big('0.1').plus('0.2').toString(), valor: '1150.10' });
    expect(r.costoInputs).toBe('345.03');
  });

  it('caso 13 (real): masa 30.000 L, bruto $22.006.835,64, 3.188,7 kg; ricota 697,4 kg a $1.150', () => {
    // descuento 697,4 × 1.150 = 802.010,00; neto 22.006.835,64 − 802.010 = 21.204.825,64
    // / 3.188,7 = 6.649,99079… → 6.649,9908
    const m = computeOrderCost({
      totalLiters: 30000,
      kgProductoTotal: '3188.7',
      bultos: 0,
      primaryInputs: [{ name: 'BRUTO', quantity: '1', unitCost: '22006835.64' }],
      ingredients: [],
      version: { ...versionBase, byproducts: [ricotaBp(1150) as any] },
      byproductActuals: { RICOTA: '697.4' },
      expectedYield: null,
    }).real;
    expect(m.costoBruto).toBe('22006835.64');
    expect(m.valorSubproductos).toBe('802010.00');
    expect(m.costoNeto).toBe('21204825.64');
    expect(m.costoPorKg).toBe('6649.9908');
    // ricota: (144.492,22 + 802.010,00) / 697,4 = 946.502,22 / 697,4 = 1.357,18701… → 1.357,1870
    const r = computeOrderCost({
      totalLiters: 0,
      kgProductoTotal: '697.4',
      bultos: 0,
      primaryInputs: [{ name: 'Suero de OP-MASA', quantity: '697.4', unitCost: '1150' }],
      ingredients: [{ name: 'INSUMOS', quantity: '1', unitCost: '144492.22', basis: 'fixed_per_order' }],
      version: { ...versionBase, byproducts: [] },
      byproductActuals: {},
      expectedYield: null,
    }).real;
    expect(r.costoInputs).toBe('802010.00');
    expect(r.costoNeto).toBe('946502.22');
    expect(r.costoPorKg).toBe('1357.1870');
  });
});

// ============================================================================================
// 2. El cableado del servicio (cerrar masa / ricota, guardar lo de hoy, borrar, editar).
//    Base en memoria: las consultas SQL del suero se responden desde las órdenes del fixture.
// ============================================================================================

const MASA_P = 'prod-masa';
const RICOTA_P = 'prod-ricota';
const MOZZA_P = 'prod-mozza';

function masaVersion(valor: number | null | 'sin') {
  return {
    id: 'ver-masa-4',
    versionNumber: 4,
    baseYieldKgPerLiter: null,
    yieldSensitivityFat: '0',
    yieldSensitivityProtein: '0',
    baselineFatPercent: '3.4',
    baselineProteinPercent: '3.2',
    standardWastePercent: '0',
    ingredients: [{ productName: 'FIJO MASA', quantity: 1, unitCost: 10000, basis: 'fixed_per_order' }],
    byproducts:
      valor === 'sin'
        ? []
        : [
            {
              name: 'RICOTA',
              unit: 'kg',
              basis: 'per_liter_milk',
              expectedYield: 0.03,
              destination: 'elaboracion',
              destinationProductId: RICOTA_P,
              referenceValuePerUnit: valor,
            },
          ],
  };
}

function makeMasa(valor: number | null | 'sin' = 1150): any {
  const version = masaVersion(valor);
  return {
    id: 'masa-1',
    code: 'OP-20261124-0001',
    status: 'open',
    startedAt: new Date('2026-11-24T08:00:00Z'),
    createdAt: new Date('2026-11-24T08:00:00Z'),
    updatedAt: new Date('2026-11-24T08:00:00Z'),
    operatorId: 'op-1',
    operator: { fullName: 'Juan' },
    recipeId: 'rec-masa',
    recipeVersionId: version.id,
    totalMilkLiters: '1000',
    milkInputs: [{ batchId: 'milk-1', batchCode: 'LM-LE-1', liters: 1000 }],
    expectedOutputs: [
      { productId: MASA_P, productName: 'MASA', quantity: 0, unit: 'kg', isPrincipal: true },
      ...version.byproducts.map((b) => ({
        productId: b.destinationProductId,
        productName: b.name,
        quantity: 0,
        unit: 'kg',
        isPrincipal: false,
      })),
    ],
    actualOutputs: [],
    costBreakdown: null,
    wheyFromOrderId: null,
    recipe: { id: 'rec-masa', productId: MASA_P, name: 'MASA' },
    recipeVersion: version,
  };
}

function makeRicota(id: string, code: string, wheyFrom: string | null = 'masa-1'): any {
  return {
    id,
    code,
    status: 'open',
    startedAt: new Date('2026-11-24T10:00:00Z'),
    createdAt: new Date('2026-11-24T10:00:00Z'),
    updatedAt: new Date('2026-11-24T10:00:00Z'),
    operatorId: 'op-1',
    operator: { fullName: 'Juan' },
    recipeId: 'rec-ricota',
    recipeVersionId: 'ver-ricota-1',
    totalMilkLiters: '0',
    milkInputs: [],
    expectedOutputs: [{ productId: RICOTA_P, productName: 'RICOTA', quantity: 0, unit: 'kg', isPrincipal: true }],
    actualOutputs: [],
    costBreakdown: null,
    wheyFromOrderId: wheyFrom,
    recipe: { id: 'rec-ricota', productId: RICOTA_P, name: 'RICOTA' },
    recipeVersion: {
      id: 'ver-ricota-1',
      versionNumber: 1,
      baseYieldKgPerLiter: null,
      yieldSensitivityFat: '0',
      yieldSensitivityProtein: '0',
      baselineFatPercent: '3.4',
      baselineProteinPercent: '3.2',
      standardWastePercent: '0',
      ingredients: [{ productName: 'FIJO RICOTA', quantity: 1, unitCost: 6000, basis: 'fixed_per_order' }],
      byproducts: [],
    },
  };
}

function makeWorld(
  orders: any[],
  opts: { masaUsadaEnMozzaCerrada?: boolean | (() => boolean); alBloquearLotes?: (ids: string[]) => void } = {},
) {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const products: Record<string, any> = {
    [MASA_P]: { id: MASA_P, name: 'MASA', category: 'intermedio', unit: 'kg', defaultCost: null },
    [RICOTA_P]: { id: RICOTA_P, name: 'RICOTA', category: 'queso', unit: 'kg', defaultCost: null },
    [MOZZA_P]: { id: MOZZA_P, name: 'MOZZA', category: 'queso', unit: 'kg', defaultCost: null },
  };
  const milkBatch: any = {
    id: 'milk-1',
    code: 'LM-LE-1',
    productId: null,
    remainingQuantity: '0',
    status: 'en_proceso',
    unit: 'litro',
    unitCost: '500',
  };
  const createdBatches: any[] = [];
  const batchUpdates: { id: string; unitCost: string }[] = [];
  const locks: string[] = [];
  let seq = 0;

  const orderRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(byId.get(id) ?? null)),
    save: jest.fn((o: any) => {
      byId.set(o.id, o);
      return Promise.resolve(o);
    }),
    remove: jest.fn((o: any) => {
      byId.delete(o.id);
      return Promise.resolve(o);
    }),
    find: jest.fn().mockResolvedValue([]),
    findOneByOrFail: jest.fn(({ id }: any) => Promise.resolve(byId.get(id))),
  };
  const batchRepo = {
    findOneByOrFail: jest.fn().mockResolvedValue(milkBatch),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((b: any) => ({ ...b, id: `lote-${++seq}` })),
    save: jest.fn((b: any) => {
      if (b.id !== 'milk-1') createdBatches.push(b);
      return Promise.resolve(b);
    }),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn(({ id }: any, patch: any) => {
      batchUpdates.push({ id, unitCost: patch.unitCost });
      return Promise.resolve({});
    }),
  };
  const movementRepo = {
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(1), // la leche ya salió al reservar
    create: jest.fn((m: any) => m),
    save: jest.fn((m: any) => Promise.resolve(m)),
    remove: jest.fn((m: any) => Promise.resolve(m)),
  };
  const productRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(products[id] ?? null)),
  };

  // Las consultas del suero, respondidas desde las órdenes en memoria (misma semántica que el SQL).
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    if (/FOR UPDATE/.test(sql)) {
      if (sql.includes('FROM batches WHERE id = ANY')) opts.alBloquearLotes?.(params[0]);
      locks.push(`${sql.includes('production_orders') ? 'orden' : 'lotes'}:${JSON.stringify(params[0])}`);
      return [];
    }
    if (sql.includes("->'suero'->>'kg' AS kg") && sql.includes('JOIN recipes')) {
      // wheyKgByProduct: ricotas CERRADAS con aplicado=true de esta masa.
      return [...byId.values()]
        .filter(
          (o) => o.wheyFromOrderId === params[0] && o.status === 'closed' && o.costBreakdown?.suero?.aplicado === true,
        )
        .map((o) => ({ product_id: o.recipe.productId, kg: o.costBreakdown.suero.kg }));
    }
    if (sql.includes('FROM production_orders WHERE whey_from_order_id')) {
      // wheyRicotasOf
      return [...byId.values()]
        .filter((o) => o.wheyFromOrderId === params[0] && o.status !== 'cancelled')
        .map((o) => ({
          id: o.id,
          code: o.code,
          status: o.status,
          kg: o.costBreakdown?.suero?.kg ?? null,
          aplicado: o.costBreakdown?.suero ? String(o.costBreakdown.suero.aplicado) : null,
        }));
    }
    if (sql.includes('FROM inventory_movements m JOIN production_orders')) {
      // masaUsadaEnOtraElaboracion
      const usada =
        typeof opts.masaUsadaEnMozzaCerrada === 'function' ? opts.masaUsadaEnMozzaCerrada() : opts.masaUsadaEnMozzaCerrada;
      return usada ? [{ '?column?': 1 }] : [];
    }
    return [];
  });

  const manager = {
    query,
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      if (name === 'ProductionOrderEntity') return orderRepo;
      if (name === 'ProductEntity') return productRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)), manager };
  const service = new ProductionService(
    orderRepo as any,
    {} as any,
    { findById: jest.fn().mockResolvedValue({ id: 'op-1' }) } as any,
    dataSource as any,
    { toArs: jest.fn() } as any,
  );
  return { service, byId, createdBatches, batchUpdates, locks, manager };
}

const cerrarMasa = (service: ProductionService, ricotaKgAMano = 0) =>
  service.close('masa-1', {
    actualOutputs: [
      { productId: MASA_P, quantity: 110, isPrincipal: true },
      // Lo que mande la pantalla para la ricota del suero se IGNORA (caso 12).
      ...(ricotaKgAMano ? [{ productId: RICOTA_P, quantity: ricotaKgAMano, isPrincipal: false }] : []),
    ],
  } as any);
const cerrarRicota = (service: ProductionService, id: string, kg: number) =>
  service.close(id, { actualOutputs: [{ productId: RICOTA_P, quantity: kg, isPrincipal: true }] } as any);

describe('ricota del suero — servicio', () => {
  it('caso 1: ricota cerrada ANTES que la masa → línea Suero $34.500; la masa toma el descuento al cerrar', async () => {
    const { service, byId } = makeWorld([makeMasa(), makeRicota('ric-1', 'OP-20261124-0002')]);

    const ric = await cerrarRicota(service, 'ric-1', 30);
    const suero = ric.costBreakdown!.suero!;
    expect(suero).toMatchObject({ orderId: 'masa-1', orderCode: 'OP-20261124-0001', kg: '30', valor: '34500.00', unitValue: '1150', aplicado: true });
    const linea = ric.costBreakdown!.real.detalleInputs!.find((l) => l.name === 'Suero de OP-20261124-0001')!;
    expect(linea.subtotal).toBe('34500.00');
    // 6.000 + 34.500 = 40.500 / 30 = 1.350
    expect(ric.costBreakdown!.real.costoNeto).toBe('40500.00');
    expect(ric.costBreakdown!.real.costoPorKg).toBe('1350.0000');

    await cerrarMasa(service);
    const masa = byId.get('masa-1');
    expect(masa.costBreakdown.real.valorSubproductos).toBe('34500.00');
    expect(masa.costBreakdown.real.costoNeto).toBe('475500.00');
    expect(masa.unitCost).toBe('4322.7273');
    // Conservación: 475.500 + 40.500 = 516.000 = 510.000 + 6.000
    expect(Number(masa.costBreakdown.real.costoNeto) + Number(ric.costBreakdown!.real.costoNeto)).toBe(516000);
  });

  it('caso 12: los kg de ricota que mande la pantalla al cerrar la masa se ignoran (999 → 30) y no generan lote', async () => {
    const { service, byId, createdBatches } = makeWorld([makeMasa(), makeRicota('ric-1', 'OP-20261124-0002')]);
    await cerrarRicota(service, 'ric-1', 30);
    const lotesAntes = createdBatches.length;
    await cerrarMasa(service, 999);
    const masa = byId.get('masa-1');
    const out = masa.actualOutputs.find((o: any) => o.productId === RICOTA_P);
    expect(out.quantity).toBe(30);
    expect(out.batchId).toBeUndefined();
    expect(masa.costBreakdown.real.valorSubproductos).toBe('34500.00');
    // Solo el lote de masa: ningún lote de ricota.
    const nuevos = createdBatches.slice(lotesAntes);
    expect(nuevos.map((b) => b.productId)).toEqual([MASA_P]);
  });

  it('caso 12: masa sin ricota cerrada todavía: aunque la pantalla mande 999 kg, el descuento es 0', async () => {
    const { service, byId } = makeWorld([makeMasa(), makeRicota('ric-1', 'OP-20261124-0002')]);
    await cerrarMasa(service, 999);
    expect(byId.get('masa-1').costBreakdown.real.valorSubproductos).toBe('0.00');
    expect(byId.get('masa-1').unitCost).toBe('4636.3636');
  });

  it('caso 12: "guardar lo de hoy" con kg de la ricota del suero se rechaza', async () => {
    const masa = makeMasa();
    const { service } = makeWorld([masa]);
    await expect(
      service.saveProgress('masa-1', { outputs: [{ productId: RICOTA_P, quantity: 5 }] } as any),
    ).rejects.toThrow(/se suma sola cuando se cierra la orden de ricota/);
  });

  it('caso 2: masa ya cerrada e intacta → al cerrar la ricota pasa de $4.636,3636 a $4.322,7273 y actualiza sus lotes', async () => {
    const { service, byId, batchUpdates } = makeWorld([makeMasa(), makeRicota('ric-1', 'OP-20261124-0002')]);
    await cerrarMasa(service);
    expect(byId.get('masa-1').unitCost).toBe('4636.3636');
    const loteMasa = byId.get('masa-1').actualOutputs.find((o: any) => o.isPrincipal).batchId;

    const ric = await cerrarRicota(service, 'ric-1', 30);
    expect(ric.costBreakdown!.suero!.aplicado).toBe(true);
    expect(ric.avisos).toEqual(['A la masa OP-20261124-0001 se le descontó la ricota: pasó de $4.636,36/kg a $4.322,73/kg']);
    const masa = byId.get('masa-1');
    expect(masa.unitCost).toBe('4322.7273');
    expect(masa.totalCost).toBe('475500.00');
    // El lote de masa hereda el costo nuevo (stock no se mueve: solo update de unit_cost).
    expect(batchUpdates).toEqual([{ id: loteMasa, unitCost: '4322.7273' }]);
    // La ricota figura en las salidas de la masa (sin lote).
    expect(masa.actualOutputs.find((o: any) => o.productId === RICOTA_P)).toMatchObject({ quantity: 30 });
  });

  it('caso 3: masa ya usada en una mozzarella CERRADA → ricota $200/kg, sin línea Suero, aplicado=false con motivo; masa intacta', async () => {
    const { service, byId, batchUpdates } = makeWorld([makeMasa(), makeRicota('ric-1', 'OP-20261124-0002')], {
      masaUsadaEnMozzaCerrada: true,
    });
    await cerrarMasa(service);
    const antes = { ...byId.get('masa-1').costBreakdown.real };

    const ric = await cerrarRicota(service, 'ric-1', 30);
    expect(ric.costBreakdown!.suero).toMatchObject({ aplicado: false, kg: '30', valor: '34500.00' });
    expect(ric.costBreakdown!.suero!.motivo).toMatch(/ya pasó a mozzarella/);
    expect(ric.costBreakdown!.real.detalleInputs ?? []).toHaveLength(0);
    // 6.000 / 30 = 200
    expect(ric.costBreakdown!.real.costoPorKg).toBe('200.0000');
    expect(ric.avisos?.some((a) => /ya pasó a mozzarella/.test(a))).toBe(true);
    expect(byId.get('masa-1').costBreakdown.real).toEqual(antes);
    expect(byId.get('masa-1').unitCost).toBe('4636.3636');
    expect(batchUpdates).toHaveLength(0);
  });

  it('caso 4: ricota sin vincular ("suero sin masa") → igual que hoy: sin bloque suero, solo insumos', async () => {
    const { service } = makeWorld([makeRicota('ric-1', 'OP-20261124-0002', null)]);
    const ric = await cerrarRicota(service, 'ric-1', 30);
    expect(ric.costBreakdown!.suero).toBeUndefined();
    expect(ric.costBreakdown!.real.costoPorKg).toBe('200.0000');
  });

  it('caso 4: recupero 0 en la receta de la masa → ricota sin línea, aplicado=false; masa sin descuento', async () => {
    const { service, byId } = makeWorld([makeMasa(0), makeRicota('ric-1', 'OP-20261124-0002')]);
    const ric = await cerrarRicota(service, 'ric-1', 30);
    expect(ric.costBreakdown!.suero).toMatchObject({ aplicado: false, unitValue: '0', valor: '0.00' });
    expect(ric.costBreakdown!.real.costoPorKg).toBe('200.0000');
    await cerrarMasa(service);
    expect(byId.get('masa-1').costBreakdown.real.valorSubproductos).toBe('0.00');
    expect(byId.get('masa-1').unitCost).toBe('4636.3636');
  });

  it('caso 5: dos ricotas vinculadas (30 + 20 kg) → la masa descuenta $57.500 → $4.113,6364/kg', async () => {
    const { service, byId } = makeWorld([
      makeMasa(),
      makeRicota('ric-1', 'OP-20261124-0002'),
      makeRicota('ric-2', 'OP-20261124-0003'),
    ]);
    await cerrarRicota(service, 'ric-1', 30);
    await cerrarRicota(service, 'ric-2', 20);
    await cerrarMasa(service);
    // (30 + 20) × 1.150 = 57.500; 510.000 − 57.500 = 452.500 / 110 = 4.113,6364
    expect(byId.get('masa-1').costBreakdown.real.valorSubproductos).toBe('57500.00');
    expect(byId.get('masa-1').unitCost).toBe('4113.6364');
  });

  it('caso 5: dos ricotas con la masa ya cerrada → cada cierre recostea la masa; queda en $4.113,6364', async () => {
    const { service, byId } = makeWorld([
      makeMasa(),
      makeRicota('ric-1', 'OP-20261124-0002'),
      makeRicota('ric-2', 'OP-20261124-0003'),
    ]);
    await cerrarMasa(service);
    await cerrarRicota(service, 'ric-1', 30);
    expect(byId.get('masa-1').unitCost).toBe('4322.7273');
    await cerrarRicota(service, 'ric-2', 20);
    expect(byId.get('masa-1').unitCost).toBe('4113.6364');
  });

  it('caso 9: masa con versión SIN subproducto "elaboracion" → ricota solo insumos y aviso; masa sin descuento', async () => {
    const { service, byId } = makeWorld([makeMasa('sin'), makeRicota('ric-1', 'OP-20261124-0002')]);
    const ric = await cerrarRicota(service, 'ric-1', 30);
    expect(ric.costBreakdown!.suero).toMatchObject({ aplicado: false });
    expect(ric.costBreakdown!.suero!.motivo).toMatch(/no tiene valor para esta ricota/);
    expect(ric.costBreakdown!.real.costoPorKg).toBe('200.0000');
    await cerrarMasa(service);
    expect(byId.get('masa-1').unitCost).toBe('4636.3636');
    // Al abrir/editar la ricota también avisa (no bloquea).
    const { service: s2, manager } = makeWorld([makeMasa('sin')]);
    await expect((s2 as any).validateWheySource(manager, 'masa-1', RICOTA_P)).resolves.toEqual([
      'La receta de la masa OP-20261124-0001 no tiene valor para esta ricota: no se le va a descontar nada.',
    ]);
  });

  it('caso 10: la ricota usa el recupero de la VERSIÓN de la masa (v4 = $1.150), no el de la receta activa', async () => {
    // La masa quedó congelada en v4; aunque se active una v5 con $1.200, el servicio lee
    // masa.recipeVersion (la versión de la orden), nunca la activa.
    const { service, byId } = makeWorld([makeMasa(1150), makeRicota('ric-1', 'OP-20261124-0002')]);
    const ric = await cerrarRicota(service, 'ric-1', 30);
    expect(ric.costBreakdown!.suero!.unitValue).toBe('1150');
    await cerrarMasa(service);
    expect(byId.get('masa-1').costBreakdown.real.valorSubproductos).toBe('34500.00');
  });

  it('caso 8: borrar una masa con ricota vinculada se frena con mensaje claro', async () => {
    const { service, byId } = makeWorld([makeMasa(), makeRicota('ric-1', 'OP-20261124-0002')]);
    await expect(service.remove('masa-1')).rejects.toThrow(
      'La ricota OP-20261124-0002 se hizo con el suero de OP-20261124-0001. Para borrarla, primero borrá esa ricota o cambiale el origen a "Suero sin masa".',
    );
    expect(byId.has('masa-1')).toBe(true);
  });

  it('caso 8: cambiarle la receta a una masa con ricota vinculada se frena con mensaje claro', async () => {
    const { service } = makeWorld([makeMasa(), makeRicota('ric-1', 'OP-20261124-0002')]);
    await expect(
      service.update('masa-1', { recipeId: 'otra-receta', operatorId: 'op-1', startedAt: new Date().toISOString(), milkInputs: [] } as any),
    ).rejects.toThrow(/Para cambiarle la receta, primero borrá esa ricota/);
  });

  it('caso 15: wheyFromOrderId a una orden que no es masa (intermedio) → error', async () => {
    const mozza = { ...makeMasa(), id: 'mozza-1', code: 'OP-20261124-0009', recipe: { id: 'r', productId: MOZZA_P, name: 'MOZZA' } };
    const { service, manager } = makeWorld([mozza]);
    await expect((service as any).validateWheySource(manager, 'mozza-1', RICOTA_P)).rejects.toThrow(
      'OP-20261124-0009 no es una orden de masa: elegí la masa de cuyo suero salió la ricota.',
    );
  });

  it('caso 15: wheyFromOrderId a una masa cancelada → error (al abrir y al cerrar la ricota)', async () => {
    const masa = { ...makeMasa(), status: 'cancelled' };
    const { service, manager } = makeWorld([masa, makeRicota('ric-1', 'OP-20261124-0002')]);
    await expect((service as any).validateWheySource(manager, 'masa-1', RICOTA_P)).rejects.toThrow(
      'La masa OP-20261124-0001 está cancelada: elegí otra.',
    );
    await expect(cerrarRicota(service, 'ric-1', 30)).rejects.toThrow(/ya no existe o está cancelada/);
  });

  it('caso 15: una orden no puede usar su propio suero; masa inexistente → error', async () => {
    const { service, manager } = makeWorld([makeMasa()]);
    await expect((service as any).validateWheySource(manager, 'masa-1', RICOTA_P, 'masa-1')).rejects.toThrow(
      'Una orden no puede usar su propio suero.',
    );
    await expect((service as any).validateWheySource(manager, 'no-existe', RICOTA_P)).rejects.toThrow(
      /No se encontró la masa elegida/,
    );
  });

  it('caso 14: candado: al cerrar la ricota se bloquea primero la ricota y después la masa', async () => {
    const { service, locks } = makeWorld([makeMasa(), makeRicota('ric-1', 'OP-20261124-0002')]);
    await cerrarRicota(service, 'ric-1', 30);
    const ordenes = locks.filter((l) => l.startsWith('orden:'));
    expect(ordenes[0]).toBe('orden:"ric-1"');
    expect(ordenes[1]).toBe('orden:"masa-1"');
  });

  // Carrera ricota ↔ cierre de mozzarella (QA 24/11, arreglado): si una mozzarella está cerrando
  // con la masa (tiene tomado el lote y leyó su costo viejo $4.636,3636), la ricota espera el
  // lote y recién ahí mira si la masa ya pasó a mozzarella → la ve y NO le descuenta a la masa.
  // Si no, los $34.500 quedarían contados dos veces (mozzarella vía masa vieja + ricota).
  it('caso 14: mozzarella que cierra con la masa en el mismo instante → la masa NO debe recostearse', async () => {
    // La mozzarella tiene tomado el lote de masa; "commitea" en cuanto el servicio consigue
    // bloquear ese lote. Antes de eso, la consulta (que lee lo commiteado) no la ve.
    let masaCerrada = false;
    let mozzaCommiteada = false;
    const world = makeWorld([makeMasa(), makeRicota('ric-1', 'OP-20261124-0002')], {
      masaUsadaEnMozzaCerrada: () => mozzaCommiteada,
      alBloquearLotes: () => {
        if (masaCerrada) mozzaCommiteada = true;
      },
    });
    await cerrarMasa(world.service);
    masaCerrada = true;

    const ric = await cerrarRicota(world.service, 'ric-1', 30);
    expect(world.batchUpdates).toHaveLength(0);
    expect(ric.costBreakdown!.suero!.aplicado).toBe(false);
    expect(world.byId.get('masa-1').unitCost).toBe('4636.3636');
  });
});
