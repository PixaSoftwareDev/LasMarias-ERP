import { ProductionService } from './production.service';

// Tests de GUARDAR LO DE HOY sin cerrar la orden (pedido del dueño, 29/10/2026): la crema se
// desnata el día de la elaboración y la masa se pesa al día siguiente. Lo que se guarda son
// SOLO las cantidades de subproductos; el stock, los lotes y el costo siguen siendo del cierre.

jest.mock('./production-order.entity', () => ({
  ProductionOrderEntity: { name: 'ProductionOrderEntity' },
}));

const MASA = 'prod-masa';
const CREMA = 'prod-crema';

function makeService(order: any) {
  const orderRepo = {
    findOne: jest.fn().mockResolvedValue(order),
    save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
  };
  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn(() => orderRepo),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };
  const service = new ProductionService(
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
    {} as any,
  );
  return { service, orderRepo };
}

function makeOrder(over: Partial<any> = {}) {
  return {
    id: 'order-1',
    code: 'OP-20261029-0001',
    status: 'open',
    startedAt: new Date('2026-10-29T12:00:00Z'),
    createdAt: new Date('2026-10-29T12:00:00Z'),
    updatedAt: new Date('2026-10-29T12:00:00Z'),
    recipeId: 'rec-1',
    recipeVersionId: 'ver-1',
    operatorId: 'op-1',
    recipe: { name: 'MASA LAS MARIAS' },
    operator: { fullName: 'Juan' },
    milkInputs: [{ batchId: 'lote-1', batchCode: 'LM-LC-1', liters: 1000 }],
    expectedOutputs: [
      { productId: MASA, productName: 'Masa', quantity: 100, unit: 'kg', isPrincipal: true },
      { productId: CREMA, productName: 'Crema cruda', quantity: 5, unit: 'kg', isPrincipal: false },
    ],
    actualOutputs: [],
    totalMilkLiters: '1000',
    notes: null,
    ...over,
  };
}

describe('ProductionService.saveProgress — guardar la crema del día sin cerrar', () => {
  it('guarda el subproducto y deja la orden EN CURSO, sin tocar stock ni costo', async () => {
    const order = makeOrder();
    const { service, orderRepo } = makeService(order);

    const dto = await service.saveProgress('order-1', {
      outputs: [{ productId: CREMA, quantity: 6, bultos: 2 }],
    });

    expect(dto.status).toBe('in_progress');
    expect(dto.actualOutputs).toEqual([
      {
        productId: CREMA,
        productName: 'Crema cruda',
        quantity: 6,
        unit: 'kg',
        bultos: 2,
        isPrincipal: false,
      },
    ]);
    expect(orderRepo.save).toHaveBeenCalledTimes(1);
    // No se generó ningún lote ni movimiento: el único repositorio usado es el de órdenes.
    expect(dto.totalCost).toBeUndefined();
    expect(dto.unitCost).toBeUndefined();
  });

  it('con todo en cero la orden vuelve a estar ABIERTA', async () => {
    const order = makeOrder({ status: 'in_progress', actualOutputs: [{ productId: CREMA, quantity: 6 }] });
    const { service } = makeService(order);

    const dto = await service.saveProgress('order-1', { outputs: [{ productId: CREMA, quantity: 0 }] });

    expect(dto.status).toBe('open');
    expect(dto.actualOutputs).toEqual([]);
  });

  it('rechaza cargar acá el producto principal (los kg van al cerrar)', async () => {
    const { service } = makeService(makeOrder());

    await expect(
      service.saveProgress('order-1', { outputs: [{ productId: MASA, quantity: 110 }] }),
    ).rejects.toThrow(/subproductos/i);
  });

  it('rechaza un producto que no es salida esperada de la receta', async () => {
    const { service } = makeService(makeOrder());

    await expect(
      service.saveProgress('order-1', { outputs: [{ productId: 'prod-otro', quantity: 3 }] }),
    ).rejects.toThrow(/subproductos/i);
  });

  it('no deja guardar sobre una orden ya cerrada', async () => {
    const { service } = makeService(makeOrder({ status: 'closed' }));

    await expect(
      service.saveProgress('order-1', { outputs: [{ productId: CREMA, quantity: 6 }] }),
    ).rejects.toThrow(/ya está cerrada/i);
  });
});
