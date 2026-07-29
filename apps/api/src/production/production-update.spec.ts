import { ProductionService } from './production.service';

// Tests del método UPDATE: editar una orden.
// - ABIERTA: la leche ya está descontada (reserva = consumo) → devuelve la leche vieja al silo y
//   reserva/descuenta la nueva; NO corre la calculadora (eso es al cerrar).
// - CERRADA: revierte su efecto y la vuelve a cerrar recalculando el costo; exige la producción
//   real (actualOutputs). La reversión en sí está cubierta por production-remove.spec.
// - CANCELADA: no se puede editar.

jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));
jest.mock('./production-order.entity', () => ({
  ProductionOrderEntity: { name: 'ProductionOrderEntity' },
}));
jest.mock('../products/product.entity', () => ({ ProductEntity: { name: 'ProductEntity' } }));

const PRINCIPAL_PRODUCT_ID = 'prod-mozza';

function makeService(existingOrder: any, milkBatches: any[]) {
  const recipe: any = {
    id: 'rec-1',
    productId: PRINCIPAL_PRODUCT_ID,
    productName: 'Mozzarella',
    activeVersion: {
      id: 'ver-1',
      baseYieldKgPerLiter: '0.1',
      yieldSensitivityFat: '0',
      yieldSensitivityProtein: '0',
      baselineFatPercent: '3.4',
      baselineProteinPercent: '3.2',
      standardWastePercent: '0',
      ingredients: [],
      byproducts: [],
    },
  };
  const recipes = { get: jest.fn().mockResolvedValue(recipe) };
  const users = { findById: jest.fn().mockResolvedValue({ id: 'op-1', fullName: 'Juan' }) };

  const byId = new Map(milkBatches.map((b) => [b.id, b]));
  const savedBatches: any[] = [];
  let savedOrder: any = null;

  const batchRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(byId.get(id) ?? null)),
    save: jest.fn().mockImplementation((b) => {
      savedBatches.push({ ...b });
      return Promise.resolve(b);
    }),
  };
  const orderRepo = {
    // Primera llamada (sin relations) = cargar la orden a editar; la última (con relations) = recarga.
    findOne: jest.fn().mockImplementation(({ relations }: any) =>
      Promise.resolve(
        relations
          ? {
              ...savedOrder,
              recipe,
              operator: { fullName: 'Juan' },
              createdAt: new Date('2026-05-30T08:00:00Z'),
              updatedAt: new Date('2026-05-30T09:00:00Z'),
            }
          : existingOrder,
      ),
    ),
    // Otras órdenes abiertas que podrían compartir lote: ninguna además de esta.
    find: jest.fn().mockResolvedValue([existingOrder]),
    save: jest.fn().mockImplementation((o) => {
      savedOrder = o;
      return Promise.resolve(o);
    }),
  };

  // Movimientos de salida que la orden dejó al reservar (uno por input): los usa releaseReservedMilk
  // para devolver la leche al editar una orden abierta (o reverseClosedOrderEffects si estaba cerrada).
  const orderMovements = ((existingOrder.milkInputs ?? []) as any[]).map((mi, i) => ({
    id: `mv-${i}`,
    batchId: mi.batchId,
    type: 'out',
    quantity: String(mi.liters),
    referenceId: existingOrder.id,
  }));
  const movementRepo = {
    find: jest.fn(({ where: { referenceId } }: any) =>
      Promise.resolve(orderMovements.filter((m) => m.referenceId === referenceId)),
    ),
    create: jest.fn().mockImplementation((m) => ({ ...m })),
    save: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(1),
    remove: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {};
      qb.where = jest.fn(() => qb);
      qb.andWhere = jest.fn(() => qb);
      qb.getCount = jest.fn(() => Promise.resolve(0));
      return qb;
    }),
  };

  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
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
    recipes as any,
    users as any,
    dataSource as any,
    { toArs: jest.fn() } as any,
  );

  return { service, savedBatches, getOrder: () => savedOrder };
}

