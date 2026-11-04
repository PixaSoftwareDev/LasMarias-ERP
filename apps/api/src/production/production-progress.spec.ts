import { ProductionService } from './production.service';

// Tests de GUARDAR LO DE HOY sin cerrar la orden (pedidos del dueño, 29/10 y 04/11/2026): la
// crema se desnata el día de la elaboración y la masa se pesa al día siguiente — pero la crema
// se pasteuriza EL MISMO DÍA. Por eso guardar el subproducto SÍ crea su lote de stock en el
// acto (con costo = valor de recupero, igual que el cierre); el cierre después REUSA ese lote.
// El costo de la ORDEN se sigue calculando solo al cerrar (CLAUDE.md §5).

jest.mock('./production-order.entity', () => ({
  ProductionOrderEntity: { name: 'ProductionOrderEntity' },
}));
jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));

const MASA = 'prod-masa';
const CREMA = 'prod-crema';

// Lote + movimiento que un "guardar lo de hoy" anterior ya dejó creados.
function previo(over: Partial<any> = {}) {
  const batch = {
    id: 'sp-1',
    code: 'LM-SP-20261029-0001-1',
    productId: CREMA,
    initialQuantity: '6',
    remainingQuantity: '6',
    initialBultos: null,
    remainingBultos: null,
    unit: 'kg',
    status: 'activo',
    unitCost: '4165',
    ...over,
  };
  const mov = { id: 'mov-1', batchId: 'sp-1', productId: CREMA, type: 'in', quantity: '6', bultos: null };
  return { batch, mov };
}

