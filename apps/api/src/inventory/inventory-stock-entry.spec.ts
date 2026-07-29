import { InventoryService } from './inventory.service';

// Tests del INGRESO DIRECTO de stock (addStockEntry): aviso de posible doble carga.
// - Con N° de lote de proveedor repetido para el mismo producto → frena (casi seguro duplicado).
// - Sin lote: si ya hubo hoy un ingreso del mismo producto por la misma cantidad → frena.
// - No es un bloqueo definitivo: con confirmDuplicate=true se salta el chequeo y carga igual.

jest.mock('../products/product.entity', () => ({ ProductEntity: { name: 'ProductEntity' } }));
jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('./inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));

function makeService(opts: { product?: any; existingBatches?: any[] } = {}) {
  const product = opts.product ?? {
    id: 'prod-masa',
    name: 'Masa',
    unit: 'kg',
    category: 'intermedio',
    requiresLotNumber: false,
  };
  const existingBatches = opts.existingBatches ?? [];
  const savedBatches: any[] = [];

  const productRepo = { findOne: jest.fn().mockResolvedValue(product) };
  const batchRepo = {
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(
        where.supplierLotNumber
          ? existingBatches.find(
              (b) => b.productId === where.productId && b.supplierLotNumber === where.supplierLotNumber,
            ) ?? null
          : null,
      ),
    ),
    find: jest.fn().mockResolvedValue(existingBatches), // rama "mismo día"
    create: jest.fn((b: any) => b),
    save: jest.fn((b: any) => {
      savedBatches.push(b);
      return Promise.resolve({ ...b, id: 'new-batch' });
    }),
  };
  const movementRepo = {
    create: jest.fn((m: any) => m),
    save: jest.fn((m: any) => Promise.resolve({ ...m, id: 'mov-1', createdAt: new Date('2026-07-29T12:00:00Z') })),
  };

  const manager = {
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'ProductEntity') return productRepo;
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

  const service = new InventoryService(
    {} as any, // warehouses
    {} as any, // movements
    {} as any, // batches
    {} as any, // productionOrders
    {} as any, // salesOrders
    {} as any, // receptions
    { toArs: jest.fn() } as any, // exchangeRates (no se usa en ARS sin costo)
    dataSource as any,
  );

  return { service, savedBatches };
}

function inBatch(overrides: any = {}) {
  return {
    id: 'batch-old',
    code: 'LM-IN-OLD',
    productId: 'prod-masa',
    initialQuantity: '1000',
    supplierLotNumber: null,
    ...overrides,
  };
}

describe('InventoryService.addStockEntry — aviso de doble carga', () => {
  it('frena si ya existe un ingreso del mismo producto con el mismo N° de lote de proveedor', async () => {
    const { service } = makeService({
      existingBatches: [inBatch({ supplierLotNumber: 'L-123' })],
    });

    await expect(
      service.addStockEntry(
        { productId: 'prod-masa', quantity: 500, supplierLotNumber: 'L-123' } as any,
        'user-1',
      ),
    ).rejects.toThrow(/lote de proveedor/);
  });

  it('sin lote: frena si ya hubo hoy un ingreso del mismo producto por la misma cantidad', async () => {
    const { service } = makeService({
      existingBatches: [inBatch({ initialQuantity: '1000' })],
    });

    await expect(
      service.addStockEntry({ productId: 'prod-masa', quantity: 1000 } as any, 'user-1'),
    ).rejects.toThrow(/Ya cargaste hoy/);
  });

  it('confirmDuplicate=true: se salta el aviso y carga el ingreso igual', async () => {
    const { service, savedBatches } = makeService({
      existingBatches: [inBatch({ supplierLotNumber: 'L-123' })],
    });

    await service.addStockEntry(
      { productId: 'prod-masa', quantity: 500, supplierLotNumber: 'L-123', confirmDuplicate: true } as any,
      'user-1',
    );

    expect(savedBatches).toHaveLength(1);
    expect(Number(savedBatches[0].initialQuantity)).toBe(500);
  });

  it('cantidad distinta el mismo día: NO frena (no es el mismo ingreso)', async () => {
    const { service, savedBatches } = makeService({
      existingBatches: [inBatch({ initialQuantity: '1000' })],
    });

    await service.addStockEntry({ productId: 'prod-masa', quantity: 750 } as any, 'user-1');

    expect(savedBatches).toHaveLength(1);
  });
});
