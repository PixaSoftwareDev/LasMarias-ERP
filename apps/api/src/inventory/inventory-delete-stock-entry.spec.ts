import { InventoryService } from './inventory.service';

// Tests de la PAPELERA de inventario (deleteStockEntry): eliminar un lote cargado a mano por
// error, sin dejar rastro. Reglas:
//  - Solo lotes cargados a mano: ingresos (LM-IN) y sobrantes de conteo (LM-AJ).
//  - Se puede aunque tenga bajas o ajustes por conteo (caso real sep 2026: leche ingresada
//    por error y dada de baja como "vencida" — quedaba un vencimiento que nunca existió).
//  - NO si se usó en producción o se vendió.
//  - El saldo tiene que cerrar: inicial − bajas = saldo actual.
//  - Borra el lote y TODOS sus movimientos.

jest.mock('../products/product.entity', () => ({ ProductEntity: { name: 'ProductEntity' } }));
jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('./inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));

function makeService(batch: any, movements: any[]) {
  const removedBatches: any[] = [];
  const removedMovements: any[] = [];

  const batchRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(batch?.id === id ? batch : null)),
    remove: jest.fn((b: any) => {
      removedBatches.push(b);
      return Promise.resolve(b);
    }),
  };
  const movementRepo = {
    find: jest.fn(({ where: { batchId } }: any) =>
      Promise.resolve(movements.filter((m) => m.batchId === batchId)),
    ),
    remove: jest.fn((ms: any[]) => {
      removedMovements.push(...ms);
      return Promise.resolve(ms);
    }),
  };

  const manager = {
    // query: lo usan los candados de base (locks.ts). En los tests no hay base real,
    // así que devuelve vacío: lo que se verifica acá es la lógica, no el bloqueo.
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

  const service = new InventoryService(
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    dataSource as any,
  );
  return { service, removedBatches, removedMovements };
}

function stockEntryBatch(overrides: any = {}) {
  return {
    id: 'batch-1',
    code: 'LM-IN-ABC-1',
    initialQuantity: '1000',
    remainingQuantity: '1000',
    ...overrides,
  };
}

const inMov = { id: 'm-in', batchId: 'batch-1', type: 'in', referenceType: 'stock_entry' };

