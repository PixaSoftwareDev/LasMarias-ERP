import { ProductionService } from './production.service';

// Tests de la CONEXIÓN del cierre de producción con el inventario y el costeo
// (CLAUDE.md §4.3 / §4.7 / §8). La calculadora pura ya está testeada aparte
// (elaboration-cost.spec.ts); acá verificamos el cableado del método close:
//   - descuenta los litros de leche del lote consumido,
//   - sella el unitCost (costo/kg) en el lote de producto creado,
//   - persiste costBreakdown con real + estándar + variación.

jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));
jest.mock('./production-order.entity', () => ({
  ProductionOrderEntity: { name: 'ProductionOrderEntity' },
}));
jest.mock('../products/product.entity', () => ({ ProductEntity: { name: 'ProductEntity' } }));

const PRINCIPAL_PRODUCT_ID = 'prod-mozza';

function makeService(
  opts: {
    ingredients?: any[];
    insumoLots?: any[];
    baseYieldKgPerLiter?: string | null;
    milkProductId?: string | null;
    products?: Record<string, any>;
  } = {},
) {
  // Producto de cada input (para valuar masa a precio manual). Por defecto la leche es
  // materia prima sin precio manual → se usa el costo del lote.
  const milkProductId = opts.milkProductId === undefined ? 'prod-leche' : opts.milkProductId;
  const products: Record<string, any> = {
    'prod-leche': { id: 'prod-leche', category: 'materia_prima', defaultCost: null },
    ...(opts.products ?? {}),
  };
  // Orden abierta: 1000 L de leche, receta con rendimiento 0.1 kg/L y un insumo a $/L.
  const order: any = {
    id: 'order-1',
    code: 'OP-20260530-0001',
    status: 'open',
    startedAt: new Date('2026-05-30T08:00:00Z'),
    createdAt: new Date('2026-05-30T08:00:00Z'),
    updatedAt: new Date('2026-05-30T08:00:00Z'),
    operatorId: 'op-1',
    operator: { fullName: 'Juan' },
    totalMilkLiters: '1000',
    milkInputs: [{ batchId: 'milk-1', batchCode: 'LM-LE-1', liters: 1000 }],
    expectedOutputs: [
      { productId: PRINCIPAL_PRODUCT_ID, productName: 'Mozzarella', quantity: 100, unit: 'kg', isPrincipal: true },
    ],
    actualOutputs: [],
    recipe: { id: 'rec-1', productId: PRINCIPAL_PRODUCT_ID, name: 'Mozzarella' },
    recipeVersion: {
      id: 'ver-1',
      baseYieldKgPerLiter: opts.baseYieldKgPerLiter === undefined ? '0.1' : opts.baseYieldKgPerLiter,
      yieldSensitivityFat: '0',
      yieldSensitivityProtein: '0',
      baselineFatPercent: '3.4',
      baselineProteinPercent: '3.2',
      standardWastePercent: '0',
      ingredients: opts.ingredients ?? [
        // fermento: 0.2 $/L de leche → 1000 × 0.2 = $200... usamos quantity por litro
        { productName: 'Fermento', quantity: 1, unitCost: 0.5, basis: 'per_liter_milk' },
      ],
      byproducts: [],
    },
  };

  const milkBatch: any = {
    id: 'milk-1',
    code: 'LM-LE-1',
    productId: milkProductId,
    remainingQuantity: '1000',
    status: 'en_proceso',
    unit: 'litro',
    unitCost: '10', // $10/litro (costo del lote)
  };

  const savedBatches: any[] = [];
  const savedMovements: any[] = [];
  let savedOrder: any = null;

  const batchRepo = {
    findOneByOrFail: jest.fn().mockResolvedValue(milkBatch),
    create: jest.fn().mockImplementation((b) => ({ ...b, id: 'prod-batch-1' })),
    save: jest.fn().mockImplementation((b) => {
      savedBatches.push(b);
      return Promise.resolve(b);
    }),
    // Lotes de insumo para el descuento FEFO (vacío por defecto → no descuenta).
    find: jest.fn().mockResolvedValue(opts.insumoLots ?? []),
  };
  const movementRepo = {
    create: jest.fn().mockImplementation((m) => m),
    save: jest.fn().mockImplementation((m) => {
      savedMovements.push(m);
      return Promise.resolve(m);
    }),
  };
  const orderRepo = {
    // 1ra llamada: carga la orden a cerrar; 2da (reload final): la misma orden ya mutada.
    findOne: jest.fn().mockResolvedValue(order),
    save: jest.fn().mockImplementation((o) => {
      savedOrder = o;
      return Promise.resolve(o);
    }),
  };
  // Productos (para valuar masa a precio manual): findOne por id desde el map.
  const productRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(products[id] ?? null)),
  };

  const manager = {
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      if (name === 'ProductionOrderEntity') return orderRepo;
      if (name === 'ProductEntity') return productRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

  // Cotización mockeada: 1 USD = $1000 (para insumos con precio en dólares en la ficha).
  const exchangeRates = { toArs: jest.fn(async (amount: any) => Number(amount) * 1000) };

  const service = new ProductionService(
    orderRepo as any, // orders repo (no se usa en close salvo vía manager)
    {} as any, // recipes
    {} as any, // users
    dataSource as any,
    exchangeRates as any,
  );

  return { service, milkBatch, savedBatches, savedMovements, exchangeRates, getOrder: () => savedOrder };
}

