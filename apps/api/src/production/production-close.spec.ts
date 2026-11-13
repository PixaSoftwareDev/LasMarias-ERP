import { ProductionService } from './production.service';

// Tests de la CONEXIÓN del cierre de producción con el inventario y el costeo
// (CLAUDE.md §4.3 / §4.7 / §8). La calculadora pura ya está testeada aparte
// (elaboration-cost.spec.ts); acá verificamos el cableado del método close:
//   - descuenta los litros de leche del lote consumido,
//   - sella el unitCost (costo/kg) en el lote de producto creado,
//   - persiste costBreakdown con real + estándar + variación.

jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));
jest.mock('./production-order.entity', () => ({
  ProductionOrderEntity: { name: 'ProductionOrderEntity' },
}));
jest.mock('../products/product.entity', () => ({ ProductEntity: { name: 'ProductEntity' } }));

const PRINCIPAL_PRODUCT_ID = 'prod-mozza';

function makeService(
  opts: {
    ingredients?: any[];
    insumoLots?: any[];
    baseYieldKgPerLiter?: string | null;
    milkProductId?: string | null;
    products?: Record<string, any>;
    milkRemaining?: string;
    // false = orden VIEJA que quedó abierta antes del cambio (no descontó la leche al abrir);
    // por defecto true = orden nueva (ya descontada al reservar).
    milkAlreadyReserved?: boolean;
    // Costo propio del lote consumido. null = lote cargado a mano sin costo (stock inicial).
    milkUnitCost?: string | null;
    // Último lote PRODUCIDO (con costo) del mismo producto que el lote de origen.
    lastProducedLot?: { unitCost: string; code: string } | null;
    // true = orden SIN lote de origen (ricota del suero): 0 litros, milkInputs vacío.
    sinLote?: boolean;
    // Subproductos de la versión de receta (por defecto ninguno).
    byproducts?: any[];
    // Lotes de subproducto que "guardar lo de hoy" ya creó (con su movimiento de entrada):
    // el cierre debe REUSARLOS en vez de crear otros.
    previos?: { batch: any; mov: any }[];
  } = {},
) {
  // Producto de cada input (para valuar masa a precio manual). Por defecto la leche es
  // materia prima sin precio manual → se usa el costo del lote.
  const milkProductId = opts.milkProductId === undefined ? 'prod-leche' : opts.milkProductId;
  const products: Record<string, any> = {
    'prod-leche': { id: 'prod-leche', category: 'materia_prima', defaultCost: null },
    ...(opts.products ?? {}),
  };
  // Orden abierta: 1000 L de leche, receta con rendimiento 0.1 kg/L y un insumo a $/L.
  const order: any = {
    id: 'order-1',
    code: 'OP-20260530-0001',
    status: 'open',
    startedAt: new Date('2026-05-30T08:00:00Z'),
    createdAt: new Date('2026-05-30T08:00:00Z'),
    updatedAt: new Date('2026-05-30T08:00:00Z'),
    operatorId: 'op-1',
    operator: { fullName: 'Juan' },
    totalMilkLiters: opts.sinLote ? '0' : '1000',
    milkInputs: opts.sinLote ? [] : [{ batchId: 'milk-1', batchCode: 'LM-LE-1', liters: 1000 }],
    expectedOutputs: [
      { productId: PRINCIPAL_PRODUCT_ID, productName: 'Mozzarella', quantity: 100, unit: 'kg', isPrincipal: true },
      // Igual que al abrir: cada subproducto con producto destino aparece en las salidas esperadas.
      ...(opts.byproducts ?? []).map((bp: any) => ({
        productId: bp.destinationProductId,
        productName: bp.name,
        quantity: 0,
        unit: bp.unit,
        isPrincipal: false,
      })),
    ],
    actualOutputs: [],
    recipe: { id: 'rec-1', productId: PRINCIPAL_PRODUCT_ID, name: 'Mozzarella' },
    recipeVersion: {
      id: 'ver-1',
      baseYieldKgPerLiter: opts.baseYieldKgPerLiter === undefined ? '0.1' : opts.baseYieldKgPerLiter,
      yieldSensitivityFat: '0',
      yieldSensitivityProtein: '0',
      baselineFatPercent: '3.4',
      baselineProteinPercent: '3.2',
      standardWastePercent: '0',
      ingredients: opts.ingredients ?? [
        // fermento: 0.2 $/L de leche → 1000 × 0.2 = $200... usamos quantity por litro
        { productName: 'Fermento', quantity: 1, unitCost: 0.5, basis: 'per_liter_milk' },
      ],
      byproducts: opts.byproducts ?? [],
    },
  };

  const milkBatch: any = {
    id: 'milk-1',
    code: 'LM-LE-1',
    productId: milkProductId,
    remainingQuantity: opts.milkRemaining ?? '1000',
    status: 'en_proceso',
    unit: 'litro',
    unitCost: opts.milkUnitCost === undefined ? '10' : opts.milkUnitCost, // $10/litro (costo del lote)
  };

  const savedBatches: any[] = [];
  const removedBatches: any[] = [];
  const savedMovements: any[] = [];
  const removedMovements: any[] = [];
  let savedOrder: any = null;

  const previos = opts.previos ?? [];
  const previoById: Record<string, any> = Object.fromEntries(previos.map((p) => [p.batch.id, p.batch]));

  const batchRepo = {
    findOneByOrFail: jest.fn().mockResolvedValue(milkBatch),
    // Por id: lote de "guardar lo de hoy". Si no, el último lote producido (respaldo de costo).
    findOne: jest.fn(({ where }: any) => Promise.resolve(previoById[where?.id] ?? opts.lastProducedLot ?? null)),
    create: jest.fn().mockImplementation((b) => ({ ...b, id: 'prod-batch-1' })),
    save: jest.fn().mockImplementation((b) => {
      savedBatches.push(b);
      return Promise.resolve(b);
    }),
    remove: jest.fn().mockImplementation((b) => {
      removedBatches.push(b);
      return Promise.resolve(b);
    }),
    // Lotes de insumo para el descuento FEFO (vacío por defecto → no descuenta).
    find: jest.fn().mockResolvedValue(opts.insumoLots ?? []),
    // ¿El insumo lleva stock? Sin lotes nunca (mano de obra) → no se avisa faltante.
    count: jest.fn().mockResolvedValue((opts.insumoLots ?? []).length),
  };
  const movementRepo = {
    // Entradas previas de la orden = lotes creados por "guardar lo de hoy".
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
    // Detección de retrocompat: ¿la orden ya registró la salida de leche al reservar? Por defecto
    // sí (orden nueva). milkAlreadyReserved:false simula una orden vieja que quedó abierta.
    count: jest.fn().mockResolvedValue(opts.milkAlreadyReserved === false ? 0 : 1),
  };
  const orderRepo = {
    // 1ra llamada: carga la orden a cerrar; 2da (reload final): la misma orden ya mutada.
    findOne: jest.fn().mockResolvedValue(order),
    save: jest.fn().mockImplementation((o) => {
      savedOrder = o;
      return Promise.resolve(o);
    }),
  };
  // Productos (para valuar masa a precio manual): findOne por id desde el map.
  const productRepo = {
    findOne: jest.fn(({ where: { id } }: any) => Promise.resolve(products[id] ?? null)),
  };

  const manager = {
    // query: lo usan los candados de base (locks.ts). En los tests no hay base real,
    // así que devuelve vacío: lo que se verifica acá es la lógica, no el bloqueo.
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name ?? '';
      if (name === 'BatchEntity') return batchRepo;
      if (name === 'InventoryMovementEntity') return movementRepo;
      if (name === 'ProductionOrderEntity') return orderRepo;
      if (name === 'ProductEntity') return productRepo;
      throw new Error(`repo no mockeado: ${name}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

  // Cotización mockeada: 1 USD = $1000 (para insumos con precio en dólares en la ficha).
  const exchangeRates = { toArs: jest.fn(async (amount: any) => Number(amount) * 1000) };

  const service = new ProductionService(
    orderRepo as any, // orders repo (no se usa en close salvo vía manager)
    {} as any, // recipes
    {} as any, // users
    dataSource as any,
    exchangeRates as any,
  );

  return {
    service,
    milkBatch,
    savedBatches,
    removedBatches,
    savedMovements,
    removedMovements,
    exchangeRates,
    getOrder: () => savedOrder,
  };
}

describe('ProductionService.close', () => {
  it('NO vuelve a descontar la leche al cerrar: ya salió del silo al reservar', async () => {
    // El lote entra a close tal como lo dejó la reserva (en_proceso). Con la regla nueva la leche
    // se descontó al ABRIR, así que cerrar no debe tocar el saldo ni registrar otra salida.
    const { service, savedBatches, savedMovements } = makeService();

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // El saldo del lote de leche NO cambia al cerrar (se mantiene lo que dejó la reserva).
    const milk = savedBatches.find((b) => b.id === 'milk-1');
    expect(milk.remainingQuantity).toBe('1000');
    // Solo se libera la marca de "en proceso": queda activo (todavía tiene saldo en el mock).
    expect(milk.status).toBe('activo');
    // Y NO se crea un nuevo movimiento de salida de leche al cerrar (ese se registró al reservar).
    const milkOut = savedMovements.find((m) => m.reason === 'production' && m.type === 'out');
    expect(milkOut).toBeUndefined();
  });

  it('RETROCOMPAT: una orden vieja que quedó abierta (sin descuento) SÍ descuenta la leche al cerrar', async () => {
    // Solo aplica cuando NO hay movimiento de salida de la orden (milkAlreadyReserved:false).
    // Para las órdenes nuevas esto nunca se dispara, así que no rompe nada a futuro.
    const { service, savedBatches, savedMovements } = makeService({ milkAlreadyReserved: false });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // Al no haber salido antes, se descuenta al cerrar: 1000 → 0 y agotado.
    const milk = savedBatches.find((b) => b.id === 'milk-1');
    expect(milk.remainingQuantity).toBe('0');
    expect(milk.status).toBe('agotado');
    // Y se registra su movimiento de salida (recién ahora).
    const milkOut = savedMovements.find((m) => m.reason === 'production' && m.type === 'out');
    expect(milkOut.quantity).toBe('1000');
  });

  it('RETROCOMPAT: la orden vieja tampoco cierra si al lote ya no le alcanza (guard anti-doble-consumo)', async () => {
    const { service } = makeService({ milkAlreadyReserved: false, milkRemaining: '800' });

    await expect(
      service.close('order-1', {
        actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
      } as any),
    ).rejects.toThrow(/no alcanza para cerrar/);
  });

  it('sella el costo/kg en el lote de producto creado', async () => {
    const { service, savedBatches } = makeService();

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // Costo real: leche 1000×$10 = $10000 + insumo 1000×$0.5 = $500 → $10500 / 100 kg = $105/kg.
    const productBatch = savedBatches.find((b) => b.productId === PRINCIPAL_PRODUCT_ID);
    expect(productBatch).toBeDefined();
    expect(productBatch.unitCost).toBe('105.0000');
    expect(productBatch.remainingQuantity).toBe('100');
    expect(productBatch.status).toBe('activo');
  });

  it('persiste costBreakdown con real, estándar y variación', async () => {
    const { service, getOrder } = makeService();

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    const order = getOrder();
    expect(order.status).toBe('closed');
    expect(order.unitCost).toBe('105.0000');
    expect(order.costBreakdown).toBeDefined();
    expect(order.costBreakdown.real.costoPorKg).toBe('105.0000');
    expect(order.costBreakdown.estandar).toBeDefined();
    expect(order.costBreakdown.variance).toBeDefined();
  });

  it('descuenta el stock de insumos por FEFO al cerrar', async () => {
    const insumoLot: any = {
      id: 'sal-1',
      productId: 'prod-sal',
      remainingQuantity: '100',
      status: 'activo',
      unit: 'kg',
      expirationDate: null,
    };
    const { service, savedMovements } = makeService({
      // Sal: 0,02 kg por kg de producto → 0,02 × 100 kg = 2 kg consumidos.
      ingredients: [{ productName: 'Sal', productId: 'prod-sal', quantity: 0.02, unitCost: 300, basis: 'per_kg_product' }],
      insumoLots: [insumoLot],
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    const salOut = savedMovements.find((m) => m.reason === 'consumption' && m.productId === 'prod-sal');
    expect(salOut).toBeDefined();
    expect(salOut.quantity).toBe('2');
    // El lote de sal queda con 98 kg.
    expect(insumoLot.remainingQuantity).toBe('98');
  });

  it('valúa la masa (intermedio) al precio manual del producto, no al costo del lote (#14/#15)', async () => {
    // El input es MASA con precio manual $25/kg, aunque el lote tenga costo $10.
    const { service, savedBatches } = makeService({
      milkProductId: 'prod-masa',
      products: { 'prod-masa': { id: 'prod-masa', category: 'intermedio', defaultCost: '25' } },
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // Masa: 1000 × $25 = $25000 (precio manual, NO los $10 del lote) + insumo 1000×$0.5 = $500
    //  → $25500 / 100 kg = $255/kg.
    const productBatch = savedBatches.find((b) => b.productId === PRINCIPAL_PRODUCT_ID);
    expect(productBatch.unitCost).toBe('255.0000');
  });

  // REPROCESO y CREMA (audios del dueño, 20-21/10/2026): el origen de una orden puede ser un
  // lote de queso que vuelve a fundirse o la crema cruda. Esos lotes muchas veces se cargaron a
  // mano como stock inicial, SIN costo. Sin costo propio, se usa el costo de referencia de la
  // ficha del producto; si tampoco hay, entra a $0 (como hasta hoy) y la pantalla lo avisa.
  describe('lote de origen sin costo propio (stock inicial de crema o queso para reprocesar)', () => {
    const close = (service: ProductionService) =>
      service.close('order-1', {
        actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
      } as any);
    const productBatchOf = (saved: any[]) => saved.find((b) => b.productId === PRINCIPAL_PRODUCT_ID);

    it('usa el costo de referencia de la ficha: 1000 × $4 + insumo $500 = $4500 / 100 kg = $45/kg', async () => {
      const { service, savedBatches } = makeService({
        milkUnitCost: null,
        milkProductId: 'prod-crema',
        products: { 'prod-crema': { id: 'prod-crema', category: 'subproducto', defaultCost: '4' } },
      });
      await close(service);
      expect(productBatchOf(savedBatches).unitCost).toBe('45.0000');
    });

    it('costo de referencia en USD: se convierte a pesos del día (1 USD = $1000 en el mock)', async () => {
      const { service, savedBatches } = makeService({
        milkUnitCost: null,
        milkProductId: 'prod-crema',
        products: {
          'prod-crema': { id: 'prod-crema', category: 'subproducto', defaultCost: '0.004', defaultCostCurrency: 'USD' },
        },
      });
      await close(service);
      // 1000 × (0,004 × 1000 = $4) + $500 = $4500 / 100 kg.
      expect(productBatchOf(savedBatches).unitCost).toBe('45.0000');
    });

    it('sin costo propio ni de referencia entra a $0: solo cuenta el insumo ($500 / 100 kg = $5/kg)', async () => {
      const { service, savedBatches } = makeService({
        milkUnitCost: null,
        milkProductId: 'prod-queso',
        products: { 'prod-queso': { id: 'prod-queso', category: 'queso', defaultCost: null } },
      });
      await close(service);
      expect(productBatchOf(savedBatches).unitCost).toBe('5.0000');
    });

    it('sin ficha, usa el costo del último lote PRODUCIDO de ese producto: 1000 × $7 + $500 = $75/kg', async () => {
      const { service, savedBatches } = makeService({
        milkUnitCost: null,
        milkProductId: 'prod-queso',
        products: { 'prod-queso': { id: 'prod-queso', category: 'queso', defaultCost: null } },
        lastProducedLot: { unitCost: '7', code: 'LM-PP-20261021-0002' },
      });
      await close(service);
      expect(productBatchOf(savedBatches).unitCost).toBe('75.0000');
    });

    it('la ficha manda sobre el último lote producido', async () => {
      const { service, savedBatches } = makeService({
        milkUnitCost: null,
        milkProductId: 'prod-queso',
        products: { 'prod-queso': { id: 'prod-queso', category: 'queso', defaultCost: '4' } },
        lastProducedLot: { unitCost: '7', code: 'LM-PP-X' },
      });
      await close(service);
      expect(productBatchOf(savedBatches).unitCost).toBe('45.0000');
    });

    it('un lote de queso CON costo propio (reproceso de un lote producido) usa SU costo, no el de la ficha', async () => {
      const { service, savedBatches } = makeService({
        milkUnitCost: '10',
        milkProductId: 'prod-queso',
        products: { 'prod-queso': { id: 'prod-queso', category: 'queso', defaultCost: '99' } },
      });
      await close(service);
      // 1000 × $10 + $500 = $10500 / 100 kg = $105/kg (la ficha de $99 no pisa el costo real del lote).
      expect(productBatchOf(savedBatches).unitCost).toBe('105.0000');
    });
  });

  it('sin rendimiento esperado: muestra solo el costo real, sin estándar ni variación (#12)', async () => {
    const { service, getOrder } = makeService({ baseYieldKgPerLiter: null });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    const order = getOrder();
    expect(order.status).toBe('closed');
    // El real se calcula igual ($105/kg); el estándar y la variación quedan en null.
    expect(order.costBreakdown.real.costoPorKg).toBe('105.0000');
    expect(order.costBreakdown.estandar).toBeNull();
    expect(order.costBreakdown.variance).toBeNull();
  });

  it('rendimiento esperado cargado AL CERRAR: habilita el estándar aunque la receta no lo tenga (#12)', async () => {
    const { service, getOrder } = makeService({ baseYieldKgPerLiter: null });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
      expectedYieldKgPerLiter: 0.1, // 0,1 kg/L × 1000 L = 100 kg esperados
    } as any);

    const order = getOrder();
    expect(order.status).toBe('closed');
    expect(order.costBreakdown.real.costoPorKg).toBe('105.0000');
    // Con el esperado cargado a mano, ya hay comparación real vs estándar.
    expect(order.costBreakdown.estandar).not.toBeNull();
    expect(order.costBreakdown.variance).not.toBeNull();
  });

  it('el precio del insumo sale de la FICHA del producto (vigente), no del congelado en la receta', async () => {
    const { service, getOrder } = makeService({
      ingredients: [
        { productName: 'Fermento', productId: 'prod-fermento', quantity: 1, unitCost: 0.5, basis: 'per_liter_milk' },
      ],
      products: {
        'prod-fermento': { id: 'prod-fermento', category: 'insumo', defaultCost: '1', defaultCostCurrency: 'ARS' },
      },
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // Leche 1000×$10 = $10000 + fermento 1000×$1 (precio de la FICHA, no los $0.5 de la
    // receta) = $1000 → $11000 / 100 kg = $110/kg.
    const order = getOrder();
    expect(order.costBreakdown.real.costoPorKg).toBe('110.0000');
    // El detalle por línea queda guardado en el desglose, verificable a mano.
    expect(order.costBreakdown.real.detalleInsumos).toEqual([
      { name: 'Fermento', cantidad: '1000', unitCost: '1', subtotal: '1000.00' },
    ]);
    expect(order.costBreakdown.real.detalleInputs).toEqual([
      { name: 'LM-LE-1', cantidad: '1000', unitCost: '10', subtotal: '10000.00' },
    ]);
  });

  it('insumo sin precio en la ficha: usa el congelado en la versión de receta (respaldo)', async () => {
    const { service, getOrder } = makeService({
      ingredients: [
        { productName: 'Fermento', productId: 'prod-fermento', quantity: 1, unitCost: 0.5, basis: 'per_liter_milk' },
      ],
      products: { 'prod-fermento': { id: 'prod-fermento', category: 'insumo', defaultCost: null } },
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // Leche $10000 + fermento 1000×$0.5 = $500 → $10500 / 100 kg = $105/kg (igual que siempre).
    expect(getOrder().costBreakdown.real.costoPorKg).toBe('105.0000');
  });

  it('insumo con precio en USD en la ficha: se convierte a pesos del día de elaboración', async () => {
    const { service, getOrder, exchangeRates } = makeService({
      ingredients: [
        { productName: 'Fermento importado', productId: 'prod-fermento', quantity: 1, unitCost: 200, basis: 'per_liter_milk' },
      ],
      products: {
        'prod-fermento': { id: 'prod-fermento', category: 'insumo', defaultCost: '0.3', defaultCostCurrency: 'USD' },
      },
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    // USD 0,30 × $1000 = $300/litro → leche $10000 + 1000×$300 = $300000 → $310000/100 = $3100/kg.
    expect(exchangeRates.toArs).toHaveBeenCalledWith('0.3', 'USD', expect.any(Date));
    expect(getOrder().costBreakdown.real.costoPorKg).toBe('3100.0000');
  });

  // --- BULTOS (pedido del dueño, jul 2026): se cargan junto a los kg, acumulan y restan.
  // Regla que no se negocia: los bultos NO tocan la calculadora de costo (CLAUDE.md §5).

  it('sella los bultos en el lote de producto y en su movimiento de entrada', async () => {
    const { service, savedBatches, savedMovements, getOrder } = makeService();

    // El caso real del audio: 1392,7 kg de masa en 98 bultos (bolsas).
    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 1392.7, bultos: 98, isPrincipal: true }],
    } as any);

    const producto = savedBatches.find((b) => b.code?.startsWith('LM-PP'));
    expect(producto.initialQuantity).toBe('1392.7');
    expect(producto.initialBultos).toBe(98);
    expect(producto.remainingBultos).toBe(98);

    const entrada = savedMovements.find((m) => m.type === 'in' && m.reason === 'production');
    expect(entrada.bultos).toBe(98);

    // Y quedan guardados en la orden, para verlos después en la pantalla.
    expect(getOrder().actualOutputs[0].bultos).toBe(98);
  });

  it('los bultos NO cambian el costo: con y sin bultos el costo/kg es idéntico', async () => {
    const sinBultos = makeService();
    await sinBultos.service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    const conBultos = makeService();
    await conBultos.service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, bultos: 7, isPrincipal: true }],
    } as any);

    expect(conBultos.getOrder().costBreakdown.real.costoPorKg).toBe(
      sinBultos.getOrder().costBreakdown.real.costoPorKg,
    );
    expect(conBultos.getOrder().costBreakdown.real.costoNeto).toBe(
      sinBultos.getOrder().costBreakdown.real.costoNeto,
    );
  });

  it('cerrar sin cargar bultos deja el lote sin bultos y no rompe nada', async () => {
    const { service, savedBatches, savedMovements } = makeService();

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    const producto = savedBatches.find((b) => b.code?.startsWith('LM-PP'));
    expect(producto.initialBultos).toBeNull();
    expect(producto.remainingBultos).toBeNull();
    const entrada = savedMovements.find((m) => m.type === 'in' && m.reason === 'production');
    expect(entrada.bultos).toBeNull();
  });

  it('consumir masa embolsada descuenta también sus bultos (RETROCOMPAT: descuento al cerrar)', async () => {
    // Lote de masa con 40 bultos para 1000 kg; la orden se lleva los 1000 kg → los 40 bultos.
    const { service, milkBatch, savedBatches, savedMovements } = makeService({ milkAlreadyReserved: false });
    milkBatch.remainingBultos = 40;

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true }],
    } as any);

    const consumido = savedBatches.find((b) => b.id === 'milk-1');
    expect(consumido.remainingBultos).toBe(0);
    const salida = savedMovements.find((m) => m.type === 'out' && m.reason === 'production');
    expect(salida.bultos).toBe(40);
  });

  // PEDIDO DEL DUEÑO (audio 27/10/2026): de una misma tachada salen planchas Y cilindros.
  // Los dos son producto (no subproducto): el costo se divide por los kg TOTALES y cada
  // formato se lleva su lote con el MISMO costo/kg. A mano: $10.500 ÷ (100 + 40) kg = $75/kg.
  describe('otros formatos de la misma elaboración', () => {
    const products = {
      'prod-mozza': { id: 'prod-mozza', name: 'Mozzarella plancha', category: 'queso', defaultCost: null },
      'prod-cil': { id: 'prod-cil', name: 'Mozzarella cilindro', category: 'queso', defaultCost: null },
      'prod-ricota': { id: 'prod-ricota', name: 'Ricota', category: 'subproducto', defaultCost: null },
    };

    it('reparte el costo por los kg totales y los dos lotes heredan el mismo costo/kg', async () => {
      const { service, savedBatches, getOrder } = makeService({ products });
      await service.close('order-1', {
        actualOutputs: [
          { productId: PRINCIPAL_PRODUCT_ID, quantity: 100, bultos: 10, isPrincipal: true },
          { productId: 'prod-cil', quantity: 40, bultos: 8, isPrincipal: false, isFormat: true },
        ],
      } as any);
      const order = getOrder();
      expect(order.unitCost).toBe('75.0000');
      expect(order.totalPrincipalKg).toBe('140');
      expect(order.costBreakdown.real.rendimiento).toBe('0.1400');
      const plancha = savedBatches.find((b) => b.productId === PRINCIPAL_PRODUCT_ID);
      const cilindro = savedBatches.find((b) => b.productId === 'prod-cil');
      expect(plancha.unitCost).toBe('75.0000');
      expect(cilindro.unitCost).toBe('75.0000');
      expect(cilindro.code).toBe('LM-PP-20260530-0001-F1');
      expect(cilindro.initialQuantity).toBe('40');
      expect(cilindro.remainingBultos).toBe(8);
      // Queda en la orden como salida con su lote, marcada como formato.
      const salida = order.actualOutputs.find((o: any) => o.productId === 'prod-cil');
      expect(salida.isFormat).toBe(true);
      expect(salida.productName).toBe('Mozzarella cilindro');
      expect(salida.batchCode).toBe('LM-PP-20260530-0001-F1');
    });

    it('los insumos "por kg de producto" se consumen sobre los kg totales', async () => {
      const { service, savedMovements } = makeService({
        products,
        ingredients: [{ productId: 'ins-sal', productName: 'Sal', quantity: 0.01, unitCost: 100, basis: 'per_kg_product' }],
        insumoLots: [{ id: 'sal-1', productId: 'ins-sal', remainingQuantity: '50', status: 'activo', unit: 'kg' }],
      });
      await service.close('order-1', {
        actualOutputs: [
          { productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true },
          { productId: 'prod-cil', quantity: 40, isPrincipal: false, isFormat: true },
        ],
      } as any);
      const sal = savedMovements.find((m) => m.productId === 'ins-sal' && m.reason === 'consumption');
      expect(Number(sal.quantity)).toBeCloseTo(1.4, 6); // 0,01 × 140 kg
    });

    it('un formato en 0 kg no genera lote ni queda en la orden', async () => {
      const { service, savedBatches, getOrder } = makeService({ products });
      await service.close('order-1', {
        actualOutputs: [
          { productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true },
          { productId: 'prod-cil', quantity: 0, isPrincipal: false, isFormat: true },
        ],
      } as any);
      expect(savedBatches.find((b) => b.productId === 'prod-cil')).toBeUndefined();
      expect(getOrder().unitCost).toBe('105.0000');
      expect(getOrder().actualOutputs.some((o: any) => o.productId === 'prod-cil')).toBe(false);
    });

    it('rechaza un formato de otra categoría y el mismo producto principal repetido', async () => {
      const { service } = makeService({ products });
      await expect(
        service.close('order-1', {
          actualOutputs: [
            { productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true },
            { productId: 'prod-ricota', quantity: 10, isPrincipal: false, isFormat: true },
          ],
        } as any),
      ).rejects.toThrow(/misma categoría/);
      await expect(
        service.close('order-1', {
          actualOutputs: [
            { productId: PRINCIPAL_PRODUCT_ID, quantity: 100, isPrincipal: true },
            { productId: PRINCIPAL_PRODUCT_ID, quantity: 10, isPrincipal: false, isFormat: true },
          ],
        } as any),
      ).rejects.toThrow(/ya es el producto principal/);
    });
  });
});

// Pedido del dueño (audio 28/10/2026): ricota del suero de la prensa. La orden no tiene lote de
// origen (0 litros): el costo del lote es SOLO la suma de los insumos de la receta. Verificable
// a mano: 200 kg de ricota; sal "por kg" 0,02 kg × $500 × 200 = $2.000; bolsa "por kg" 1 × $50
// × 200 = $10.000; mano de obra "fijo" $30.000; fermento "por litro" $0,5 × 0 L = $0.
// Total $42.000 → $210,0000/kg. El rendimiento (kg/litro) no existe: aviso LITROS_CERO.
describe('ProductionService.close — orden sin lote de origen (ricota del suero)', () => {
  const ingredients = [
    { productName: 'Sal', quantity: 0.02, unitCost: 500, basis: 'per_kg_product' },
    { productName: 'Bolsa', quantity: 1, unitCost: 50, basis: 'per_kg_product' },
    { productName: 'Mano de obra', quantity: 1, unitCost: 30000, basis: 'fixed_per_order' },
    { productName: 'Fermento', quantity: 1, unitCost: 0.5, basis: 'per_liter_milk' },
  ];

  it('costo = insumos, sin dividir por litros, con aviso LITROS_CERO y lote sin padre', async () => {
    const { service, savedBatches, savedMovements, getOrder } = makeService({
      sinLote: true,
      baseYieldKgPerLiter: null,
      ingredients,
    });

    await service.close('order-1', {
      actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 200, isPrincipal: true }],
    } as any);

    const order = getOrder();
    expect(order.status).toBe('closed');
    expect(order.costBreakdown.real.costoInsumos).toBe('42000.00');
    expect(order.costBreakdown.real.costoNeto).toBe('42000.00');
    expect(order.costBreakdown.real.costoPorKg).toBe('210.0000');
    expect(order.costBreakdown.real.rendimiento).toBeNull();
    expect(order.costBreakdown.real.warnings).toContain('LITROS_CERO');
    expect(order.totalCost).toBe('42000.00');
    expect(order.unitCost).toBe('210.0000');
    // Sin estándar: no hay rendimiento esperado posible con 0 litros.
    expect(order.costBreakdown.estandar).toBeNull();

    // Lote de ricota creado con su costo y SIN lote padre (no sale de ningún stock).
    const lote = savedBatches.find((b) => b.productId === PRINCIPAL_PRODUCT_ID);
    expect(lote.unitCost).toBe('210.0000');
    expect(lote.parentBatchId).toBeNull();
    // Ningún movimiento de salida de leche/masa: solo la entrada del producto.
    expect(savedMovements.filter((m) => m.type === 'out')).toHaveLength(0);
    expect(savedMovements.filter((m) => m.type === 'in')).toHaveLength(1);
  });
});

// Crema desnatada al hacer masa (audio del dueño 28/10/2026): el subproducto va a su propio
// lote de stock (CLNP) y ese lote nace con el valor de recupero como costo, para que al
// pasteurizarla después entre con el MISMO $/kg que abarató la masa (costeo encadenado).
// A mano: leche 1.000 L × $10 = $10.000; fermento $0,5 × 1.000 L = $500; bruto $10.500;
// crema 6 kg × $5 = $30 de recupero → neto $10.470 → $95,1818/kg sobre 110 kg.
describe('ProductionService.close — subproducto con producto destino (crema de la masa)', () => {
  const crema = {
    name: 'CREMA CRUDA',
    unit: 'kg',
    basis: 'per_liter_milk',
    expectedYield: 0.005,
    destination: 'product',
    destinationProductId: 'prod-crema',
    referenceValuePerUnit: 5,
  };

  it('genera el lote LM-SP con costo = valor de recupero y descuenta ese valor del principal', async () => {
    const { service, savedBatches, getOrder } = makeService({
      byproducts: [crema],
      products: { 'prod-crema': { id: 'prod-crema', category: 'subproducto', unit: 'kg', defaultCost: '4165' } },
    });

    await service.close('order-1', {
      actualOutputs: [
        { productId: PRINCIPAL_PRODUCT_ID, quantity: 110, isPrincipal: true },
        { productId: 'prod-crema', quantity: 6, isPrincipal: false },
      ],
    } as any);

    const order = getOrder();
    expect(order.costBreakdown.real.valorSubproductos).toBe('30.00');
    expect(order.costBreakdown.real.costoNeto).toBe('10470.00');
    expect(order.costBreakdown.real.costoPorKg).toBe('95.1818');

    const lote = savedBatches.find((b) => b.productId === 'prod-crema');
    expect(lote.code).toMatch(/^LM-SP-/);
    expect(lote.initialQuantity).toBe('6');
    // Costo propio = recupero ($5), NO el precio de la ficha ($4.165): es lo que se le descontó a la masa.
    expect(lote.unitCost).toBe('5');
    expect(lote.parentBatchId).toBe('prod-batch-1');
  });

  it('sin valor de recupero cargado, el lote queda sin costo propio (lo resuelve la ficha al usarlo)', async () => {
    const { service, savedBatches } = makeService({
      byproducts: [{ ...crema, referenceValuePerUnit: undefined }],
      products: { 'prod-crema': { id: 'prod-crema', category: 'subproducto', unit: 'kg', defaultCost: '4165' } },
    });
    await service.close('order-1', {
      actualOutputs: [
        { productId: PRINCIPAL_PRODUCT_ID, quantity: 110, isPrincipal: true },
        { productId: 'prod-crema', quantity: 6, isPrincipal: false },
      ],
    } as any);
    const lote = savedBatches.find((b) => b.productId === 'prod-crema');
    expect(lote.unitCost).toBeNull();
  });
});

// "Guardar lo de hoy" ya creó el lote de crema (entró al stock el mismo día, pedido del dueño
// 04/11/2026). El cierre tiene que REUSAR ese lote: ajustarlo a la cantidad final, recolgarlo
// del lote de producto y NO crear un duplicado. Y la calculadora da exactamente lo mismo que
// si el lote lo creara el cierre: crema 6 kg × $5 = $30 de recupero → neto $10.470.
describe('ProductionService.close — reusa el lote creado por "guardar lo de hoy"', () => {
  const crema = {
    name: 'CREMA CRUDA',
    unit: 'kg',
    basis: 'per_liter_milk',
    expectedYield: 0.005,
    destination: 'product',
    destinationProductId: 'prod-crema',
    referenceValuePerUnit: 5,
  };
  const products = { 'prod-crema': { id: 'prod-crema', category: 'subproducto', unit: 'kg', defaultCost: '4165' } };

  function previoDeCrema(over: Partial<any> = {}) {
    const batch = {
      id: 'sp-1',
      code: 'LM-SP-20260530-0001-1',
      productId: 'prod-crema',
      initialQuantity: '5',
      remainingQuantity: '5',
      initialBultos: null,
      remainingBultos: null,
      unit: 'kg',
      status: 'activo',
      unitCost: '5',
      ...over,
    };
    const mov = { id: 'mov-sp-1', batchId: 'sp-1', productId: 'prod-crema', type: 'in', quantity: '5', bultos: null };
    return { batch, mov };
  }

  it('ajusta el lote existente a la cantidad final, lo recuelga del producto y no crea otro', async () => {
    const p = previoDeCrema();
    const { service, savedBatches, savedMovements, getOrder } = makeService({
      byproducts: [crema],
      products,
      previos: [p],
    });

    await service.close('order-1', {
      actualOutputs: [
        { productId: PRINCIPAL_PRODUCT_ID, quantity: 110, isPrincipal: true },
        { productId: 'prod-crema', quantity: 6, isPrincipal: false },
      ],
    } as any);

    // Un solo lote de crema: el MISMO sp-1, ajustado de 5 a 6 kg y colgado del lote de masa.
    const lotesDeCrema = savedBatches.filter((b) => b.productId === 'prod-crema');
    expect(lotesDeCrema).toHaveLength(1);
    expect(lotesDeCrema[0].id).toBe('sp-1');
    expect(lotesDeCrema[0].initialQuantity).toBe('6');
    expect(lotesDeCrema[0].remainingQuantity).toBe('6');
    expect(lotesDeCrema[0].parentBatchId).toBe('prod-batch-1');
    // Su movimiento de entrada queda en la cantidad final.
    const entradaCrema = savedMovements.find((m) => m.id === 'mov-sp-1');
    expect(entradaCrema.quantity).toBe('6');

    // La calculadora da lo mismo que si el lote lo creara el cierre (verificable a mano):
    // leche $10.000 + fermento $500 − crema 6×$5 = $10.470 → $95,1818/kg sobre 110 kg.
    const order = getOrder();
    expect(order.costBreakdown.real.valorSubproductos).toBe('30.00');
    expect(order.costBreakdown.real.costoNeto).toBe('10470.00');
    expect(order.costBreakdown.real.costoPorKg).toBe('95.1818');
    // Y la salida de la orden apunta al lote reusado.
    const salida = order.actualOutputs.find((o: any) => o.productId === 'prod-crema');
    expect(salida.batchCode).toBe('LM-SP-20260530-0001-1');
  });

  it('si la crema ya se usó en parte, el cierre respeta lo consumido (y rechaza quedarse corto)', async () => {
    // De 5 kg guardados ya se pasteurizaron 3 (quedan 2). Cerrar con 6 → quedan 6 − 3 = 3.
    const p = previoDeCrema({ remainingQuantity: '2' });
    const { service, savedBatches } = makeService({ byproducts: [crema], products, previos: [p] });

    await service.close('order-1', {
      actualOutputs: [
        { productId: PRINCIPAL_PRODUCT_ID, quantity: 110, isPrincipal: true },
        { productId: 'prod-crema', quantity: 6, isPrincipal: false },
      ],
    } as any);
    const lote = savedBatches.find((b) => b.productId === 'prod-crema');
    expect(lote.remainingQuantity).toBe('3');

    // Cerrar con MENOS de lo ya consumido se rechaza con aviso claro.
    const p2 = previoDeCrema({ remainingQuantity: '2' });
    const otra = makeService({ byproducts: [crema], products, previos: [p2] });
    await expect(
      otra.service.close('order-1', {
        actualOutputs: [
          { productId: PRINCIPAL_PRODUCT_ID, quantity: 110, isPrincipal: true },
          { productId: 'prod-crema', quantity: 2, isPrincipal: false },
        ],
      } as any),
    ).rejects.toThrow(/ya se usaron 3/);
  });

  it('cerrar con la crema en 0 borra el lote guardado (si está intacto); si ya se usó, se frena', async () => {
    const p = previoDeCrema();
    const { service, removedBatches, removedMovements } = makeService({ byproducts: [crema], products, previos: [p] });

    await service.close('order-1', {
      actualOutputs: [
        { productId: PRINCIPAL_PRODUCT_ID, quantity: 110, isPrincipal: true },
        { productId: 'prod-crema', quantity: 0, isPrincipal: false },
      ],
    } as any);
    expect(removedBatches.map((b) => b.id)).toEqual(['sp-1']);
    expect(removedMovements.map((m) => m.id)).toEqual(['mov-sp-1']);

    const p2 = previoDeCrema({ remainingQuantity: '2' });
    const otra = makeService({ byproducts: [crema], products, previos: [p2] });
    await expect(
      otra.service.close('order-1', {
        actualOutputs: [
          { productId: PRINCIPAL_PRODUCT_ID, quantity: 110, isPrincipal: true },
          { productId: 'prod-crema', quantity: 0, isPrincipal: false },
        ],
      } as any),
    ).rejects.toThrow(/Cargaste 0/);
  });

  describe('envases enteros (pedido 12/11/2026)', () => {
    const baldes = { productName: 'BALDES', productId: 'ins-balde', quantity: 0.1, unit: 'unidad', unitCost: 1000, basis: 'per_kg_product' };
    const loteBaldes = () => ({ id: 'balde-1', productId: 'ins-balde', remainingQuantity: '140', status: 'activo', unit: 'unidad' });

    it('168 kg × 0,1 → descuenta 17 baldes del stock, lo mismo que se costea', async () => {
      const lote = loteBaldes();
      const { service, getOrder } = makeService({ ingredients: [baldes], insumoLots: [lote] });
      await service.close('order-1', {
        actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 168, isPrincipal: true }],
      } as any);
      expect(lote.remainingQuantity).toBe('123');
      expect(getOrder().costBreakdown.real.detalleInsumos[0]).toMatchObject({ cantidad: '17', subtotal: '17000.00' });
      expect(getOrder().costBreakdown.insumosFaltantes).toBeUndefined();
    });

    it('envases corregidos al cerrar: 16 baldes (uno se reusó) → stock y costo con 16, y se guardan', async () => {
      const lote = loteBaldes();
      const { service, getOrder } = makeService({ ingredients: [baldes], insumoLots: [lote] });
      await service.close('order-1', {
        actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 168, isPrincipal: true }],
        envases: [{ productId: 'ins-balde', quantity: 16 }],
      } as any);
      expect(lote.remainingQuantity).toBe('124');
      expect(getOrder().costBreakdown.real.detalleInsumos[0].cantidad).toBe('16');
      expect(getOrder().costBreakdown.envases).toEqual({ 'ins-balde': 16 });
    });

    it('si no alcanza el stock descuenta lo que hay y avisa cuánto faltó', async () => {
      const lote = { ...loteBaldes(), remainingQuantity: '10' };
      const { service, getOrder } = makeService({ ingredients: [baldes], insumoLots: [lote] });
      await service.close('order-1', {
        actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 168, isPrincipal: true }],
      } as any);
      expect(lote.remainingQuantity).toBe('0');
      expect(lote.status).toBe('agotado');
      expect(getOrder().costBreakdown.insumosFaltantes).toEqual([{ name: 'BALDES', faltan: '7' }]);
    });

    it('"por bulto": usa los bultos del principal + formatos', async () => {
      const bolsa = { ...baldes, productName: 'BOLSA', quantity: 1, basis: 'per_bulto' };
      const lote = loteBaldes();
      const { service, getOrder } = makeService({ ingredients: [bolsa], insumoLots: [lote] });
      await service.close('order-1', {
        actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 701, bultos: 44, isPrincipal: true }],
      } as any);
      expect(getOrder().costBreakdown.real.detalleInsumos[0].cantidad).toBe('44');
      expect(lote.remainingQuantity).toBe('96');
    });

    it('"por bulto" sin bultos cargados: no deja cerrar (no se sabe cuántos envases se usaron)', async () => {
      const bolsa = { ...baldes, productName: 'BOLSA', quantity: 1, basis: 'per_bulto' };
      const { service } = makeService({ ingredients: [bolsa], insumoLots: [loteBaldes()] });
      await expect(
        service.close('order-1', { actualOutputs: [{ productId: PRINCIPAL_PRODUCT_ID, quantity: 701, isPrincipal: true }] } as any),
      ).rejects.toThrow(/Cargá los bultos: la receta usa BOLSA por bulto/);
    });
  });
});
