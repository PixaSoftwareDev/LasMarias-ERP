import { ProductionService } from './production.service';

// Tests del método OPEN: apertura de la orden de producción y, en particular, la regla
// de silos. Una orden puede consumir leche de VARIOS silos para llegar a los litros que
// necesita (cada lote entra con su costo/litro y la calculadora los suma).

jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));
jest.mock('./production-order.entity', () => ({
  ProductionOrderEntity: { name: 'ProductionOrderEntity' },
}));
jest.mock('../products/product.entity', () => ({ ProductEntity: { name: 'ProductEntity' } }));

const PRINCIPAL_PRODUCT_ID = 'prod-mozza';

function makeService(milkBatches: any[], openOrders: any[] = []) {
  const recipe: any = {
    id: 'rec-1',
    productId: PRINCIPAL_PRODUCT_ID,
    productName: 'Mozzarella',
    activeVersion: {
      id: 'ver-1',
      baseYieldKgPerLiter: '0.1',
      yieldSensitivityFat: '0',
      yieldSensitivityProtein: '0',
      baselineFatPercent: '3.4',
      baselineProteinPercent: '3.2',
      standardWastePercent: '0',
      ingredients: [],
      byproducts: [],
    },
  };
  const recipes = { get: jest.fn().mockResolvedValue(recipe) };
  const users = { findById: jest.fn().mockResolvedValue({ id: 'op-1', fullName: 'Juan' }) };

  const byId = new Map(milkBatches.map((b) => [b.id, b]));
  const savedBatches: any[] = [];
  const savedMovements: any[] = [];
  let savedOrder: any = null;

  const batchRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(byId.get(id) ?? null)),
    save: jest.fn().mockImplementation((b) => {
      savedBatches.push(b);
      return Promise.resolve(b);
    }),
  };
  const movementRepo = {
    create: jest.fn().mockImplementation((m) => ({ ...m })),
    save: jest.fn().mockImplementation((m) => {
      savedMovements.push(m);
      return Promise.resolve(m);
    }),
  };
  const orderRepo = {
    // Órdenes abiertas que ya comprometen lotes (para el chequeo de doble reserva).
    find: jest.fn().mockResolvedValue(openOrders),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      // Sin órdenes previas del día → la secuencia arranca en 0001 (MAX = null).
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
    })),
    create: jest.fn().mockImplementation((o) => ({ ...o, id: 'order-1' })),
    save: jest.fn().mockImplementation((o) => {
      savedOrder = o;
      return Promise.resolve(o);
    }),
    findOne: jest.fn().mockImplementation(() =>
      Promise.resolve({
        ...savedOrder,
        recipe,
        operator: { fullName: 'Juan' },
        createdAt: new Date('2026-05-30T08:00:00Z'),
        updatedAt: new Date('2026-05-30T08:00:00Z'),
      }),
    ),
  };

  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'ProductionOrderEntity') return orderRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

  const service = new ProductionService(
    orderRepo as any,
    recipes as any,
    users as any,
    dataSource as any,
    { toArs: jest.fn() } as any, // exchangeRates (no se usa en open)
  );

  return { service, savedBatches, savedMovements, getOrder: () => savedOrder };
}

function milkBatch(id: string, warehouseId: string, remaining = '1000') {
  return {
    id,
    code: `LM-LE-${id}`,
    productId: null, // leche cruda: sin producto
    warehouseId,
    remainingQuantity: remaining,
    status: 'activo',
    unit: 'litro',
    unitCost: '10',
  };
}

describe('ProductionService.open — regla de silos', () => {
  const input = {
    recipeId: 'rec-1',
    operatorId: 'op-1',
    startedAt: '2026-05-30T08:00:00Z',
    milkInputs: [
      { batchId: 'a', liters: 600 },
      { batchId: 'b', liters: 500 },
    ],
  };

  it('acepta leche de DOS silos distintos y suma los litros', async () => {
    const { service, getOrder } = makeService([
      milkBatch('a', 'silo-norte'),
      milkBatch('b', 'silo-sur'),
    ]);

    const order = await service.open(input as any);

    // No tira error: la orden abre con ambos lotes y el total suma los dos.
    expect(order.status).toBe('open');
    const saved = getOrder();
    expect(saved.totalMilkLiters).toBe('1100');
    expect(saved.milkInputs).toHaveLength(2);
    expect(saved.milkInputs.map((m: any) => m.batchId)).toEqual(['a', 'b']);
  });

  it('descuenta el stock del silo al reservar (marca en proceso y baja el saldo)', async () => {
    const { service, savedBatches, savedMovements } = makeService([
      milkBatch('a', 'silo-norte'), // 1000 L, pide 600 → queda 400
      milkBatch('b', 'silo-sur'), // 1000 L, pide 500 → queda 500
    ]);

    await service.open(input as any);

    // Los lotes quedan en proceso mientras la orden está abierta.
    expect(savedBatches.filter((b) => b.status === 'en_proceso')).toHaveLength(2);
    // Y el saldo YA bajó (reserva = consumo), no se espera al cierre.
    expect(savedBatches.find((b) => b.id === 'a').remainingQuantity).toBe('400');
    expect(savedBatches.find((b) => b.id === 'b').remainingQuantity).toBe('500');
    // Con su movimiento de salida registrado (uno por lote), para poder revertir si se borra/edita.
    expect(savedMovements.filter((m) => m.type === 'out' && m.reason === 'production')).toHaveLength(2);
  });

  it('deja el lote en agotado si la reserva lo consume por completo', async () => {
    const { service, savedBatches } = makeService([
      milkBatch('a', 'silo-norte', '600'), // pide 600 → queda 0
      milkBatch('b', 'silo-sur'),
    ]);

    await service.open(input as any);

    const a = savedBatches.find((b) => b.id === 'a');
    expect(a.remainingQuantity).toBe('0');
    expect(a.status).toBe('agotado');
  });

  it('sigue frenando si un lote no tiene litros suficientes', async () => {
    const { service } = makeService([
      milkBatch('a', 'silo-norte', '100'),
      milkBatch('b', 'silo-sur'),
    ]);

    await expect(service.open(input as any)).rejects.toThrow(/no tiene suficiente/);
  });

  it('previene el doble consumo: un lote ya reservado por otra orden llega con el saldo bajado', async () => {
    // Al reservar se descuenta de verdad, así que si otra orden ya tomó parte del lote 'a', esta
    // orden lo ve con el saldo ya reducido (300 L) y su pedido de 600 no entra.
    const { service } = makeService([
      milkBatch('a', 'silo-norte', '300'), // otra orden ya reservó 700 de los 1000 originales
      milkBatch('b', 'silo-sur'),
    ]);

    await expect(service.open(input as any)).rejects.toThrow(/no tiene suficiente/);
  });
});
