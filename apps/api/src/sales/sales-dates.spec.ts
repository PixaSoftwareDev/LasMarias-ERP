import { SalesService } from './sales.service';

// FECHA DEL DESPACHO (pedido del dueño, sep 2026). En producción las 57 ventas quedaron con
// la fecha del día en que se pasaron al sistema (04/08 y 17/09), no con la del remito real:
// los reportes por período y la antigüedad de la cuenta corriente salían corridos.
// - Al cargar: se puede elegir la fecha real; cargo, vencimiento y cobro contado la siguen.
// - Ya cargada: se corrige la fecha y se mueven con ella el cargo (manteniendo el plazo) y el
//   cobro contado; un cobro hecho otro día conserva su fecha.
// Verificable a mano: vencimiento = fecha del despacho + plazo del cliente en días.

jest.mock('./sales-order.entity', () => ({ SalesOrderEntity: { name: 'SalesOrderEntity' } }));
jest.mock('./account-movement.entity', () => ({
  AccountMovementEntity: { name: 'AccountMovementEntity' },
}));
jest.mock('./credit-note.entity', () => ({ CreditNoteEntity: { name: 'CreditNoteEntity' } }));
jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));

const DIA = 24 * 60 * 60 * 1000;

function makeService(opts: { order?: any; accountMovements?: any[]; paymentTermDays?: number | null } = {}) {
  const savedAccount: any[] = [];
  const savedOrders: any[] = [];
  let lastOrder: any = opts.order ?? null;

  const orderRepo = {
    find: jest.fn().mockResolvedValue([]), // guarda anti-duplicado: nada reciente
    findOne: jest.fn(() => Promise.resolve(lastOrder)),
    create: jest.fn((x: any) => x),
    save: jest.fn((o: any) => {
      lastOrder = { id: o.id ?? 'so-new', createdAt: new Date(), updatedAt: new Date(), ...o };
      savedOrders.push(lastOrder);
      return Promise.resolve(lastOrder);
    }),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
    })),
  };
  const batchRepo = {
    find: jest.fn().mockResolvedValue([
      { id: 'pp-1', code: 'LM-PP-1', status: 'activo', remainingQuantity: '100', remainingBultos: null, unit: 'kg' },
    ]),
    save: jest.fn((b: any) => Promise.resolve(b)),
  };
  const movementRepo = { create: jest.fn((x: any) => x), save: jest.fn((x: any) => Promise.resolve(x)) };
  const accountRepo = {
    find: jest.fn().mockResolvedValue(opts.accountMovements ?? []),
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) => {
      savedAccount.push(x);
      return Promise.resolve(x);
    }),
  };

  const manager = {
    query: jest.fn().mockResolvedValue([]), // candados: sin base real, no hacen nada
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'SalesOrderEntity') return orderRepo;
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      if (name === 'AccountMovementEntity') return accountRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };
  const clients = {
    get: jest.fn().mockResolvedValue({
      id: 'cli-1',
      businessName: 'Cliente SA',
      paymentTermDays: opts.paymentTermDays === undefined ? 30 : opts.paymentTermDays,
    }),
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
  return { service, savedAccount, savedOrders, orderRepo };
}

const linea = { productId: 'masa', quantity: 10, unitPrice: 1000 };

