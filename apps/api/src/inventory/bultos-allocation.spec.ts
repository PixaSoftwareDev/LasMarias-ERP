import { allocateBultos } from './bultos-allocation';

// Regla de oro de todos estos casos: la suma de bultos repartidos tiene que dar EXACTA.
// Un bulto no se pierde ni se inventa por un redondeo.

describe('allocateBultos', () => {
  it('reparte proporcional a los kg cuando la división es exacta', () => {
    const r = allocateBultos(10, [
      { quantity: 500, available: 50 },
      { quantity: 500, available: 50 },
    ]);
    expect(r.bultos).toEqual([5, 5]);
    expect(r.unassigned).toBe(0);
  });

  it('con kg desparejos reparte por restos mayores y la suma cierra', () => {
    // 700 kg entre 3 lotes: 300 / 250 / 150 → 10 bultos = 4,28 / 3,57 / 2,14
    const r = allocateBultos(10, [
      { quantity: 300, available: 99 },
      { quantity: 250, available: 99 },
      { quantity: 150, available: 99 },
    ]);
    expect(r.bultos.reduce((a, b) => a + b, 0)).toBe(10);
    // parte entera 4/3/2 = 9; el bulto que sobra va a la fracción más grande (0,57 del 2º)
    expect(r.bultos).toEqual([4, 4, 2]);
    expect(r.unassigned).toBe(0);
  });

  it('el caso del audio: 1392,7 kg / 98 bultos salen de un solo lote', () => {
    const r = allocateBultos(98, [{ quantity: 1392.7, available: 98 }]);
    expect(r.bultos).toEqual([98]);
    expect(r.unassigned).toBe(0);
  });

  it('nunca saca de un lote más bultos de los que tiene: el sobrante pasa al otro', () => {
    // Por kg le tocarían 5 al primero, pero solo tiene 2 → los otros 3 van al segundo.
    const r = allocateBultos(10, [
      { quantity: 500, available: 2 },
      { quantity: 500, available: 50 },
    ]);
    expect(r.bultos).toEqual([2, 8]);
    expect(r.bultos.reduce((a, b) => a + b, 0)).toBe(10);
    expect(r.unassigned).toBe(0);
  });

  it('si entre todos los lotes no alcanzan los bultos, lo informa en vez de inventarlos', () => {
    const r = allocateBultos(10, [
      { quantity: 500, available: 2 },
      { quantity: 500, available: 3 },
    ]);
    expect(r.bultos).toEqual([2, 3]);
    expect(r.unassigned).toBe(5);
  });

  it('lote sin bultos contados (null) no tiene tope y no rompe', () => {
    const r = allocateBultos(7, [{ quantity: 100, available: null }]);
    expect(r.bultos).toEqual([7]);
    expect(r.unassigned).toBe(0);
  });

  it('sin bultos o sin lotes devuelve cero sin romper', () => {
    expect(allocateBultos(0, [{ quantity: 100, available: 5 }])).toEqual({ bultos: [0], unassigned: 0 });
    expect(allocateBultos(5, [])).toEqual({ bultos: [], unassigned: 5 });
  });
});