describe('InventoryService.deleteStockEntry — papelera de ingresos', () => {
  it('elimina un ingreso intacto: borra el lote y su movimiento', async () => {
    const { service, removedBatches, removedMovements } = makeService(stockEntryBatch(), [inMov]);

    const res = await service.deleteStockEntry('batch-1');

    expect(res).toEqual({ deleted: true, code: 'LM-IN-ABC-1' });
    expect(removedBatches).toHaveLength(1);
    expect(removedMovements).toHaveLength(1);
  });

  it('rechaza si el lote no es un ingreso de stock (ej. producción LM-PP)', async () => {
    const { service } = makeService(
      stockEntryBatch({ code: 'LM-PP-20260714-0001' }),
      [{ id: 'm', batchId: 'batch-1', type: 'in', referenceType: 'production_order' }],
    );

    await expect(service.deleteStockEntry('batch-1')).rejects.toThrow(/no se cargó a mano/);
  });

  it('rechaza si ya se consumió parte (tiene un movimiento de salida)', async () => {
    const { service } = makeService(stockEntryBatch({ remainingQuantity: '800' }), [
      inMov,
      { id: 'm-out', batchId: 'batch-1', type: 'out', referenceType: 'production_order' },
    ]);

    await expect(service.deleteStockEntry('batch-1')).rejects.toThrow(/ya se usó/);
  });

  it('rechaza si el saldo bajó aunque no haya salida registrada', async () => {
    const { service } = makeService(stockEntryBatch({ remainingQuantity: '999' }), [inMov]);

    await expect(service.deleteStockEntry('batch-1')).rejects.toThrow(/no coincide/);
  });

  // --- Caso real de producción (LM-IN-MRKSJB05-168): 34.644 L de LECHE ingresados por error
  // y dados de baja enteros como "vencido — mal ingresado". Se borra todo, sin rastro.
  it('ingreso + baja completa: borra el lote, el ingreso y la baja', async () => {
    const { service, removedBatches, removedMovements } = makeService(
      stockEntryBatch({ code: 'LM-IN-MRKSJB05-168', initialQuantity: '34644', remainingQuantity: '0' }),
      [
        { ...inMov, quantity: '34644' },
        { id: 'm-baja', batchId: 'batch-1', type: 'out', reason: 'discard', quantity: '34644', referenceType: 'stock_adjustment' },
      ],
    );

    await expect(service.deleteStockEntry('batch-1')).resolves.toEqual({ deleted: true, code: 'LM-IN-MRKSJB05-168' });
    expect(removedBatches).toHaveLength(1);
    expect(removedMovements.map((m) => m.id).sort()).toEqual(['m-baja', 'm-in']);
  });

  // Caso real (LM-AJ-MRW8ADFC-760): un conteo creó 38.000 L de "PRUEBA STOCK PREVIO" y
  // después se dieron de baja. El lote del conteo también se puede borrar.
  it('lote creado por un conteo (LM-AJ) + baja: también se borra', async () => {
    const { service, removedMovements } = makeService(
      stockEntryBatch({ code: 'LM-AJ-MRW8ADFC-760', initialQuantity: '38000', remainingQuantity: '0' }),
      [
        { id: 'm-aj', batchId: 'batch-1', type: 'adjustment', reason: 'count', quantity: '38000', referenceType: 'stock_count' },
        { id: 'm-baja', batchId: 'batch-1', type: 'out', reason: 'discard', quantity: '38000', referenceType: 'stock_adjustment' },
      ],
    );

    await expect(service.deleteStockEntry('batch-1')).resolves.toEqual({ deleted: true, code: 'LM-AJ-MRW8ADFC-760' });
    expect(removedMovements).toHaveLength(2);
  });

  it('baja parcial: a mano 1000 − 300 = 700 de saldo → cierra y se borra', async () => {
    const { service, removedBatches } = makeService(stockEntryBatch({ remainingQuantity: '700' }), [
      { ...inMov, quantity: '1000' },
      { id: 'm-baja', batchId: 'batch-1', type: 'out', reason: 'discard', quantity: '300', referenceType: 'stock_adjustment' },
    ]);

    await service.deleteStockEntry('batch-1');
    expect(removedBatches).toHaveLength(1);
  });

  it('rechaza si además de la baja se vendió parte', async () => {
    const { service, removedBatches } = makeService(stockEntryBatch({ remainingQuantity: '0' }), [
      { ...inMov, quantity: '1000' },
      { id: 'm-baja', batchId: 'batch-1', type: 'out', reason: 'discard', quantity: '300', referenceType: 'stock_adjustment' },
      { id: 'm-venta', batchId: 'batch-1', type: 'out', reason: 'sale', quantity: '700', referenceType: 'sales_order' },
    ]);

    await expect(service.deleteStockEntry('batch-1')).rejects.toThrow(/ya se usó en producción o se vendió/);
    expect(removedBatches).toHaveLength(0);
  });

  it('un lote de conteo que es solo corrección de bultos (cantidad 0) no cuenta como entrada', async () => {
    const { service } = makeService(stockEntryBatch({ code: 'LM-PP-20260801-0001' }), [
      { id: 'm-b', batchId: 'batch-1', type: 'adjustment', reason: 'count', quantity: '0', referenceType: 'stock_count' },
    ]);

    await expect(service.deleteStockEntry('batch-1')).rejects.toThrow(/no se cargó a mano/);
  });

  it('rechaza si el lote no existe', async () => {
    const { service } = makeService(null, []);

    await expect(service.deleteStockEntry('batch-1')).rejects.toThrow(/no encontrado/);
  });
});
