import { SalesService } from './sales.service';

// Tests del método REMOVE de ventas: borrar un despacho deshaciendo su efecto.
// - El stock vuelve a los lotes exactos de los que salió (reactiva 'agotado').
// - Se borran el cargo de cuenta corriente y el cobro espejo del contado.
// - Con devoluciones (nota de crédito) se rechaza: el stock ya se repuso en parte.
// Verificable a mano: lo restaurado es la suma exacta de los movimientos 'out'.

jest.mock('./sales-order.entity', () => ({ SalesOrderEntity: { name: 'SalesOrderEntity' } }));
jest.mock('./account-movement.entity', () => ({
  AccountMovementEntity: { name: 'AccountMovementEntity' },
}));
jest.mock('./credit-note.entity', () => ({ CreditNoteEntity: { name: 'CreditNoteEntity' } }));
jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));

interface Fixture {
  orders: any[];
  batches: any[];
  movements: any[];
  accountMovements: any[];
  creditNotesByOrder?: Record<string, number>;
}

function makeService(fx: Fixture) {
  const ordersById = new Map(fx.orders.map((o) => [o.id, o]));
  const batchesById = new Map(fx.batches.map((b) => [b.id, b]));
  const removedOrders: any[] = [];
  const removedMovements: any[] = [];
  const removedAccountMovements: any[] = [];

  const orderRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(ordersById.get(id) ?? null)),
    remove: jest.fn((o: any) => {
      removedOrders.push(o);
      return Promise.resolve(o);
    }),
  };
  const creditNoteRepo = {
    count: jest.fn(({ where: { salesOrderId } }: any) =>
      Promise.resolve(fx.creditNotesByOrder?.[salesOrderId] ?? 0),
    ),
  };
  const batchRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(batchesById.get(id) ?? null)),
    save: jest.fn((b: any) => Promise.resolve(b)),
  };
  const movementRepo = {
    find: jest.fn(({ where: { referenceId } }: any) =>
      Promise.resolve(fx.movements.filter((m) => m.referenceId === referenceId)),
    ),
    remove: jest.fn((ms: any[]) => {
      removedMovements.push(...ms);
      return Promise.resolve(ms);
    }),
  };
  const accountMovementRepo = {
    find: jest.fn(({ where: { referenceId } }: any) =>
      Promise.resolve(fx.accountMovements.filter((m) => m.referenceId === referenceId)),
    ),
    remove: jest.fn((ms: any[]) => {
      removedAccountMovements.push(...ms);
      return Promise.resolve(ms);
    }),
  };

  const manager = {
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'SalesOrderEntity') return orderRepo;
      if (name === 'CreditNoteEntity') return creditNoteRepo;
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      if (name === 'AccountMovementEntity') return accountMovementRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

  const service = new SalesService(
    orderRepo as any,
    { get: jest.fn() } as any,
    { get: jest.fn() } as any,
    { toArs: jest.fn() } as any,
    dataSource as any,
  );

  return { service, batchesById, removedOrders, removedMovements, removedAccountMovements };
}

describe('SalesService.removeOrder', () => {
  // Escenario a mano: la venta sacó 30 kg del lote pp-1 (quedó en 0, agotado) y dejó
  // un cargo de $60.000 (+ cobro espejo si fue contado). Al borrar: el lote vuelve a
  // 30 kg y activo, y los asientos de cuenta corriente desaparecen.
  function fixture(overrides?: Partial<Fixture>) {
    const batch = { id: 'pp-1', code: 'LM-PP-1', status: 'agotado', remainingQuantity: '0', productId: 'mozza' };
    const order = { id: 'so-1', code: 'DSP-000001', paymentMode: 'contado' };
    const movements = [
      { id: 'm-1', batchId: 'pp-1', type: 'out', quantity: '30', referenceType: 'sales_order', referenceId: 'so-1' },
    ];
    const accountMovements = [
      { id: 'a-1', kind: 'charge', amount: '60000', referenceType: 'sales_order', referenceId: 'so-1' },
      { id: 'a-2', kind: 'payment', amount: '60000', referenceType: 'sales_order', referenceId: 'so-1' },
    ];
    return makeService({ orders: [order], batches: [batch], movements, accountMovements, ...overrides });
  }

  it('devuelve el stock a los lotes de origen y reactiva los agotados', async () => {
    const { service, batchesById } = fixture();

    const res = await service.removeOrder('so-1');

    expect(res).toEqual({ deleted: true, code: 'DSP-000001' });
    const batch = batchesById.get('pp-1');
    expect(batch.remainingQuantity).toBe('30');
    expect(batch.status).toBe('activo');
  });

  it('borra los movimientos de stock y los asientos de cuenta corriente (cargo + cobro contado)', async () => {
    const { service, removedOrders, removedMovements, removedAccountMovements } = fixture();

    await service.removeOrder('so-1');

    expect(removedOrders).toHaveLength(1);
    expect(removedMovements.map((m) => m.id)).toEqual(['m-1']);
    expect(removedAccountMovements.map((m) => m.id)).toEqual(['a-1', 'a-2']);
  });

  it('rechaza si el despacho tiene devoluciones (nota de crédito)', async () => {
    const { service, removedOrders } = fixture({ creditNotesByOrder: { 'so-1': 1 } });

    await expect(service.removeOrder('so-1')).rejects.toThrow(/tiene devoluciones/);
    expect(removedOrders).toHaveLength(0);
  });

  it('si un lote de origen ya no existe, igual borra la venta sin romper', async () => {
    const { service, batchesById, removedOrders } = fixture({ batches: [] });

    await service.removeOrder('so-1');

    expect(batchesById.size).toBe(0);
    expect(removedOrders).toHaveLength(1);
  });
});
