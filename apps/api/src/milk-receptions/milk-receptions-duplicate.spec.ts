import { MilkReceptionsService } from './milk-receptions.service';

// Tests del aviso de DOBLE CARGA en la recepción de leche: mismo tambo, mismo día y mismos
// litros → frena y pide confirmar (puede ser otra descarga real). Con confirmDuplicate=true
// se salta el chequeo. Para aislar la lógica del chequeo (que corre ANTES de la transacción),
// la transacción rechaza con un centinela: si el flujo llega ahí, el chequeo lo dejó pasar.

jest.mock('../batches/batch.entity', () => ({ BatchEntity: { name: 'BatchEntity' } }));
jest.mock('../inventory/inventory-movement.entity', () => ({
  InventoryMovementEntity: { name: 'InventoryMovementEntity' },
}));
jest.mock('./milk-reception.entity', () => ({
  MilkReceptionEntity: { name: 'MilkReceptionEntity' },
}));

const TX_SENTINEL = 'TX_REACHED';

function makeService(sameDayReceptions: any[]) {
  const receptionRepo = {
    // Recepciones del mismo tambo y día (la query real filtra por producerId + Between del día).
    find: jest.fn().mockResolvedValue(sameDayReceptions),
  };
  const producers = {
    get: jest.fn().mockResolvedValue({ id: 'tambo-1', name: 'La Vaquita', agreedPricePerLiter: null }),
  };
  const settings = {
    getQualityLimits: jest.fn().mockResolvedValue({}),
    getIvaRate: jest.fn().mockResolvedValue(21),
  };
  const exchangeRates = { toArs: jest.fn() };
  // Si el flujo pasa el chequeo de duplicado, entra a la transacción → rechazamos con centinela.
  const dataSource = { transaction: jest.fn(() => Promise.reject(new Error(TX_SENTINEL))) };

  const service = new MilkReceptionsService(
    receptionRepo as any,
    producers as any,
    settings as any,
    exchangeRates as any,
    dataSource as any,
  );
  return { service };
}

function input(overrides: any = {}) {
  return {
    receivedAt: '2026-07-04T10:00:00Z',
    producers: [{ producerId: 'tambo-1', liters: 5000 }],
    quality: {},
    ...overrides,
  };
}

function reception(liters: string) {
  return { id: 'rec-old', code: 'LM-LC-20260704-0001', producerId: 'tambo-1', liters };
}

describe('MilkReceptionsService.create — aviso de doble carga', () => {
  it('frena si ya hay una recepción del mismo tambo, día y litros', async () => {
    const { service } = makeService([reception('5000')]);

    await expect(service.create(input() as any, 'user-1')).rejects.toThrow(/Ya cargaste una recepción/);
  });

  it('confirmDuplicate=true: se salta el aviso (llega a la transacción)', async () => {
    const { service } = makeService([reception('5000')]);

    await expect(
      service.create(input({ confirmDuplicate: true }) as any, 'user-1'),
    ).rejects.toThrow(TX_SENTINEL);
  });

  it('litros distintos el mismo día: NO frena (no es la misma descarga)', async () => {
    const { service } = makeService([reception('4200')]);

    await expect(service.create(input() as any, 'user-1')).rejects.toThrow(TX_SENTINEL);
  });

  it('sin recepciones previas ese día: NO frena', async () => {
    const { service } = makeService([]);

    await expect(service.create(input() as any, 'user-1')).rejects.toThrow(TX_SENTINEL);
  });
});
