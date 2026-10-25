import { MilkReceptionsService } from './milk-receptions.service';

// Tests del método UPDATE: editar una recepción cargada mal (pedido del dueño, oct 2026).
// - Leche SIN USAR: edición total — se rehacen los lotes con el MISMO código y el costo
//   nuevo; la calidad se reevalúa (puede pasar a bloqueada, y ahí no quedan lotes).
// - Leche YA USADA: se editan los datos y los litros solo HASTA LO NO CONSUMIDO; los
//   lotes no se rehacen (el costo nuevo aplica hacia adelante) y el estado no cambia.
// - La cuenta del tambo no necesita reversa: se deriva de las recepciones.

jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));
jest.mock('./milk-reception.entity', () => ({
  MilkReceptionEntity: { name: 'MilkReceptionEntity' },
}));
jest.mock('../inventory/warehouse.entity', () => ({ WarehouseEntity: { name: 'WarehouseEntity' } }));

interface Fixture {
  reception: any;
  batches: any[];
  /** movimientos sobre los lotes (consumos de producción = leche usada) */
  movements: any[];
  producers?: any[];
}

function makeService(fx: Fixture) {
  const batchesById = new Map(fx.batches.map((b) => [b.id, b]));
  const savedBatches: any[] = [];
  const deletedBatchIds: string[] = [];
  let savedReception: any = null;

  const receptionRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(fx.reception?.id === id ? fx.reception : null)),
    save: jest.fn((r: any) => {
      savedReception = { ...r };
      return Promise.resolve(r);
    }),
  };
  const batchRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(batchesById.get(id) ?? null)),
    find: jest.fn(() => Promise.resolve(fx.batches)),
    create: jest.fn((b: any) => ({ ...b })),
    save: jest.fn((b: any) => {
      const saved = { id: b.id ?? `nuevo-${savedBatches.length + 1}`, ...b };
      savedBatches.push(saved);
      return Promise.resolve(saved);
    }),
    delete: jest.fn((ids: string[]) => {
      deletedBatchIds.push(...ids);
      return Promise.resolve({});
    }),
  };
  const movementRepo = {
    remove: jest.fn((ms: any[]) => Promise.resolve(ms)),
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
      qb.getCount = jest.fn(() =>
        Promise.resolve(
          fx.movements.filter(
            (m) =>
              (batchIds.length > 0 ? batchIds.includes(m.batchId) : m.batchId === batchId) &&
              m.referenceType !== 'stock_adjustment',
          ).length,
        ),
      );
      qb.getMany = jest.fn(() => Promise.resolve(fx.movements.filter((m) => batchIds.includes(m.batchId))));
      return qb;
    }),
  };

  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'MilkReceptionEntity') return receptionRepo;
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      if (name === 'WarehouseEntity') return { findOne: jest.fn().mockResolvedValue(null) };
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

  const producers = {
    get: jest.fn((id: string) => {
      const p = (fx.producers ?? []).find((x) => x.id === id);
      if (!p) throw new Error(`tambo no mockeado: ${id}`);
      return Promise.resolve(p);
    }),
  };

  const service = new MilkReceptionsService(
    receptionRepo as any,
    producers as any,
    { getQualityLimits: jest.fn().mockResolvedValue(undefined), getIvaRate: jest.fn().mockResolvedValue(21) } as any,
    { toArs: jest.fn((amount: number) => Promise.resolve(amount)) } as any,
    dataSource as any,
  );

  return { service, savedBatches, deletedBatchIds, getReception: () => savedReception };
}

const TAMBO = { id: 'tambo-1', name: 'Don Pedro', agreedPricePerLiter: 100, priceCurrency: 'ARS', priceIvaMode: 'sin_iva' };

function reception(overrides: any = {}) {
  return {
    id: 'rec-1',
    code: 'LM-LC-20261020-0001',
    status: 'aceptada',
    receivedAt: new Date('2026-10-20T12:00:00Z'),
    producerId: 'tambo-1',
    producerName: 'Don Pedro',
    lines: [{ producerId: 'tambo-1', producerName: 'Don Pedro', liters: 1000, pricePerLiter: 100 }],
    liters: '1000',
    quality: {},
    batchIds: ['milk-1'],
    batchId: 'milk-1',
    createdById: 'user-1',
    createdAt: new Date('2026-10-20T12:30:00Z'),
    updatedAt: new Date('2026-10-20T12:30:00Z'),
    ...overrides,
  };
}