function batch(id: string, status: string, remaining = '1000') {
  return {
    id,
    code: `LM-LC-${id}`,
    productId: null,
    remainingQuantity: remaining,
    status,
    unit: 'litro',
    unitCost: '10',
  };
}

function openOrder(overrides: any = {}) {
  return {
    id: 'order-1',
    code: 'OP-20260530-0001',
    status: 'open',
    operatorId: 'op-1',
    milkInputs: [{ batchId: 'a', batchCode: 'LM-LC-a', liters: 500 }],
    ...overrides,
  };
}

describe('ProductionService.update — editar una orden abierta', () => {
  it('cambia el lote y los litros: devuelve el viejo al silo y reserva/descuenta el nuevo', async () => {
    // 'a' quedó en 500 tras reservar 500; al editar hacia 'b' la leche de 'a' vuelve al silo.
    const { service, savedBatches, getOrder } = makeService(openOrder(), [
      batch('a', 'en_proceso', '500'),
      batch('b', 'activo'),
    ]);

    const order = await service.update('order-1', {
      recipeId: 'rec-1',
      operatorId: 'op-1',
      startedAt: '2026-05-30T08:00:00Z',
      milkInputs: [{ batchId: 'b', liters: 700 }],
    } as any);

    expect(order.status).toBe('open');
    const saved = getOrder();
    expect(saved.totalMilkLiters).toBe('700');
    expect(saved.milkInputs.map((m: any) => m.batchId)).toEqual(['b']);

    // El lote viejo 'a' recupera sus 500 (500 → 1000) y queda activo; el nuevo 'b' se descuenta.
    const a = savedBatches.find((b) => b.id === 'a');
    expect(a?.status).toBe('activo');
    expect(a?.remainingQuantity).toBe('1000');
    const b = savedBatches.find((x) => x.id === 'b');
    expect(b?.status).toBe('en_proceso');
    expect(b?.remainingQuantity).toBe('300'); // 1000 − 700
  });

  it('deja actualizar las notas conservando el mismo código de orden', async () => {
    const { service, getOrder } = makeService(openOrder(), [batch('a', 'en_proceso')]);

    await service.update('order-1', {
      recipeId: 'rec-1',
      operatorId: 'op-1',
      startedAt: '2026-05-30T08:00:00Z',
      milkInputs: [{ batchId: 'a', liters: 500 }],
      notes: 'corregido',
    } as any);

    const saved = getOrder();
    expect(saved.code).toBe('OP-20260530-0001');
    expect(saved.notes).toBe('corregido');
  });

  it('rechaza editar una orden cancelada', async () => {
    const { service } = makeService(openOrder({ status: 'cancelled' }), [batch('a', 'activo')]);

    await expect(
      service.update('order-1', {
        recipeId: 'rec-1',
        operatorId: 'op-1',
        startedAt: '2026-05-30T08:00:00Z',
        milkInputs: [{ batchId: 'a', liters: 500 }],
      } as any),
    ).rejects.toThrow(/cancelada/);
  });

  it('al editar una orden cerrada exige la producción real para recalcular el costo', async () => {
    const { service } = makeService(openOrder({ status: 'closed' }), [batch('a', 'activo')]);

    await expect(
      service.update('order-1', {
        recipeId: 'rec-1',
        operatorId: 'op-1',
        startedAt: '2026-05-30T08:00:00Z',
        milkInputs: [{ batchId: 'a', liters: 500 }],
        // Falta actualOutputs a propósito.
      } as any),
    ).rejects.toThrow(/producción real/);
  });

  it('frena si el lote nuevo no tiene litros suficientes', async () => {
    // Edita hacia un lote DISTINTO ('b') que solo tiene 100 L y se le piden 500.
    const { service } = makeService(openOrder(), [batch('a', 'en_proceso', '500'), batch('b', 'activo', '100')]);

    await expect(
      service.update('order-1', {
        recipeId: 'rec-1',
        operatorId: 'op-1',
        startedAt: '2026-05-30T08:00:00Z',
        milkInputs: [{ batchId: 'b', liters: 500 }],
      } as any),
    ).rejects.toThrow(/no tiene suficiente/);
  });
});
