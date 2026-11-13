import { devolviblePorLote, pendientePorRenglon, planReposicion } from './returns';

// Caso real DSP-000166 (12/11/2026, CANIDA SA): dos renglones de masa, uno por lote.
//   renglón 0: 328 kg / 20 bultos del lote del 9/11 (A)
//   renglón 1: 373 kg / 24 bultos del lote del 10/11 (B)
// Antes, la devolución tomaba siempre el PRIMER renglón del producto y no sabía cuánto había
// vuelto ya a cada lote.
const masa = (quantity: number, batchId?: string) =>
  ({ productId: 'masa', productName: 'MASA', sku: 'MASA', quantity, unitPrice: 7000, unit: 'kg', subtotal: 0, batchId }) as any;
const lineas = [masa(328, 'A'), masa(373, 'B')];

describe('pendientePorRenglon', () => {
  it('sin devoluciones, queda todo lo vendido de cada renglón', () => {
    expect(pendientePorRenglon(lineas, []).map(Number)).toEqual([328, 373]);
  });

  it('lo devuelto con renglón se descuenta de ESE renglón', () => {
    const p = pendientePorRenglon(lineas, [{ productId: 'masa', quantity: 300, lineIndex: 1 }]);
    expect(p.map(Number)).toEqual([328, 73]);
  });

  it('nota vieja sin renglón: se descuenta en orden y pasa al siguiente si no entra', () => {
    const p = pendientePorRenglon(lineas, [{ productId: 'masa', quantity: 400 }]);
    expect(p.map(Number)).toEqual([0, 301]);
  });

  it('cuenta exacta en decimales (0,3 − 0,1 − 0,1 = 0,1)', () => {
    const p = pendientePorRenglon([masa(0.3)], [
      { productId: 'masa', quantity: 0.1, lineIndex: 0 },
      { productId: 'masa', quantity: 0.1, lineIndex: 0 },
    ]);
    expect(p[0]!.toString()).toBe('0.1');
  });
});

describe('devolviblePorLote', () => {
  it('lo que salió menos lo que ya volvió, en kg y bultos', () => {
    const d = devolviblePorLote([
      { batchId: 'A', quantity: '328', bultos: 20, type: 'out' },
      { batchId: 'B', quantity: '373', bultos: 24, type: 'out' },
      { batchId: 'A', quantity: '300', bultos: 18, type: 'in' },
    ]);
    expect(d).toEqual([
      { batchId: 'A', quantity: 28, bultos: 2 },
      { batchId: 'B', quantity: 373, bultos: 24 },
    ]);
  });

  it('un lote que ya volvió entero no aparece', () => {
    const d = devolviblePorLote([
      { batchId: 'A', quantity: '10', bultos: null, type: 'out' },
      { batchId: 'A', quantity: '10', bultos: null, type: 'in' },
    ]);
    expect(d).toEqual([]);
  });
});

describe('planReposicion', () => {
  const cupos = [
    { batchId: 'A', quantity: 328, bultos: 20 },
    { batchId: 'B', quantity: 373, bultos: 24 },
  ];

  it('vuelve primero al lote del renglón (300 kg del renglón de B van a B)', () => {
    const plan = planReposicion(300, cupos, ['B']);
    expect(plan.allocations).toEqual([{ batchId: 'B', take: 300, remainingAfter: 73 }]);
    expect(plan.shortage).toBe(0);
  });

  it('ningún lote recibe más de lo que entregó: la segunda devolución sigue con el otro', () => {
    // Antes: devolver 300 y después 300 reponía 600 al lote A, que solo había entregado 328.
    const plan = planReposicion(300, [{ batchId: 'A', quantity: 28, bultos: 2 }, cupos[1]!], []);
    expect(plan.allocations.map((a) => [a.batchId, a.take])).toEqual([
      ['A', 28],
      ['B', 272],
    ]);
  });

  it('más de lo que salió → faltante (el servicio lo rechaza)', () => {
    expect(planReposicion(702, cupos, []).shortage).toBe(1);
  });
});
