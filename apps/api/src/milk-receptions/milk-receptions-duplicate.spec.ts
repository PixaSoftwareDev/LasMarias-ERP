import { MilkReceptionsService } from './milk-receptions.service';

// Tests del aviso de DOBLE CARGA en la recepción de leche: mismo tambo, mismo día y mismos
// litros → frena y pide confirmar (puede ser otra descarga real). Con confirmDuplicate=true
// se salta el chequeo.
//
// IMPORTANTE (jul 2026): el chequeo corre DENTRO de la transacción y detrás de un candado
// por firma. Antes corría afuera, y por eso dos cargas simultáneas no se veían entre sí y
// entraban las dos (probado contra la base: +1.000 L de leche que nunca entró). El centinela
// marca el punto en que el chequeo ya lo dejó pasar y sigue el alta real.

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
  // La transacción SÍ corre (el chequeo vive adentro). El manager simulado responde el
  // candado y la búsqueda de duplicados; si el chequeo deja pasar, cortamos con el centinela.
  const manager = {
    query: jest.fn().mockResolvedValue([]), // candados: sin base real, no hacen nada
    getRepository: jest.fn(() => ({
      find: jest.fn().mockResolvedValue(sameDayReceptions),
      // Lo primero que hace el alta real después del chequeo es numerar el lote: si el
      // flujo llega acá, es que el chequeo de duplicado lo dejó pasar.
      createQueryBuilder: jest.fn(() => {
        throw new Error(TX_SENTINEL);
      }),
    })),
  };
  const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };

  const service = new MilkReceptionsService(
    receptionRepo as any,
    producers as any,
    settings as any,
    exchangeRates as any,
    dataSource as any,
  );
  return { service, manager };
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

  it('el chequeo corre DENTRO de la transacción, detrás del candado por firma', async () => {
    // Si volviera a correr afuera, dos cargas simultáneas no se verían y entrarían las dos.
    const { service, manager } = makeService([reception('5000')]);

    await expect(service.create(input() as any, 'user-1')).rejects.toThrow(/Ya cargaste una recepción/);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(1, hashtext($1))',
      ['recepcion:tambo-1:5000'],
    );
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
