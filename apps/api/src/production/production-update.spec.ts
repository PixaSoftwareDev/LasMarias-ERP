import { ProductionService } from './production.service';

// Tests del método UPDATE: editar una orden ABIERTA (por si se cargó algo mal antes de cerrar).
// Reglas: libera los lotes que la orden tenía reservados y reserva los nuevos; NO consume stock
// ni corre la calculadora (eso es al cerrar); y una orden cerrada NO se puede editar.

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

  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'ProductionOrderEntity') return orderRepo;
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
  it('cambia el lote y los litros: libera el viejo y reserva el nuevo', async () => {
    const { service, savedBatches, getOrder } = makeService(openOrder(), [
      batch('a', 'en_proceso'),
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

    // El lote viejo 'a' se liberó (vuelve a activo) y el nuevo 'b' quedó reservado.
    expect(savedBatches.find((b) => b.id === 'a')?.status).toBe('activo');
    expect(savedBatches.find((b) => b.id === 'b')?.status).toBe('en_proceso');
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

  it('rechaza editar una orden cerrada', async () => {
    const { service } = makeService(openOrder({ status: 'closed' }), [batch('a', 'activo')]);

    await expect(
      service.update('order-1', {
        recipeId: 'rec-1',
        operatorId: 'op-1',
        startedAt: '2026-05-30T08:00:00Z',
        milkInputs: [{ batchId: 'a', liters: 500 }],
      } as any),
    ).rejects.toThrow(/cerrada/);
  });

  it('frena si el lote nuevo no tiene litros suficientes', async () => {
    const { service } = makeService(openOrder(), [batch('a', 'en_proceso', '100')]);

    await expect(
      service.update('order-1', {
        recipeId: 'rec-1',
        operatorId: 'op-1',
        startedAt: '2026-05-30T08:00:00Z',
        milkInputs: [{ batchId: 'a', liters: 500 }],
      } as any),
    ).rejects.toThrow(/no tiene suficiente/);
  });
});
