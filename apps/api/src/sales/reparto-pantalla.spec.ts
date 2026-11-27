import {
  filaSugerida,
  juntarRenglones,
  repartoInicial,
  resumenReparto,
} from '@lasmarias/shared-schemas';

// Ayuda de la pantalla de venta para repartir un renglón entre lotes (shared-schemas).
// Caso real DSP-000166: 701 kg / 44 bultos de masa = 328 kg / 20 b del 9/11 + 373 kg / 24 b del 10/11.
const lotes = [
  { batchId: 'l09', batchCode: 'LM-PP-20261109-0001', remaining: 409.2, bultos: 25 },
  { batchId: 'l10', batchCode: 'LM-PP-20261110-0001', remaining: 635.4, bultos: 42 },
];

describe('resumenReparto', () => {
  it('reparto completo: sin errores', () => {
    const r = resumenReparto(
      701,
      44,
      [
        { batchId: 'l09', quantity: 328, bultos: 20 },
        { batchId: 'l10', quantity: 373, bultos: 24 },
      ],
      lotes,
      'kg',
    );
    expect(r).toEqual({ kg: 701, faltanKg: 0, bultos: 44, errores: [], avisos: [] });
  });

  it('a medio cargar: dice cuánto falta', () => {
    const r = resumenReparto(701, 44, [{ batchId: 'l09', quantity: 328, bultos: 20 }], lotes, 'kg');
    expect(r.faltanKg).toBe(373);
    expect(r.errores).toContain('Faltan repartir 373 kg.');
  });

  it('pasado del total, lote vacío, lote que no alcanza y bultos que no cierran', () => {
    const r = resumenReparto(
      701,
      44,
      [
        { batchId: 'l09', quantity: 500, bultos: 30 },
        { batchId: 'l10', quantity: 300, bultos: 20 },
        { batchId: '', quantity: 0 },
      ],
      lotes,
      'kg',
    );
    expect(r.errores).toEqual([
      'Elegí el lote en cada fila.',
      'El lote LM-PP-20261109-0001 tiene 409,2 kg.',
      'Te pasaste 99 kg del total del renglón.',
    ]);
    // Más bultos que los del lote: avisa pero no frena (el saldo de bultos puede estar desfasado).
    expect(r.avisos).toEqual(['El lote LM-PP-20261109-0001 figura con 25 bultos y pusiste 30.']);
  });

  it('kg completos pero bultos que no cierran: lo marca', () => {
    const r = resumenReparto(
      701,
      44,
      [
        { batchId: 'l09', quantity: 328, bultos: 20 },
        { batchId: 'l10', quantity: 373, bultos: 20 },
      ],
      lotes,
      'kg',
    );
    expect(r.errores).toEqual(['Los bultos repartidos suman 40 y el renglón dice 44.']);
  });

  it('a medio repartir no repite el aviso de bultos (ya lo dice "Llevás")', () => {
    const r = resumenReparto(701, 44, [{ batchId: 'l09', quantity: 328, bultos: 20 }], lotes, 'kg');
    expect(r.errores).toEqual(['Faltan repartir 373 kg.']);
  });

  it('suma exacta en decimales: 0,1 + 0,2 = 0,3', () => {
    const chicos = [
      { batchId: 'a', batchCode: 'A', remaining: 1 },
      { batchId: 'b', batchCode: 'B', remaining: 1 },
    ];
    const r = resumenReparto(
      0.3,
      undefined,
      [
        { batchId: 'a', quantity: 0.1 },
        { batchId: 'b', quantity: 0.2 },
      ],
      chicos,
      'kg',
    );
    expect(r.errores).toEqual([]);
    expect(r.bultos).toBeNull();
  });
});