describe('ProductionService.close', () => {
  it('descuenta los litros de leche del lote consumido y registra la salida', async () => {
    const { service, savedBatches, savedMovements } = makeService();

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // El lote de leche queda en 0 y agotado (consumió los 1000 L).
    const milk = savedBatches.find((b) => b.id === 'milk-1');
    expect(milk.remainingQuantity).toBe('0');
    expect(milk.status).toBe('agotado');
    // Hay un movimiento de salida de leche por producción.
    const milkOut = savedMovements.find((m) => m.reason === 'production' && m.type === 'out');
    expect(milkOut.quantity).toBe('1000');
  });

  it('sella el costo/kg en el lote de producto creado', async () => {
    const { service, savedBatches } = makeService();

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // Costo real: leche 1000×$10 = $10000 + insumo 1000×$0.5 = $500 → $10500 / 100 kg = $105/kg.
    const productBatch = savedBatches.find((b) => b.productId === PRINCIPAL_PRODUCT_ID);
    expect(productBatch).toBeDefined();
    expect(productBatch.unitCost).toBe('105.0000');
    expect(productBatch.remainingQuantity).toBe('100');
    expect(productBatch.status).toBe('activo');
  });

  it('persiste costBreakdown con real, estándar y variación', async () => {
    const { service, getOrder } = makeService();

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    const order = getOrder();
    expect(order.status).toBe('closed');
    expect(order.unitCost).toBe('105.0000');
    expect(order.costBreakdown).toBeDefined();
    expect(order.costBreakdown.real.costoPorKg).toBe('105.0000');
    expect(order.costBreakdown.estandar).toBeDefined();
    expect(order.costBreakdown.variance).toBeDefined();
  });

  it('descuenta el stock de insumos por FEFO al cerrar', async () => {
    const insumoLot: any = {
      id: 'sal-1',
      productId: 'prod-sal',
      remainingQuantity: '100',
      status: 'activo',
      unit: 'kg',
      expirationDate: null,
    };
    const { service, savedMovements } = makeService({
      // Sal: 0,02 kg por kg de producto → 0,02 × 100 kg = 2 kg consumidos.
      ingredients: [{ productName: 'Sal', productId: 'prod-sal', quantity: 0.02, unitCost: 300, basis: 'per_kg_product' }],
      insumoLots: [insumoLot],
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    const salOut = savedMovements.find((m) => m.reason === 'consumption' && m.productId === 'prod-sal');
    expect(salOut).toBeDefined();
    expect(salOut.quantity).toBe('2');
    // El lote de sal queda con 98 kg.
    expect(insumoLot.remainingQuantity).toBe('98');
  });

  it('valúa la masa (intermedio) al precio manual del producto, no al costo del lote (#14/#15)', async () => {
    // El input es MASA con precio manual $25/kg, aunque el lote tenga costo $10.
    const { service, savedBatches } = makeService({
      milkProductId: 'prod-masa',
      products: { 'prod-masa': { id: 'prod-masa', category: 'intermedio', defaultCost: '25' } },
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // Masa: 1000 × $25 = $25000 (precio manual, NO los $10 del lote) + insumo 1000×$0.5 = $500
    //  → $25500 / 100 kg = $255/kg.
    const productBatch = savedBatches.find((b) => b.productId === PRINCIPAL_PRODUCT_ID);
    expect(productBatch.unitCost).toBe('255.0000');
  });

  it('sin rendimiento esperado: muestra solo el costo real, sin estándar ni variación (#12)', async () => {
    const { service, getOrder } = makeService({ baseYieldKgPerLiter: null });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    const order = getOrder();
    expect(order.status).toBe('closed');
    // El real se calcula igual ($105/kg); el estándar y la variación quedan en null.
    expect(order.costBreakdown.real.costoPorKg).toBe('105.0000');
    expect(order.costBreakdown.estandar).toBeNull();
    expect(order.costBreakdown.variance).toBeNull();
  });

  it('rendimiento esperado cargado AL CERRAR: habilita el estándar aunque la receta no lo tenga (#12)', async () => {
    const { service, getOrder } = makeService({ baseYieldKgPerLiter: null });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
      expectedYieldKgPerLiter: 0.1, // 0,1 kg/L × 1000 L = 100 kg esperados
    } as any);

    const order = getOrder();
    expect(order.status).toBe('closed');
    expect(order.costBreakdown.real.costoPorKg).toBe('105.0000');
    // Con el esperado cargado a mano, ya hay comparación real vs estándar.
    expect(order.costBreakdown.estandar).not.toBeNull();
    expect(order.costBreakdown.variance).not.toBeNull();
  });

  it('el precio del insumo sale de la FICHA del producto (vigente), no del congelado en la receta', async () => {
    const { service, getOrder } = makeService({
      ingredients: [
        { productName: 'Fermento', productId: 'prod-fermento', quantity: 1, unitCost: 0.5, basis: 'per_liter_milk' },
      ],
      products: {
        'prod-fermento': { id: 'prod-fermento', category: 'insumo', defaultCost: '1', defaultCostCurrency: 'ARS' },
      },
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // Leche 1000×$10 = $10000 + fermento 1000×$1 (precio de la FICHA, no los $0.5 de la
    // receta) = $1000 → $11000 / 100 kg = $110/kg.
    const order = getOrder();
    expect(order.costBreakdown.real.costoPorKg).toBe('110.0000');
    // El detalle por línea queda guardado en el desglose, verificable a mano.
    expect(order.costBreakdown.real.detalleInsumos).toEqual([
      { name: 'Fermento', cantidad: '1000', unitCost: '1', subtotal: '1000.00' },
    ]);
    expect(order.costBreakdown.real.detalleInputs).toEqual([
      { name: 'LM-LE-1', cantidad: '1000', unitCost: '10', subtotal: '10000.00' },
    ]);
  });

  it('insumo sin precio en la ficha: usa el congelado en la versión de receta (respaldo)', async () => {
    const { service, getOrder } = makeService({
      ingredients: [
        { productName: 'Fermento', productId: 'prod-fermento', quantity: 1, unitCost: 0.5, basis: 'per_liter_milk' },
      ],
      products: { 'prod-fermento': { id: 'prod-fermento', category: 'insumo', defaultCost: null } },
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // Leche $10000 + fermento 1000×$0.5 = $500 → $10500 / 100 kg = $105/kg (igual que siempre).
    expect(getOrder().costBreakdown.real.costoPorKg).toBe('105.0000');
  });

  it('insumo con precio en USD en la ficha: se convierte a pesos del día de elaboración', async () => {
    const { service, getOrder, exchangeRates } = makeService({
      ingredients: [
        { productName: 'Fermento importado', productId: 'prod-fermento', quantity: 1, unitCost: 200, basis: 'per_liter_milk' },
      ],
      products: {
        'prod-fermento': { id: 'prod-fermento', category: 'insumo', defaultCost: '0.3', defaultCostCurrency: 'USD' },
      },
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // USD 0,30 × $1000 = $300/litro → leche $10000 + 1000×$300 = $300000 → $310000/100 = $3100/kg.
    expect(exchangeRates.toArs).toHaveBeenCalledWith('0.3', 'USD', expect.any(Date));
    expect(getOrder().costBreakdown.real.costoPorKg).toBe('3100.0000');
  });
});