const EDIT_BASE = {
  receivedAt: '2026-10-19T12:00:00.000Z',
  producers: [{ producerId: 'tambo-1', liters: 800 }],
  quality: { alcoholTestPassed: true },
};

describe('MilkReceptionsService.update — leche SIN usar', () => {
  it('rehace el lote con el mismo código, los litros y el costo nuevos', async () => {
    const milk = { id: 'milk-1', code: 'LM-LC-20261020-0001', status: 'activo', remainingQuantity: '1000', initialQuantity: '1000' };
    const { service, savedBatches, deletedBatchIds, getReception } = makeService({
      reception: reception(),
      batches: [milk],
      movements: [],
      producers: [TAMBO],
    });

    const dto = await service.update('rec-1', EDIT_BASE as any);

    // El lote viejo se borra y nace uno nuevo con el MISMO código y los 800 L.
    expect(deletedBatchIds).toEqual(['milk-1']);
    expect(savedBatches).toHaveLength(1);
    expect(savedBatches[0]).toMatchObject({
      code: 'LM-LC-20261020-0001',
      initialQuantity: '800',
      remainingQuantity: '800',
      unitCost: '100.0000',
    });
    expect(dto.liters).toBe(800);
    expect(getReception().liters).toBe('800');
    // La fecha corregida queda en la recepción y en el lote.
    expect(getReception().receivedAt).toEqual(new Date('2026-10-19T12:00:00.000Z'));
  });

  it('si la calidad corregida no pasa, la recepción queda bloqueada y sin lotes', async () => {
    const milk = { id: 'milk-1', code: 'LM-LC-20261020-0001', status: 'activo', remainingQuantity: '1000', initialQuantity: '1000' };
    const { service, savedBatches, getReception } = makeService({
      reception: reception(),
      batches: [milk],
      movements: [],
      producers: [TAMBO],
    });

    await service.update('rec-1', { ...EDIT_BASE, quality: { antibioticsDetected: true } } as any);

    expect(getReception().status).toBe('bloqueada');
    expect(getReception().batchIds).toEqual([]);
    expect(savedBatches).toHaveLength(0);
  });

  it('rechaza editar una recepción anulada', async () => {
    const { service } = makeService({
      reception: reception({ status: 'anulada' }),
      batches: [],
      movements: [],
      producers: [TAMBO],
    });
    await expect(service.update('rec-1', EDIT_BASE as any)).rejects.toThrow(/anulada/);
  });
});

describe('MilkReceptionsService.update — leche YA usada', () => {
  const usedFixture = (remaining: string) => ({
    reception: reception(),
    batches: [
      {
        id: 'milk-1',
        code: 'LM-LC-20261020-0001',
        status: 'activo',
        remainingQuantity: remaining,
        initialQuantity: '1000',
      },
    ],
    movements: [{ batchId: 'milk-1', referenceType: 'production_order', type: 'out' }],
    producers: [TAMBO],
  });

  it('baja los litros solo hasta lo no consumido (saldo e inicial se mueven juntos)', async () => {
    // Quedan 400 L sin usar (se consumieron 600). Bajar el total de 1000 → 800 es válido.
    const { service, savedBatches, deletedBatchIds, getReception } = makeService(usedFixture('400'));

    await service.update('rec-1', EDIT_BASE as any);

    // No se rehace nada: se ajusta el lote existente (1000→800 inicial, 400→200 saldo).
    expect(deletedBatchIds).toEqual([]);
    expect(savedBatches).toHaveLength(1);
    expect(savedBatches[0]).toMatchObject({ initialQuantity: '800', remainingQuantity: '200' });
    expect(getReception().liters).toBe('800');
  });

  it('frena si los litros quedarían por debajo de lo ya consumido', async () => {
    // Se consumieron 700 (quedan 300): bajar el total a 500 dejaría el consumo descubierto.
    const { service } = makeService(usedFixture('300'));

    await expect(
      service.update('rec-1', { ...EDIT_BASE, producers: [{ producerId: 'tambo-1', liters: 500 }] } as any),
    ).rejects.toThrow(/ya se usaron 700 L/);
  });

  it('el estado no cambia aunque la calidad corregida no pase (la leche ya se procesó)', async () => {
    const { service, getReception } = makeService(usedFixture('400'));

    await service.update('rec-1', {
      ...EDIT_BASE,
      producers: [{ producerId: 'tambo-1', liters: 1000 }],
      quality: { antibioticsDetected: true },
    } as any);

    expect(getReception().status).toBe('aceptada');
    expect(getReception().quality).toEqual({ antibioticsDetected: true });
  });
});
