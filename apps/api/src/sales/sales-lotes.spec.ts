import { planFefoAllocation, precioPorGrasa, SalesService } from './sales.service';
import { sortOldestFirst } from '../inventory/oldest-first';

// PEDIDOS DEL DUEÑO (audios 20-21/10/2026), verificados contra la base real:
// 1) La crema no se podía vender: 869,2 kg en dos lotes (709,9 + 159,3) daban "faltan 0"
//    porque la resta en float dejaba 0,0000000000000568. La cuenta tiene que ser exacta.
// 2) "Que salga por defecto el más viejo": ningún lote de producción tiene vencimiento, así
//    que el orden por vencimiento quedaba al azar. Sin vencimiento, manda la fecha de elaboración.
// 3) "Pero que te dé la opción de elegir": cada línea puede fijar el lote del que sale.
// 4) La crema se cobra según el % de grasa que da el análisis: el precio se corrige después.

jest.mock('./sales-order.entity', () => ({ SalesOrderEntity: { name: 'SalesOrderEntity' } }));
jest.mock('./account-movement.entity', () => ({
  AccountMovementEntity: { name: 'AccountMovementEntity' },
}));
jest.mock('./credit-note.entity', () => ({ CreditNoteEntity: { name: 'CreditNoteEntity' } }));
jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));

describe('FEFO en decimal exacto', () => {
  it('vende los 869,2 kg de crema de dos lotes (709,9 + 159,3) sin faltante fantasma', () => {
    const plan = planFefoAllocation(869.2, [
      { id: 'a', remaining: 709.9 },
      { id: 'b', remaining: 159.3 },
    ]);
    expect(plan.shortage).toBe(0);
    expect(plan.allocations).toEqual([
      { batchId: 'a', take: 709.9, remainingAfter: 0 },
      { batchId: 'b', take: 159.3, remainingAfter: 0 },
    ]);
  });

  it('el faltante real también es exacto: 869,3 de 869,2 → falta 0,1', () => {
    const plan = planFefoAllocation(869.3, [
      { id: 'a', remaining: 709.9 },
      { id: 'b', remaining: 159.3 },
    ]);
    expect(plan.shortage).toBe(0.1);
  });

  it('el saldo que queda en el lote es exacto (0,3 − 0,1 = 0,2)', () => {
    const plan = planFefoAllocation(0.1, [{ id: 'a', remaining: 0.3 }]);
    expect(plan.allocations).toEqual([{ batchId: 'a', take: 0.1, remainingAfter: 0.2 }]);
  });
});

describe('sortOldestFirst (el más viejo primero)', () => {
  const d = (s: string) => new Date(s);
  it('sin vencimiento, ordena por fecha de elaboración', () => {
    const sorted = sortOldestFirst([
      { code: 'LM-PP-20260921-0001', expirationDate: null, productionDate: d('2026-09-21') },
      { code: 'LM-PP-20260810-0001', expirationDate: null, productionDate: d('2026-08-10') },
      { code: 'LM-PP-20260817-0001', expirationDate: null, productionDate: d('2026-08-17') },
    ]);
    expect(sorted.map((b) => b.code)).toEqual([
      'LM-PP-20260810-0001',
      'LM-PP-20260817-0001',
      'LM-PP-20260921-0001',
    ]);
  });

  it('el que tiene vencimiento va primero (vence antes que uno que no vence nunca)', () => {
    const sorted = sortOldestFirst([
      { code: 'SIN-VTO', expirationDate: null, productionDate: d('2026-01-01') },
      { code: 'VENCE-TARDE', expirationDate: d('2026-12-01'), productionDate: d('2026-10-01') },
      { code: 'VENCE-PRONTO', expirationDate: d('2026-11-01'), productionDate: d('2026-10-05') },
    ]);
    expect(sorted.map((b) => b.code)).toEqual(['VENCE-PRONTO', 'VENCE-TARDE', 'SIN-VTO']);
  });

  it('no modifica la lista original', () => {
    const lista = [
      { code: 'B', expirationDate: null, productionDate: d('2026-02-01') },
      { code: 'A', expirationDate: null, productionDate: d('2026-01-01') },
    ];
    sortOldestFirst(lista);
    expect(lista[0]!.code).toBe('B');
  });
});

// --- Servicio con la base mockeada ---