function makeService(order: any, opts: { previos?: { batch: any; mov: any }[] } = {}) {
  const previos = opts.previos ?? [];
  const batchById: Record<string, any> = Object.fromEntries(previos.map((p) => [p.batch.id, p.batch]));

  const savedBatches: any[] = [];
  const removedBatches: any[] = [];
  const savedMovements: any[] = [];
  const removedMovements: any[] = [];
  let seq = 0;

  const batchRepo = {
    findOne: jest.fn(({ where }: any) => Promise.resolve(batchById[where?.id] ?? null)),
    create: jest.fn().mockImplementation((b) => ({ ...b, id: `nuevo-${++seq}` })),
    save: jest.fn().mockImplementation((b) => {
      savedBatches.push(b);
      return Promise.resolve(b);
    }),
    remove: jest.fn().mockImplementation((b) => {
      removedBatches.push(b);
      return Promise.resolve(b);
    }),
  };
  const movementRepo = {
    find: jest.fn().mockResolvedValue(previos.map((p) => p.mov)),
    create: jest.fn().mockImplementation((m) => m),
    save: jest.fn().mockImplementation((m) => {
      savedMovements.push(m);
      return Promise.resolve(m);
    }),
    remove: jest.fn().mockImplementation((m) => {
      removedMovements.push(m);
      return Promise.resolve(m);
    }),
  };
  const orderRepo = {
    findOne: jest.fn().mockResolvedValue(order),
    save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
  };
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      if (name === 'ProductionOrderEntity') return orderRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };
  const service = new ProductionService(
    {} as any,
    {} as any,
    {} as any,
    dataSource as any,
    {} as any,
  );
  return { service, orderRepo, savedBatches, removedBatches, savedMovements, removedMovements };
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
    recipeVersion: {
      id: 'ver-1',
      // Valor de recupero de la crema: es el costo con el que nace su lote.
      byproducts: [{ name: 'Crema cruda', destinationProductId: CREMA, referenceValuePerUnit: 4165 }],
    },
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
  it('crea el lote de subproducto EN EL ACTO (con costo = recupero) y deja la orden EN CURSO', async () => {
    const order = makeOrder();
    const { service, savedBatches, savedMovements } = makeService(order);

    const dto = await service.saveProgress('order-1', {
      outputs: [{ productId: CREMA, quantity: 130, bultos: 2 }],
    });

    expect(dto.status).toBe('in_progress');
    // El lote nace ya en stock, verificable a mano: 130 kg a $4.165 (el recupero de la receta).
    const lote = savedBatches.find((b) => b.productId === CREMA);
    expect(lote.code).toBe('LM-SP-20261029-0001-1');
    expect(lote.initialQuantity).toBe('130');
    expect(lote.remainingQuantity).toBe('130');
    expect(lote.unitCost).toBe('4165');
    expect(lote.status).toBe('activo');
    expect(lote.parentBatchId).toBe('lote-1'); // cuelga de la leche hasta que exista la masa
    // Con su movimiento de ENTRADA a nombre de la orden (así el cierre lo encuentra y lo reusa).
    const entrada = savedMovements.find((m) => m.type === 'in');
    expect(entrada.batchId).toBe(lote.id);
    expect(entrada.quantity).toBe('130');
    expect(entrada.referenceId).toBe('order-1');
    // Y queda anotado en la orden, con su lote.
    expect(dto.actualOutputs).toEqual([
      {
        productId: CREMA,
        productName: 'Crema cruda',
        quantity: 130,
        unit: 'kg',
        bultos: 2,
        isPrincipal: false,
        batchId: lote.id,
        batchCode: 'LM-SP-20261029-0001-1',
      },
    ]);
    // El costo de la ORDEN sigue sin calcularse (eso es del cierre).
    expect(dto.totalCost).toBeUndefined();
    expect(dto.unitCost).toBeUndefined();
  });

  it('sin valor de recupero en la receta, el lote nace sin costo propio', async () => {
    const order = makeOrder({
      recipeVersion: { id: 'ver-1', byproducts: [{ name: 'Crema cruda', destinationProductId: CREMA }] },
    });
    const { service, savedBatches } = makeService(order);

    await service.saveProgress('order-1', { outputs: [{ productId: CREMA, quantity: 10 }] });

    expect(savedBatches.find((b) => b.productId === CREMA).unitCost).toBeNull();
  });

  it('re-guardar el mismo día AJUSTA el lote existente, no crea otro', async () => {
    const p = previo();
    const order = makeOrder({ status: 'in_progress', actualOutputs: [{ productId: CREMA, quantity: 6 }] });
    const { service, savedBatches, savedMovements } = makeService(order, { previos: [p] });

    await service.saveProgress('order-1', { outputs: [{ productId: CREMA, quantity: 8 }] });

    // El único lote guardado es el MISMO (sp-1), ajustado a 8 kg.
    expect(savedBatches).toHaveLength(1);
    expect(savedBatches[0].id).toBe('sp-1');
    expect(savedBatches[0].initialQuantity).toBe('8');
    expect(savedBatches[0].remainingQuantity).toBe('8');
    // Su movimiento de entrada también queda en 8.
    expect(savedMovements[0].id).toBe('mov-1');
    expect(savedMovements[0].quantity).toBe('8');
  });

  it('si parte del lote ya se usó (la crema ya se pasteurizó), el ajuste respeta lo consumido', async () => {
    // De 6 kg guardados ya se usaron 4 (quedan 2). Corregir a 5 kg → quedan 5 − 4 = 1.
    const p = previo({ remainingQuantity: '2' });
    const order = makeOrder({ status: 'in_progress', actualOutputs: [{ productId: CREMA, quantity: 6 }] });
    const { service, savedBatches } = makeService(order, { previos: [p] });

    await service.saveProgress('order-1', { outputs: [{ productId: CREMA, quantity: 5 }] });

    expect(savedBatches[0].initialQuantity).toBe('5');
    expect(savedBatches[0].remainingQuantity).toBe('1');
  });

  it('no deja bajar la cantidad por debajo de lo ya consumido', async () => {
    const p = previo({ remainingQuantity: '2' }); // consumido = 4
    const order = makeOrder({ status: 'in_progress', actualOutputs: [{ productId: CREMA, quantity: 6 }] });
    const { service } = makeService(order, { previos: [p] });

    await expect(
      service.saveProgress('order-1', { outputs: [{ productId: CREMA, quantity: 3 }] }),
    ).rejects.toThrow(/ya se usaron 4/);
  });

  it('con todo en cero borra el lote (intacto) y la orden vuelve a estar ABIERTA', async () => {
    const p = previo();
    const order = makeOrder({ status: 'in_progress', actualOutputs: [{ productId: CREMA, quantity: 6 }] });
    const { service, removedBatches, removedMovements } = makeService(order, { previos: [p] });

    const dto = await service.saveProgress('order-1', { outputs: [{ productId: CREMA, quantity: 0 }] });

    expect(dto.status).toBe('open');
    expect(dto.actualOutputs).toEqual([]);
    expect(removedBatches.map((b) => b.id)).toEqual(['sp-1']);
    expect(removedMovements.map((m) => m.id)).toEqual(['mov-1']);
  });

  it('NO deja borrar (poner en 0) un lote del que ya se usó algo', async () => {
    const p = previo({ remainingQuantity: '2' });
    const order = makeOrder({ status: 'in_progress', actualOutputs: [{ productId: CREMA, quantity: 6 }] });
    const { service } = makeService(order, { previos: [p] });

    await expect(
      service.saveProgress('order-1', { outputs: [{ productId: CREMA, quantity: 0 }] }),
    ).rejects.toThrow(/no podés borrarlo/i);
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