describe('filaSugerida', () => {
  it('primer lote que no alcanza: se lleva el lote entero con todos sus bultos', () => {
    expect(filaSugerida(701, 44, [{ batchId: 'l09', quantity: 0 }], 0, lotes[0]!)).toEqual({
      quantity: 409.2,
      bultos: 25,
    });
  });

  it('el lote que completa el renglón: lo que falta y los bultos que faltan (701 − 328 = 373, 44 − 20 = 24)', () => {
    const filas = [
      { batchId: 'l09', quantity: 328, bultos: 20 },
      { batchId: 'l10', quantity: 0 },
    ];
    expect(filaSugerida(701, 44, filas, 1, lotes[1]!)).toEqual({ quantity: 373, bultos: 24 });
  });

  it('sin bultos en el renglón no adivina bultos', () => {
    const filas = [
      { batchId: 'l09', quantity: 328 },
      { batchId: 'l10', quantity: 0 },
    ];
    expect(filaSugerida(701, undefined, filas, 1, lotes[1]!)).toEqual({ quantity: 373 });
  });

  it('fila ya cargada o renglón completo: no propone nada', () => {
    expect(filaSugerida(701, 44, [{ batchId: 'l09', quantity: 10 }], 0, lotes[0]!)).toBeNull();
    const completo = [
      { batchId: 'l09', quantity: 701 },
      { batchId: 'l10', quantity: 0 },
    ];
    expect(filaSugerida(701, 44, completo, 1, lotes[1]!)).toBeNull();
  });
});

// Caso real del 27/11/2026: 3.795,3 kg / 245 bultos de masa = todo el lote del 25/11
// (3.137,7 kg / 206 b) + todo el del 24/11 (657,6 kg / 39 b). Lo había cargado en dos renglones.
const l25 = { batchId: 'l25', batchCode: 'LM-PP-20261125-0001', remaining: 3137.7, bultos: 206 };
const l24 = { batchId: 'l24', batchCode: 'LM-PP-20261124-0001', remaining: 657.6, bultos: 39 };

describe('repartoInicial', () => {
  it('sin lote elegido: una fila vacía', () => {
    expect(repartoInicial(3795.3, 245)).toEqual([{ batchId: '', quantity: 0 }]);
  });

  it('con un lote elegido que no alcanza: entra el lote entero y queda una fila libre', () => {
    expect(repartoInicial(3795.3, 245, l25)).toEqual([
      { batchId: 'l25', quantity: 3137.7, bultos: 206 },
      { batchId: '', quantity: 0 },
    ]);
  });

  it('con un lote elegido que alcanza: una sola fila con todo', () => {
    expect(repartoInicial(500, 30, l25)).toEqual([{ batchId: 'l25', quantity: 500, bultos: 30 }]);
  });
});

describe('juntarRenglones', () => {
  it('dos renglones con un lote cada uno: un renglón repartido que cierra', () => {
    const r = juntarRenglones(
      { quantity: 3137.7, bultos: 206, batchId: 'l25' },
      { quantity: 657.6, bultos: 39, batchId: 'l24' },
    );
    expect(r).toEqual({
      quantity: 3795.3,
      bultos: 245,
      lotes: [
        { batchId: 'l25', quantity: 3137.7, bultos: 206 },
        { batchId: 'l24', quantity: 657.6, bultos: 39 },
      ],
    });
    expect(resumenReparto(r.quantity, r.bultos, r.lotes!, [l25, l24], 'kg').errores).toEqual([]);
  });

  it('ninguno eligió lote: suma y sigue en automático', () => {
    expect(juntarRenglones({ quantity: 0.1 }, { quantity: 0.2 })).toEqual({
      quantity: 0.3,
      bultos: undefined,
    });
  });

  it('el mismo lote en los dos: una sola fila con la suma', () => {
    const r = juntarRenglones(
      { quantity: 100, bultos: 6, batchId: 'l25' },
      { quantity: 50.5, bultos: 3, batchId: 'l25' },
    );
    expect(r.lotes).toEqual([{ batchId: 'l25', quantity: 150.5, bultos: 9 }]);
  });

  it('uno eligió lote y el otro no: lo del otro queda por repartir', () => {
    const r = juntarRenglones({ quantity: 657.6, bultos: 39, batchId: 'l24' }, { quantity: 100 });
    expect(r.quantity).toBe(757.6);
    expect(resumenReparto(r.quantity, r.bultos, r.lotes!, [l25, l24], 'kg').errores).toContain(
      'Faltan repartir 100 kg.',
    );
  });

  it('un renglón ya repartido más otro con lote: se suman las filas', () => {
    const r = juntarRenglones(
      {
        quantity: 300,
        lotes: [
          { batchId: 'l25', quantity: 200 },
          { batchId: 'l24', quantity: 100 },
        ],
      },
      { quantity: 50, batchId: 'l24' },
    );
    expect(r.lotes).toEqual([
      { batchId: 'l25', quantity: 200 },
      { batchId: 'l24', quantity: 150 },
    ]);
  });
});
