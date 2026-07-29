import { InventoryService } from './inventory.service';

// Tests de la PAPELERA de inventario (deleteStockEntry): eliminar un ingreso de stock cargado
// de más, sin dejar rastro de "baja". Reglas:
//  - Solo ingresos manuales (LM-IN con movimiento in/stock_entry).
//  - Solo si está INTACTO (saldo == inicial y sin salidas/ajustes); si ya se usó, se rechaza.
//  - Borra el lote y su movimiento de entrada.

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

    await expect(service.deleteStockEntry('batch-1')).rejects.toThrow(/no es un ingreso de stock/);
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

    await expect(service.deleteStockEntry('batch-1')).rejects.toThrow(/ya se usó/);
  });

  it('rechaza si el lote no existe', async () => {
    const { service } = makeService(null, []);

    await expect(service.deleteStockEntry('batch-1')).rejects.toThrow(/no encontrado/);
  });
});
