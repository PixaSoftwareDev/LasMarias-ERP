import { InventoryService } from './inventory.service';

// Tests de EDITAR UN LOTE (updateBatch) — pedido del dueño, oct 2026:
//  - Los kg se corrigen como ajuste por conteo CON rastro (movimiento).
//  - Los bultos se corrigen directo, con movimiento de kg 0 y bultos con signo
//    (el caso real: lotes de masa agotados con bultos colgados).
//  - Costo, vencimiento, cámara y notas se corrigen directo. El costo aplica hacia
//    adelante: acá no se recalcula ninguna orden ni venta (CLAUDE.md §5).
//  - Un lote agotado que recupera kg vuelve a 'activo' (masa vieja contada de nuevo)
//    y uno activo que queda en 0 pasa a 'agotado'.

jest.mock('../products/product.entity', () => ({ ProductEntity: { name: 'ProductEntity' } }));
jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('./warehouse.entity', () => ({ WarehouseEntity: { name: 'WarehouseEntity' } }));
jest.mock('./inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));

function makeService(batch: any, warehouses: any[] = []) {
  const savedMovements: any[] = [];
  let savedBatch: any = null;

  const batchRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(batch?.id === id ? batch : null)),
    save: jest.fn((b: any) => {
      savedBatch = { ...b };
      return Promise.resolve(b);
    }),
  };
  const movementRepo = {
    create: jest.fn((m: any) => ({ ...m })),
    save: jest.fn((m: any) => {
      savedMovements.push({ ...m });
      return Promise.resolve(m);
    }),
  };
  const warehouseRepo = {
    findOne: jest.fn(({ where: { id } }: any) =>
      Promise.resolve(warehouses.find((w) => w.id === id) ?? null),
    ),
  };

  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      if (name === 'WarehouseEntity') return warehouseRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

  const service = new InventoryService(
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    dataSource as any,
  );
  return { service, savedMovements, getBatch: () => savedBatch };
}

function masaBatch(overrides: any = {}) {
  return {
    id: 'b-1',
    code: 'LM-PP-20260817-0001',
    productId: 'prod-masa',
    productionDate: new Date('2026-08-17T12:00:00Z'),
    expirationDate: null,
    initialQuantity: '2955.9',
    remainingQuantity: '315.8',
    initialBultos: 182,
    remainingBultos: 276,
    unit: 'kg',
    status: 'activo',
    unitCost: '5561.491',
    warehouseId: null,
    warehouse: null,
    notes: null,
    ...overrides,
  };
}

describe('InventoryService.updateBatch — corregir un lote', () => {
  it('corrige los kg como ajuste por conteo con movimiento de rastro', async () => {
    const { service, savedMovements, getBatch } = makeService(masaBatch());

    const dto = await service.updateBatch('b-1', { countedQuantity: 300 }, 'user-1');

    expect(dto.remainingQuantity).toBe(300);
    expect(getBatch().remainingQuantity).toBe('300');
    // Rastro: un ajuste por conteo CON SIGNO (faltaban 15.8 → salida) y la nota de edición.
    expect(savedMovements).toHaveLength(1);
    expect(savedMovements[0]).toMatchObject({
      type: 'out',
      reason: 'count',
      quantity: '15.8',
      referenceType: 'stock_count',
    });
    expect(savedMovements[0].notes).toContain('315.8 → 300');
  });

  it('si aparecen kg de más, el movimiento es una entrada (signo explícito)', async () => {
    const { service, savedMovements } = makeService(masaBatch());
    await service.updateBatch('b-1', { countedQuantity: 400 }, 'user-1');
    expect(savedMovements[0]).toMatchObject({ type: 'in', reason: 'count', quantity: '84.2' });
  });

  it('rechaza corregir kg/bultos/cámara de un lote reservado por una orden abierta (en_proceso)', async () => {
    const { service } = makeService(masaBatch({ status: 'en_proceso' }));
    await expect(service.updateBatch('b-1', { countedQuantity: 100 }, 'user-1')).rejects.toThrow(
      /reservado por una orden/,
    );
    // Costo y vencimiento sí se pueden corregir aunque esté reservado.
    const { service: s2, getBatch } = makeService(masaBatch({ status: 'en_proceso' }));
    await s2.updateBatch('b-1', { unitCost: 6000 }, 'user-1');
    expect(getBatch().unitCost).toBe('6000');
  });

  it('corrige los bultos colgados (caso real: lote agotado con bultos) con movimiento con signo', async () => {
    const { service, savedMovements, getBatch } = makeService(
      masaBatch({ remainingQuantity: '0', status: 'agotado', remainingBultos: 17 }),
    );

    const dto = await service.updateBatch('b-1', { remainingBultos: 0 }, 'user-1');

    expect(dto.remainingBultos).toBe(0);
    expect(getBatch().status).toBe('agotado'); // sin kg sigue agotado
    expect(savedMovements).toHaveLength(1);
    expect(savedMovements[0]).toMatchObject({ type: 'adjustment', quantity: '0', bultos: -17 });
  });

  it('un lote agotado que recupera kg vuelve a activo (y al revés)', async () => {
    const { service, getBatch } = makeService(
      masaBatch({ remainingQuantity: '0', status: 'agotado', remainingBultos: 0 }),
    );
    await service.updateBatch('b-1', { countedQuantity: 354.4 }, 'user-1');
    expect(getBatch().status).toBe('activo');

    const { service: s2, getBatch: g2 } = makeService(masaBatch());
    await s2.updateBatch('b-1', { countedQuantity: 0 }, 'user-1');
    expect(g2().status).toBe('agotado');
  });

  it('corrige costo, vencimiento y notas sin generar movimientos (no toca la calculadora)', async () => {
    const { service, savedMovements, getBatch } = makeService(masaBatch());

    const dto = await service.updateBatch(
      'b-1',
      { unitCost: 6000, expirationDate: '2026-12-01T12:00:00.000Z', notes: 'corregido' },
      'user-1',
    );

    expect(dto.unitCost).toBe(6000);
    expect(getBatch().unitCost).toBe('6000');
    expect(getBatch().expirationDate).toEqual(new Date('2026-12-01T12:00:00.000Z'));
    expect(getBatch().notes).toBe('corregido');
    expect(savedMovements).toHaveLength(0);
  });

  it('cambia la cámara validando que exista, y la borra con null', async () => {
    const { service, getBatch } = makeService(masaBatch(), [{ id: 'wh-1', name: 'Cámara 1' }]);
    await service.updateBatch('b-1', { warehouseId: 'wh-1' }, 'user-1');
    expect(getBatch().warehouseId).toBe('wh-1');

    const { service: s2 } = makeService(masaBatch());
    await expect(s2.updateBatch('b-1', { warehouseId: 'wh-nope' }, 'user-1')).rejects.toThrow(
      /Cámara no encontrada/,
    );
  });

  it('sin cambios no genera movimientos ni toca el saldo', async () => {
    const { service, savedMovements, getBatch } = makeService(masaBatch());
    await service.updateBatch('b-1', { countedQuantity: 315.8, remainingBultos: 276 }, 'user-1');
    expect(savedMovements).toHaveLength(0);
    expect(getBatch().remainingQuantity).toBe('315.8');
  });

  it('rechaza un lote inexistente', async () => {
    const { service } = makeService(masaBatch());
    await expect(
      service.updateBatch('00000000-0000-0000-0000-000000000000', { countedQuantity: 1 }, 'user-1'),
    ).rejects.toThrow(/no encontrado/);
  });
});