function makeService(opts: { order?: any; accountMovements?: any[]; creditNotes?: number; batches?: any[] } = {}) {
  const savedAccount: any[] = [];
  const removedAccount: any[] = [];
  const savedMovements: any[] = [];
  let lastOrder: any = opts.order ?? null;

  const orderRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(() => Promise.resolve(lastOrder)),
    create: jest.fn((x: any) => x),
    save: jest.fn((o: any) => {
      lastOrder = { id: o.id ?? 'so-new', createdAt: new Date(), updatedAt: new Date(), ...o };
      return Promise.resolve(lastOrder);
    }),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
    })),
  };
  const batchRepo = {
    find: jest.fn().mockResolvedValue(
      opts.batches ?? [
        // Desordenados a propósito: el servicio tiene que tomar el más viejo.
        { id: 'nuevo', code: 'LM-PP-20261020-0001', productionDate: new Date('2026-10-20'), expirationDate: null, status: 'activo', remainingQuantity: '300', remainingBultos: null, unit: 'kg' },
        { id: 'viejo', code: 'LM-PP-20260810-0001', productionDate: new Date('2026-08-10'), expirationDate: null, status: 'activo', remainingQuantity: '100', remainingBultos: null, unit: 'kg' },
      ],
    ),
    save: jest.fn((b: any) => Promise.resolve(b)),
  };
  const movementRepo = {
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) => {
      savedMovements.push(x);
      return Promise.resolve(x);
    }),
  };
  const accountRepo = {
    find: jest.fn().mockResolvedValue(opts.accountMovements ?? []),
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) => {
      savedAccount.push(x);
      return Promise.resolve(x);
    }),
    remove: jest.fn((x: any) => {
      removedAccount.push(x);
      return Promise.resolve(x);
    }),
  };
  const creditNoteRepo = { count: jest.fn().mockResolvedValue(opts.creditNotes ?? 0) };

  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'SalesOrderEntity') return orderRepo;
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      if (name === 'AccountMovementEntity') return accountRepo;
      if (name === 'CreditNoteEntity') return creditNoteRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };
  const clients = {
    get: jest.fn().mockResolvedValue({ id: 'cli-1', businessName: 'Cliente SA', paymentTermDays: 30 }),
  };
  const products = { get: jest.fn().mockResolvedValue({ id: 'masa', name: 'Masa', sku: 'MASA', unit: 'kg' }) };
  const exchangeRates = { rateToArs: jest.fn().mockResolvedValue(1) };
  const service = new SalesService(
    orderRepo as any,
    clients as any,
    products as any,
    exchangeRates as any,
    dataSource as any,
  );
  return { service, savedAccount, removedAccount, savedMovements, batchRepo };
}

describe('despacho: de qué lote sale', () => {
  it('por defecto sale del más viejo aunque la base los devuelva desordenados', async () => {
    const { service, savedMovements } = makeService();
    await service.createOrder(
      { clientId: 'cli-1', lines: [{ productId: 'masa', quantity: 150, unitPrice: 10 }] } as any,
      'user-1',
    );
    expect(savedMovements.map((m) => [m.batchId, m.quantity])).toEqual([
      ['viejo', '100'],
      ['nuevo', '50'],
    ]);
  });

  it('si eligen un lote, sale todo de ese lote (aunque haya uno más viejo)', async () => {
    const { service, savedMovements } = makeService();
    const venta = await service.createOrder(
      { clientId: 'cli-1', lines: [{ productId: 'masa', quantity: 150, unitPrice: 10, batchId: 'nuevo' }] } as any,
      'user-1',
    );
    expect(savedMovements.map((m) => [m.batchId, m.quantity])).toEqual([['nuevo', '150']]);
    // La línea recuerda el lote elegido (para mostrarlo en la venta).
    expect(venta.lines[0]!.batchId).toBe('nuevo');
  });

  it('si el lote elegido no alcanza, avisa cuánto tiene y no descuenta nada', async () => {
    const { service, savedMovements } = makeService();
    await expect(
      service.createOrder(
        { clientId: 'cli-1', lines: [{ productId: 'masa', quantity: 150, unitPrice: 10, batchId: 'viejo' }] } as any,
        'user-1',
      ),
    ).rejects.toThrow(/LM-PP-20260810-0001 tiene 100 kg/);
    expect(savedMovements).toHaveLength(0);
  });

  it('una línea automática no se come el lote que otra línea eligió', async () => {
    // Línea 1 automática 100 kg (iría al más viejo); línea 2 eligió el viejo (100 kg).
    // Entre los dos lotes hay 400 kg: tiene que salir, el automático va al otro lote.
    const { service, savedMovements } = makeService();
    await service.createOrder(
      {
        clientId: 'cli-1',
        lines: [
          { productId: 'masa', quantity: 100, unitPrice: 10 },
          { productId: 'masa', quantity: 100, unitPrice: 10, batchId: 'viejo' },
        ],
      } as any,
      'user-1',
    );
    expect(savedMovements.map((m) => [m.batchId, m.quantity]).sort()).toEqual([
      ['nuevo', '100'],
      ['viejo', '100'],
    ]);
  });

  it('si el lote elegido ya no está disponible, lo dice', async () => {
    const { service } = makeService();
    await expect(
      service.createOrder(
        { clientId: 'cli-1', lines: [{ productId: 'masa', quantity: 10, unitPrice: 10, batchId: 'otro' }] } as any,
        'user-1',
      ),
    ).rejects.toThrow(/lote elegido ya no tiene stock/);
  });
});

