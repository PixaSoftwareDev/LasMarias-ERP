import { codigoLoteTraspaso, planSiloTransfer, type LoteDeSilo } from './silo-transfer';

// Pasar leche de un silo a otro (pedido del dueño, 16/11/2026). Cuentas verificables a mano.
const lote = (id: string, inicial: string, saldo: string, status = 'activo'): LoteDeSilo => ({
  id,
  initialQuantity: inicial,
  remainingQuantity: saldo,
  status,
});

describe('planSiloTransfer', () => {
  it('lote entero y sin usar: cambia de silo (no se parte)', () => {
    expect(planSiloTransfer([lote('a', '8000', '8000')], 8000)).toEqual({
      ok: true,
      pasos: [{ batchId: 'a', litros: '8000', modo: 'mover' }],
    });
  });

  it('parte de un lote: se parte', () => {
    expect(planSiloTransfer([lote('a', '8000', '8000')], 3000)).toEqual({
      ok: true,
      pasos: [{ batchId: 'a', litros: '3000', modo: 'partir' }],
    });
  });

  it('lo que sobró de un lote ya usado: se parte (el origen se queda con lo usado)', () => {
    // 30.000 L recibidos, 21.500 elaborados → quedan 8.500 y se pasan todos.
    expect(planSiloTransfer([lote('a', '30000', '8500')], 8500)).toEqual({
      ok: true,
      pasos: [{ batchId: 'a', litros: '8500', modo: 'partir' }],
    });
  });

  it('toma primero el más viejo y completa con el siguiente', () => {
    // 2.000 (viejo) + 5.000 → pasar 4.000 = 2.000 enteros + 2.000 partidos.
    expect(planSiloTransfer([lote('viejo', '2000', '2000'), lote('nuevo', '5000', '5000')], 4000)).toEqual({
      ok: true,
      pasos: [
        { batchId: 'viejo', litros: '2000', modo: 'mover' },
        { batchId: 'nuevo', litros: '2000', modo: 'partir' },
      ],
    });
  });

  it('lote reservado por una orden abierta: se parte aunque se pase todo el saldo', () => {
    const plan = planSiloTransfer([lote('a', '5000', '5000', 'en_proceso')], 5000);
    expect(plan).toEqual({ ok: true, pasos: [{ batchId: 'a', litros: '5000', modo: 'partir' }] });
  });

  it('decimales exactos: 1.234,567 + 0,433 = 1.235', () => {
    const plan = planSiloTransfer([lote('a', '1234.567', '1234.567'), lote('b', '100', '100')], 1235);
    expect(plan).toEqual({
      ok: true,
      pasos: [
        { batchId: 'a', litros: '1234.567', modo: 'mover' },
        { batchId: 'b', litros: '0.433', modo: 'partir' },
      ],
    });
  });

  it('más litros de los que hay: no planea nada y dice cuántos hay', () => {
    expect(planSiloTransfer([lote('a', '3000', '1200'), lote('b', '500', '500')], 2000)).toEqual({
      ok: false,
      disponibles: '1700',
    });
  });

  it('ignora lotes sin saldo', () => {
    expect(planSiloTransfer([lote('vacio', '1000', '0'), lote('b', '500', '500')], 500)).toEqual({
      ok: true,
      pasos: [{ batchId: 'b', litros: '500', modo: 'mover' }],
    });
  });
});

describe('codigoLoteTraspaso', () => {
  const nada = () => false;

  it('recepción de un solo lote: …-0003 → …-0003-2', () => {
    expect(codigoLoteTraspaso('LM-LC-20261114-0003', { code: 'LM-LC-20261114-0003', lotCodes: ['LM-LC-20261114-0003'] }, nada)).toBe(
      'LM-LC-20261114-0003-2',
    );
  });

  it('recepción repartida en 2 silos: sigue con -3', () => {
    const r = { code: 'LM-LC-20261114-0003', lotCodes: ['LM-LC-20261114-0003-1', 'LM-LC-20261114-0003-2'] };
    expect(codigoLoteTraspaso('LM-LC-20261114-0003-1', r, nada)).toBe('LM-LC-20261114-0003-3');
  });

  it('nunca repite un código existente', () => {
    const r = { code: 'R', lotCodes: ['R'] };
    expect(codigoLoteTraspaso('R', r, (c) => c === 'R-2')).toBe('R-3');
  });

  it('leche sin recepción (cargada a mano): sufijo P1, P2…', () => {
    expect(codigoLoteTraspaso('LM-AJ-1', null, (c) => c === 'LM-AJ-1-P1')).toBe('LM-AJ-1-P2');
  });
});