describe('SalesService.createOrder — fecha real del despacho', () => {
  it('carga atrasada: el despacho, el cargo y su vencimiento salen de la fecha elegida', async () => {
    const { service, savedAccount } = makeService({ paymentTermDays: 30 });
    const fecha = '2026-07-03T12:00:00-03:00';

    const o = await service.createOrder(
      { clientId: 'cli-1', lines: [linea], paymentMode: 'cuenta_corriente', dispatchedAt: fecha } as any,
      'user-1',
    );

    expect(o.dispatchedAt).toBe(new Date(fecha).toISOString());
    const cargo = savedAccount.find((m) => m.kind === 'charge');
    expect(cargo.occurredAt.toISOString()).toBe(new Date(fecha).toISOString());
    // A mano: 03/07 + 30 días = 02/08.
    expect(cargo.dueDate.toISOString()).toBe(new Date(new Date(fecha).getTime() + 30 * DIA).toISOString());
  });

  it('contado atrasado: el cobro queda con la misma fecha del despacho', async () => {
    const { service, savedAccount } = makeService({ paymentTermDays: null });
    const fecha = '2026-07-10T12:00:00-03:00';

    await service.createOrder({ clientId: 'cli-1', lines: [linea], dispatchedAt: fecha } as any, 'user-1');

    const cobro = savedAccount.find((m) => m.kind === 'payment');
    expect(cobro.occurredAt.toISOString()).toBe(new Date(fecha).toISOString());
  });

  it('sin fecha: el despacho queda con fecha de ahora (como siempre)', async () => {
    const { service } = makeService();
    const antes = Date.now();

    const o = await service.createOrder({ clientId: 'cli-1', lines: [linea] } as any, 'user-1');

    expect(new Date(o.dispatchedAt).getTime()).toBeGreaterThanOrEqual(antes);
  });

  it('rechaza una fecha futura (error de tipeo en el mes o el año)', async () => {
    const { service } = makeService();
    const futura = new Date(Date.now() + 40 * DIA).toISOString();

    await expect(
      service.createOrder({ clientId: 'cli-1', lines: [linea], dispatchedAt: futura } as any, 'user-1'),
    ).rejects.toThrow(/no puede ser futura/);
  });

  it('la guarda de doble-click busca por fecha de CARGA, no de despacho', async () => {
    const { service, orderRepo } = makeService();

    await service.createOrder(
      { clientId: 'cli-1', lines: [linea], dispatchedAt: '2026-07-03T12:00:00-03:00' } as any,
      'user-1',
    );

    const where = orderRepo.find.mock.calls[0][0].where;
    expect(where.createdAt).toBeDefined();
    expect(where.dispatchedAt).toBeUndefined();
  });
});

describe('SalesService.updateOrderDate — corregir la fecha de una venta ya cargada', () => {
  const cargada = new Date('2026-09-17T15:30:00-03:00'); // día en que se pasó al sistema
  const real = '2026-07-03T12:00:00-03:00'; // fecha del remito

  function fixture() {
    const order = {
      id: 'so-1',
      code: 'DSP-000029',
      dispatchedAt: cargada,
      lines: [],
      total: '10000',
      createdAt: cargada,
      updatedAt: cargada,
    };
    const cargo = {
      id: 'a-1',
      kind: 'charge',
      occurredAt: new Date(cargada),
      dueDate: new Date(cargada.getTime() + 30 * DIA),
    };
    const cobroContado = { id: 'a-2', kind: 'payment', occurredAt: new Date(cargada), dueDate: null };
    const cobroPosterior = { id: 'a-3', kind: 'payment', occurredAt: new Date('2026-09-20T10:00:00-03:00'), dueDate: null };
    const env = makeService({ order, accountMovements: [cargo, cobroContado, cobroPosterior] });
    return { ...env, order, cargo, cobroContado, cobroPosterior };
  }

  it('mueve el despacho y el cargo, conservando el plazo de 30 días', async () => {
    const { service, order, cargo } = fixture();

    const o = await service.updateOrderDate('so-1', { dispatchedAt: real });

    expect(o.dispatchedAt).toBe(new Date(real).toISOString());
    expect(order.dispatchedAt.toISOString()).toBe(new Date(real).toISOString());
    expect(cargo.occurredAt.toISOString()).toBe(new Date(real).toISOString());
    expect(cargo.dueDate.toISOString()).toBe(new Date(new Date(real).getTime() + 30 * DIA).toISOString());
  });

  it('mueve el cobro al contado, pero NO un cobro hecho otro día', async () => {
    const { service, cobroContado, cobroPosterior } = fixture();

    await service.updateOrderDate('so-1', { dispatchedAt: real });

    expect(cobroContado.occurredAt.toISOString()).toBe(new Date(real).toISOString());
    expect(cobroPosterior.occurredAt.toISOString()).toBe(new Date('2026-09-20T10:00:00-03:00').toISOString());
  });

  it('rechaza una fecha futura', async () => {
    const { service } = fixture();
    await expect(
      service.updateOrderDate('so-1', { dispatchedAt: new Date(Date.now() + 40 * DIA).toISOString() }),
    ).rejects.toThrow(/no puede ser futura/);
  });
});