describe('corregir precio de una venta (crema por % de grasa)', () => {
  const fecha = new Date('2026-10-21T12:00:00Z');
  const venta = (paymentMode: string, total: string, unitPrice: number) => ({
    id: 'so-1',
    code: 'DSP-000090',
    clientId: 'cli-1',
    client: { businessName: 'Cliente SA' },
    dispatchedAt: fecha,
    paymentMode,
    currency: 'ARS',
    exchangeRate: '1',
    notes: null,
    total,
    createdAt: fecha,
    updatedAt: fecha,
    lines: [
      { productId: 'crema', productName: 'Crema', sku: 'CLNP', quantity: 869.2, unitPrice, unit: 'kg', subtotal: Number(total) },
    ],
  });

  it('recalcula el importe y el cargo de cuenta corriente (869,2 kg × $7.500 = $6.519.000)', async () => {
    const cargo = { kind: 'charge', amount: '6257840', occurredAt: fecha };
    const { service, savedAccount } = makeService({
      order: venta('cuenta_corriente', '6257840', 7199.5),
      accountMovements: [cargo],
    });
    const r = await service.updateOrderPrices('so-1', { unitPrices: [7500], reason: 'Análisis 42% grasa' });
    expect(r.total).toBe(6519000);
    expect(r.lines[0]!.subtotal).toBe(6519000);
    expect(r.lines[0]!.unitPrice).toBe(7500);
    expect(savedAccount).toEqual([expect.objectContaining({ kind: 'charge', amount: '6519000' })]);
    expect(r.notes).toMatch(/Análisis 42% grasa/);
  });

  it('al contado mueve también el cobro espejo, así el saldo sigue en 0', async () => {
    const cargo = { kind: 'charge', amount: '6257840', occurredAt: fecha };
    const cobro = { kind: 'payment', amount: '6257840', occurredAt: fecha, notes: 'Cobro contado DSP-000090' };
    const { service, savedAccount } = makeService({
      order: venta('contado', '6257840', 7199.5),
      accountMovements: [cargo, cobro],
    });
    await service.updateOrderPrices('so-1', { unitPrices: [7000] });
    expect(savedAccount.map((m) => [m.kind, m.amount])).toEqual([
      ['charge', '6084400'],
      ['payment', '6084400'],
    ]);
  });

  it('una venta al contado cargada a $0 crea su cobro al ponerle precio', async () => {
    const cargo = { kind: 'charge', amount: '0', occurredAt: fecha };
    const { service, savedAccount } = makeService({
      order: venta('contado', '0', 0),
      accountMovements: [cargo],
    });
    await service.updateOrderPrices('so-1', { unitPrices: [100] });
    expect(savedAccount.map((m) => [m.kind, m.amount])).toEqual([
      ['charge', '86920'],
      ['payment', '86920'],
    ]);
  });

  it('no se corrige una venta con devoluciones (la nota de crédito usó el precio viejo)', async () => {
    const { service } = makeService({ order: venta('contado', '100', 1), creditNotes: 1 });
    await expect(service.updateOrderPrices('so-1', { unitPrices: [2] })).rejects.toThrow(/devoluciones/);
  });

  it('exige un precio por cada línea', async () => {
    const { service } = makeService({ order: venta('contado', '100', 1) });
    await expect(service.updateOrderPrices('so-1', { unitPrices: [2, 3] })).rejects.toThrow(/un precio por cada/);
  });
});

