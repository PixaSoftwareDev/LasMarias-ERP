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

const PRINCIPAL_PRODUCT_ID = 'prod-mozza';

function makeService(opts: { ingredients?: any[]; insumoLots?: any[] } = {}) {
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
      baseYieldKgPerLiter: '0.1',
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
    productId: 'prod-leche',
    remainingQuantity: '1000',
    status: 'en_proceso',
    unit: 'litro',
    unitCost: '10', // $10/litro
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

  const manager = {
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      if (name === 'ProductionOrderEntity') return orderRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

  const service = new ProductionService(
    orderRepo as any, // orders repo (no se usa en close salvo vía manager)
    {} as any, // recipes
    {} as any, // users
    dataSource as any,
  );

  return { service, milkBatch, savedBatches, savedMovements, getOrder: () => savedOrder };
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
});
