import { ProductionService } from './production.service';

// Tests del método REMOVE: borrar una orden deshaciendo su efecto en stock.
// - Abierta: libera la leche reservada (en_proceso → activo) y borra la orden.
// - Cerrada: devuelve lo consumido, elimina lotes producidos y movimientos — solo si
//   lo producido está intacto (si ya se vendió o se usó, se rechaza con aviso claro).
// Verificable a mano: las cantidades restauradas son sumas exactas de los movimientos.

jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));
jest.mock('./production-order.entity', () => ({
  ProductionOrderEntity: { name: 'ProductionOrderEntity' },
}));
jest.mock('../products/product.entity', () => ({ ProductEntity: { name: 'ProductEntity' } }));

interface Fixture {
  orders: any[];
  batches: any[];
  movements: any[];
  /** movimientos de OTRAS referencias sobre un lote (ej. una venta): batchId → cantidad */
  foreignMovementsByBatch?: Record<string, number>;
}

function makeService(fx: Fixture) {
  const ordersById = new Map(fx.orders.map((o) => [o.id, o]));
  const batchesById = new Map(fx.batches.map((b) => [b.id, b]));
  const removedOrders: any[] = [];
  const removedMovements: any[] = [];
  const deletedBatchIds: string[] = [];

  const orderRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(ordersById.get(id) ?? null)),
    find: jest.fn(() =>
      Promise.resolve(fx.orders.filter((o) => o.status === 'open' || o.status === 'in_progress')),
    ),
    remove: jest.fn((o: any) => {
      removedOrders.push(o);
      return Promise.resolve(o);
    }),
  };
  const batchRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(batchesById.get(id) ?? null)),
    save: jest.fn((b: any) => Promise.resolve(b)),
    delete: jest.fn((ids: string[]) => {
      deletedBatchIds.push(...ids);
      return Promise.resolve({});
    }),
  };
  const movementRepo = {
    find: jest.fn(({ where: { referenceId } }: any) =>
      Promise.resolve(fx.movements.filter((m) => m.referenceId === referenceId)),
    ),
    remove: jest.fn((ms: any[]) => {
      removedMovements.push(...ms);
      return Promise.resolve(ms);
    }),
    createQueryBuilder: jest.fn(() => {
      let batchId = '';
      const qb: any = {};
      qb.where = jest.fn((_: string, params: any) => {
        batchId = params.batchId;
        return qb;
      });
      qb.andWhere = jest.fn(() => qb);
      qb.getCount = jest.fn(() => Promise.resolve(fx.foreignMovementsByBatch?.[batchId] ?? 0));
      return qb;
    }),
  };

  const manager = {
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
    { get: jest.fn() } as any,
    { findById: jest.fn() } as any,
    dataSource as any,
    { toArs: jest.fn() } as any, // exchangeRates (no se usa en remove)
  );

  return { service, batchesById, removedOrders, removedMovements, deletedBatchIds };
}

describe('ProductionService.remove — orden abierta', () => {
  it('libera la leche reservada y borra la orden', async () => {
    const milk = { id: 'milk-1', code: 'LM-LE-1', status: 'en_proceso', remainingQuantity: '1000' };
    const order = { id: 'op-1', code: 'OP-1', status: 'open', milkInputs: [{ batchId: 'milk-1', liters: 500 }] };
    const { service, batchesById, removedOrders } = makeService({ orders: [order], batches: [milk], movements: [] });

    const res = await service.remove('op-1');

    expect(res).toEqual({ deleted: true, code: 'OP-1' });
    expect(batchesById.get('milk-1').status).toBe('activo');
    expect(removedOrders).toHaveLength(1);
  });

  it('NO libera un lote que otra orden abierta también está usando', async () => {
    const milk = { id: 'milk-1', code: 'LM-LE-1', status: 'en_proceso', remainingQuantity: '1000' };
    const order = { id: 'op-1', code: 'OP-1', status: 'open', milkInputs: [{ batchId: 'milk-1', liters: 500 }] };
    const other = { id: 'op-2', code: 'OP-2', status: 'open', milkInputs: [{ batchId: 'milk-1', liters: 300 }] };
    const { service, batchesById } = makeService({ orders: [order, other], batches: [milk], movements: [] });

    await service.remove('op-1');

    expect(batchesById.get('milk-1').status).toBe('en_proceso');
  });
});