// AUDIO DEL DUEÑO 26/10/2026: la crema a granel se cobra según el % de grasa del análisis del
// comprador. Verificado con la venta real DSP-000108 (DE BON LAIT): 869,2 kg, lista $7.199,50
// por kg de grasa, 59% → $4.247,705 por kg → $3.692.105,19.
describe('crema por % de grasa (precio = $/kg de grasa × % ÷ 100)', () => {
  it('a mano: 7.199,50 × 59 ÷ 100 = 4.247,705 (exacto, sin ruido de float)', () => {
    expect(precioPorGrasa({ basePrice: 7199.5, pct: 59 })).toBe(4247.705);
    expect(precioPorGrasa({ basePrice: 7199.5, pct: 100 })).toBe(7199.5);
    expect(precioPorGrasa({ basePrice: 7199.5, pct: 42.5 })).toBe(3059.7875);
  });

  it('al vender con % de grasa, el backend calcula el precio y pisa el que mandó el front', async () => {
    const { service } = makeService({
      batches: [
        { id: 'crema-1', code: 'LM-IN-1', productionDate: new Date('2026-10-20'), expirationDate: null, status: 'activo', remainingQuantity: '869.2', remainingBultos: null, unit: 'kg' },
      ],
    });
    const venta = await service.createOrder(
      {
        clientId: 'cli-1',
        lines: [{ productId: 'masa', quantity: 869.2, bultos: 62, unitPrice: 1, fat: { pct: 59, basePrice: 7199.5 } }],
      } as any,
      'user-1',
    );
    expect(venta.lines[0]!.unitPrice).toBe(4247.705);
    expect(venta.lines[0]!.subtotal).toBe(3692105.19);
    expect(venta.total).toBe(3692105.19);
    // El análisis queda congelado en la línea (remito + corrección posterior).
    expect(venta.lines[0]!.fatPct).toBe(59);
    expect(venta.lines[0]!.fatBasePrice).toBe(7199.5);
  });

  it('corregir precio con el % del análisis: recalcula importe y cargo, y anota el %', async () => {
    const fecha = new Date('2026-10-21T15:00:00Z');
    const cargo = { kind: 'charge', amount: '6257805.4', occurredAt: fecha };
    const cobro = { kind: 'payment', amount: '6257805.4', occurredAt: fecha };
    const { service, savedAccount } = makeService({
      order: {
        id: 'so-1',
        code: 'DSP-000108',
        clientId: 'cli-1',
        client: { businessName: 'DE BON LAIT SRL' },
        dispatchedAt: fecha,
        paymentMode: 'contado',
        currency: 'ARS',
        exchangeRate: '1',
        notes: null,
        total: '6257805.4',
        createdAt: fecha,
        updatedAt: fecha,
        // Se retiró sin análisis: quedó al precio de lista (100% de grasa).
        lines: [{ productId: 'crema', productName: 'Crema', sku: 'CLNP', quantity: 869.2, unitPrice: 7199.5, unit: 'kg', subtotal: 6257805.4 }],
      },
      accountMovements: [cargo, cobro],
    });
    const r = await service.updateOrderPrices('so-1', {
      unitPrices: [7199.5],
      fat: [{ pct: 59, basePrice: 7199.5 }],
      reason: 'Análisis del comprador',
    });
    expect(r.lines[0]!.unitPrice).toBe(4247.705);
    expect(r.lines[0]!.fatPct).toBe(59);
    expect(r.total).toBe(3692105.19);
    expect(savedAccount.map((m) => [m.kind, m.amount])).toEqual([
      ['charge', '3692105.19'],
      ['payment', '3692105.19'],
    ]);
  });

  it('exige una entrada de grasa por línea si se manda el arreglo', async () => {
    const { service } = makeService({
      order: { id: 'so-1', code: 'DSP-1', clientId: 'c', client: {}, dispatchedAt: new Date(), paymentMode: 'contado', total: '1', lines: [{ productId: 'p', quantity: 1, unitPrice: 1, unit: 'kg', subtotal: 1 }] },
    });
    await expect(
      service.updateOrderPrices('so-1', { unitPrices: [1], fat: [null, { pct: 1, basePrice: 1 }] }),
    ).rejects.toThrow(/% de grasa por cada/);
  });
});

describe('crema por % de grasa: bordes', () => {
  const lote = [{ id: 'c', code: 'LM-IN-1', productionDate: new Date('2026-10-20'), expirationDate: null, status: 'activo', remainingQuantity: '1000', remainingBultos: null, unit: 'kg' }];

  it('el medio centavo se redondea igual al vender y al corregir (603,3725 × 2 = 1.206,75)', async () => {
    const { service } = makeService({ batches: lote });
    const venta = await service.createOrder(
      { clientId: 'cli-1', lines: [{ productId: 'masa', quantity: 2, unitPrice: 0, fat: { pct: 59.6, basePrice: 1012.37 } }] } as any,
      'user-1',
    );
    expect(venta.lines[0]!.unitPrice).toBe(603.3725);
    expect(venta.lines[0]!.subtotal).toBe(1206.75);
    expect(venta.total).toBe(1206.75);
  });

  it('por % de grasa no se puede cobrar por bulto', async () => {
    const { service } = makeService({ batches: lote });
    await expect(
      service.createOrder(
        { clientId: 'cli-1', lines: [{ productId: 'masa', quantity: 10, bultos: 2, unitPrice: 0, priceBasis: 'bulto', fat: { pct: 59, basePrice: 7199.5 } }] } as any,
        'user-1',
      ),
    ).rejects.toThrow(/por kg, no por bulto/);
  });
});
