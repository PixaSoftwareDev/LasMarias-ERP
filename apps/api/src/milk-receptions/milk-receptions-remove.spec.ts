import { MilkReceptionsService } from './milk-receptions.service';

// Tests del método REMOVE: borrar una recepción deshaciendo su efecto en stock.
// - Elimina los lotes de leche que creó (el silo baja solo al desaparecer el lote).
// - La deuda con el tambo no necesita reversa: se deriva de las recepciones aceptadas.
// - Se permite aunque el lote ya haya sido dado de baja por ajuste (vencido/merma):
//   esos ajustes se borran junto con el lote.
// - Se rechaza con aviso claro si la leche se usó en una elaboración o está reservada.

jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));
jest.mock('./milk-reception.entity', () => ({
  MilkReceptionEntity: { name: 'MilkReceptionEntity' },
}));

interface Fixture {
  receptions: any[];
  batches: any[];
  /** movimientos de inventario sobre los lotes (ajustes de stock, consumos de producción) */
  movements: any[];
}

function makeService(fx: Fixture) {
  const receptionsById = new Map(fx.receptions.map((r) => [r.id, r]));
  const batchesById = new Map(fx.batches.map((b) => [b.id, b]));
  const removedReceptions: any[] = [];
  const removedMovements: any[] = [];
  const deletedBatchIds: string[] = [];

  const receptionRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(receptionsById.get(id) ?? null)),
    remove: jest.fn((r: any) => {
      removedReceptions.push(r);
      return Promise.resolve(r);
    }),
  };
  const batchRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(batchesById.get(id) ?? null)),
    delete: jest.fn((ids: string[]) => {
      deletedBatchIds.push(...ids);
      return Promise.resolve({});
    }),
  };
  const movementRepo = {
    remove: jest.fn((ms: any[]) => {
      removedMovements.push(...ms);
      return Promise.resolve(ms);
    }),
    createQueryBuilder: jest.fn(() => {
      let batchId = '';
      let batchIds: string[] = [];
      const qb: any = {};
      qb.where = jest.fn((_: string, params: any) => {
        batchId = params.batchId ?? '';
        batchIds = params.ids ?? [];
        return qb;
      });
      qb.andWhere = jest.fn(() => qb);
      // Guardia: cuenta los movimientos del lote que NO son ajustes de stock.
      qb.getCount = jest.fn(() =>
        Promise.resolve(
          fx.movements.filter((m) => m.batchId === batchId && m.referenceType !== 'stock_adjustment').length,
        ),
      );
      // Reversa: trae todos los movimientos de los lotes a borrar.
      qb.getMany = jest.fn(() => Promise.resolve(fx.movements.filter((m) => batchIds.includes(m.batchId))));
      return qb;
    }),
  };

  const manager = {
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'MilkReceptionEntity') return receptionRepo;
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

  const service = new MilkReceptionsService(
    receptionRepo as any,
    { get: jest.fn() } as any,
    { getQualityLimits: jest.fn(), getIvaRate: jest.fn() } as any,
    { toArs: jest.fn() } as any,
    dataSource as any,
  );

  return { service, removedReceptions, removedMovements, deletedBatchIds };
}

describe('MilkReceptionsService.remove', () => {
  it('borra la recepción y su lote de leche intacto', async () => {
    const milk = { id: 'milk-1', code: 'LM-LE-1', status: 'activo', remainingQuantity: '1000' };
    const reception = { id: 'rec-1', code: 'LM-LE-1', status: 'aceptada', batchIds: ['milk-1'], batchId: 'milk-1' };
    const { service, removedReceptions, deletedBatchIds } = makeService({
      receptions: [reception],
      batches: [milk],
      movements: [],
    });

    const res = await service.remove('rec-1');

    expect(res).toEqual({ deleted: true, code: 'LM-LE-1' });
    expect(removedReceptions).toHaveLength(1);
    expect(deletedBatchIds).toEqual(['milk-1']);
  });

  it('permite borrar aunque el lote ya haya sido dado de baja por ajuste (vencido) y borra esos ajustes', async () => {
    const milk = { id: 'milk-1', code: 'LM-LE-1', status: 'agotado', remainingQuantity: '0' };
    const reception = { id: 'rec-1', code: 'LM-LE-1', status: 'aceptada', batchIds: ['milk-1'], batchId: 'milk-1' };
    const adjustment = { id: 'm-1', batchId: 'milk-1', type: 'out', referenceType: 'stock_adjustment', quantity: '1000' };
    const { service, removedReceptions, removedMovements, deletedBatchIds } = makeService({
      receptions: [reception],
      batches: [milk],
      movements: [adjustment],
    });

    const res = await service.remove('rec-1');

    expect(res.deleted).toBe(true);
    expect(removedReceptions).toHaveLength(1);
    expect(removedMovements).toEqual([adjustment]);
    expect(deletedBatchIds).toEqual(['milk-1']);
  });

  it('rechaza si la leche ya se usó en una elaboración', async () => {
    const milk = { id: 'milk-1', code: 'LM-LE-1', status: 'agotado', remainingQuantity: '0' };
    const reception = { id: 'rec-1', code: 'LM-LE-1', status: 'aceptada', batchIds: ['milk-1'], batchId: 'milk-1' };
    const consumo = { id: 'm-1', batchId: 'milk-1', type: 'out', referenceType: 'production_order', quantity: '500' };
    const { service, removedReceptions, deletedBatchIds } = makeService({
      receptions: [reception],
      batches: [milk],
      movements: [consumo],
    });

    await expect(service.remove('rec-1')).rejects.toThrow(/ya se usó en una elaboración/);
    expect(removedReceptions).toHaveLength(0);
    expect(deletedBatchIds).toHaveLength(0);
  });

  it('rechaza si la leche está reservada por una orden abierta (en_proceso)', async () => {
    const milk = { id: 'milk-1', code: 'LM-LE-1', status: 'en_proceso', remainingQuantity: '1000' };
    const reception = { id: 'rec-1', code: 'LM-LE-1', status: 'aceptada', batchIds: ['milk-1'], batchId: 'milk-1' };
    const { service, removedReceptions } = makeService({
      receptions: [reception],
      batches: [milk],
      movements: [],
    });

    await expect(service.remove('rec-1')).rejects.toThrow(/reservada por una orden/);
    expect(removedReceptions).toHaveLength(0);
  });

  it('borra una recepción bloqueada (sin lote de leche) sin tocar stock', async () => {
    const reception = { id: 'rec-1', code: 'LM-LE-2', status: 'bloqueada', batchIds: [], batchId: null };
    const { service, removedReceptions, deletedBatchIds } = makeService({
      receptions: [reception],
      batches: [],
      movements: [],
    });

    const res = await service.remove('rec-1');

    expect(res.deleted).toBe(true);
    expect(removedReceptions).toHaveLength(1);
    expect(deletedBatchIds).toHaveLength(0);
  });

  it('recepción vieja single-lote: usa batchId cuando batchIds está vacío', async () => {
    const milk = { id: 'milk-9', code: 'LM-LE-9', status: 'activo', remainingQuantity: '800' };
    const reception = { id: 'rec-9', code: 'LM-LE-9', status: 'aceptada', batchIds: [], batchId: 'milk-9' };
    const { service, deletedBatchIds } = makeService({
      receptions: [reception],
      batches: [milk],
      movements: [],
    });

    await service.remove('rec-9');

    expect(deletedBatchIds).toEqual(['milk-9']);
  });
});