describe('ProductionService.remove — orden cerrada', () => {
  // Escenario a mano: la orden consumió 500 L de leche (quedaban 500 en el lote de 1000)
  // y produjo 60 kg de mozzarella intactos. Al borrar: la leche vuelve a 1000 L y el lote
  // producido desaparece junto con los movimientos.
  function closedFixture(overrides?: Partial<Fixture>) {
    const milk = { id: 'milk-1', code: 'LM-LE-1', status: 'agotado', remainingQuantity: '0', productId: null };
    const produced = {
      id: 'pp-1', code: 'LM-PP-1', status: 'activo',
      initialQuantity: '60', remainingQuantity: '60', productId: 'prod-mozza',
    };
    const order = { id: 'op-1', code: 'OP-1', status: 'closed', milkInputs: [{ batchId: 'milk-1', liters: 500 }] };
    const movements = [
      { id: 'm-out', batchId: 'milk-1', type: 'out', quantity: '500', referenceId: 'op-1' },
      { id: 'm-in', batchId: 'pp-1', type: 'in', quantity: '60', referenceId: 'op-1' },
    ];
    return makeService({ orders: [order], batches: [milk, produced], movements, ...overrides });
  }

  it('devuelve la leche consumida al lote y lo reactiva', async () => {
    const { service, batchesById } = closedFixture();

    await service.remove('op-1');

    expect(batchesById.get('milk-1').remainingQuantity).toBe('500');
    expect(batchesById.get('milk-1').status).toBe('activo');
  });

  it('elimina el lote producido, los movimientos y la orden', async () => {
    const { service, deletedBatchIds, removedMovements, removedOrders } = closedFixture();

    await service.remove('op-1');

    expect(deletedBatchIds).toEqual(['pp-1']);
    expect(removedMovements).toHaveLength(2);
    expect(removedOrders).toHaveLength(1);
  });

  it('rechaza el borrado si el lote producido ya se usó (venta u otra elaboración)', async () => {
    const { service, removedOrders } = closedFixture({
      foreignMovementsByBatch: { 'pp-1': 1 },
    });

    await expect(service.remove('op-1')).rejects.toThrow(/ya se usó/);
    expect(removedOrders).toHaveLength(0);
  });

  it('rechaza el borrado si al lote producido le falta cantidad (remaining < initial)', async () => {
    const { service, batchesById } = closedFixture();
    batchesById.get('pp-1').remainingQuantity = '40';

    await expect(service.remove('op-1')).rejects.toThrow(/ya se usó/);
  });

  it('restaura cantidades con decimales exactos (sin polvo de float)', async () => {
    // 0.1 restante + 0.2 consumidos deben dar 0.3 exacto (CLAUDE.md §5.5).
    const milk = { id: 'milk-1', code: 'LM-LE-1', status: 'agotado', remainingQuantity: '0.1', productId: null };
    const produced = {
      id: 'pp-1', code: 'LM-PP-1', status: 'activo',
      initialQuantity: '60', remainingQuantity: '60', productId: 'prod-mozza',
    };
    const order = { id: 'op-1', code: 'OP-1', status: 'closed', milkInputs: [{ batchId: 'milk-1', liters: 0.2 }] };
    const movements = [
      { id: 'm-out', batchId: 'milk-1', type: 'out', quantity: '0.2', referenceId: 'op-1' },
      { id: 'm-in', batchId: 'pp-1', type: 'in', quantity: '60', referenceId: 'op-1' },
    ];
    const fx = makeService({ orders: [order], batches: [milk, produced], movements });

    await fx.service.remove('op-1');

    expect(fx.batchesById.get('milk-1').remainingQuantity).toBe('0.3');
  });
});
