import { bultosDelReparto, planDelReparto, validarRepartoKg } from './reparto-lotes';

// Caso real (DSP-000166, 12/11/2026): 701 kg de masa en UN renglón, repartidos así:
//   328 kg / 20 bultos del lote del 9/11  +  373 kg / 24 bultos del lote del 10/11.
const reparto = [
  { batchId: 'l0911', quantity: 328, bultos: 20 },
  { batchId: 'l1010', quantity: 373, bultos: 24 },
];

describe('validarRepartoKg', () => {
  it('328 + 373 = 701: pasa', () => {
    expect(() => validarRepartoKg({ quantity: 701, lotes: reparto }, 'MASA', 'kg')).not.toThrow();
  });

  it('si no suma el total, lo dice con los dos números', () => {
    expect(() => validarRepartoKg({ quantity: 700, lotes: reparto }, 'MASA', 'kg')).toThrow(
      'Repartiste 701 kg de MASA entre los lotes, pero el renglón es de 700. Tienen que coincidir.',
    );
  });

  it('decimal exacto: 0,1 + 0,2 = 0,3', () => {
    const lotes = [
      { batchId: 'a', quantity: 0.1 },
      { batchId: 'b', quantity: 0.2 },
    ];
    expect(() => validarRepartoKg({ quantity: 0.3, lotes }, 'MASA', 'kg')).not.toThrow();
  });
});

describe('bultosDelReparto', () => {
  it('con bultos por lote, el renglón lleva la suma (20 + 24 = 44)', () => {
    expect(bultosDelReparto({ quantity: 701, lotes: reparto }, 'MASA')).toBe(44);
    expect(bultosDelReparto({ quantity: 701, bultos: 44, lotes: reparto }, 'MASA')).toBe(44);
  });

  it('si el total de bultos no coincide con la suma, frena', () => {
    expect(() => bultosDelReparto({ quantity: 701, bultos: 40, lotes: reparto }, 'MASA')).toThrow(
      /Repartiste 44 bultos de MASA entre los lotes, pero el renglón dice 40/,
    );
  });

  it('sin bultos por lote, queda el total del renglón (se reparte a prorrata al descontar)', () => {
    const sinBultos = reparto.map(({ batchId, quantity }) => ({ batchId, quantity }));
    expect(bultosDelReparto({ quantity: 701, bultos: 44, lotes: sinBultos }, 'MASA')).toBe(44);
    expect(bultosDelReparto({ quantity: 701, lotes: sinBultos }, 'MASA')).toBeUndefined();
  });
});

describe('planDelReparto', () => {
  const activos = [
    { id: 'l0911', code: 'LM-PP-20261109-0001', remainingQuantity: '409.2' },
    { id: 'l1010', code: 'LM-PP-20261110-0001', remainingQuantity: '635.4' },
  ];
  const linea = () => ({ productName: 'MASA', unit: 'kg', lotes: reparto.map((x) => ({ ...x })) });

  it('sale de cada lote exactamente lo cargado', () => {
    expect(planDelReparto(linea(), activos)).toEqual({
      allocations: [
        { batchId: 'l0911', take: 328, remainingAfter: 81.2 },
        { batchId: 'l1010', take: 373, remainingAfter: 262.4 },
      ],
      shortage: 0,
    });
  });

  it('si un lote no tiene lo asignado, dice cuánto tiene', () => {
    const poco = [{ ...activos[0]!, remainingQuantity: '81.2' }, activos[1]!];
    expect(() => planDelReparto(linea(), poco)).toThrow(
      'El lote LM-PP-20261109-0001 tiene 81.2 kg de MASA y le asignaste 328.',
    );
  });

  it('si un lote ya no está activo, pide volver a elegir', () => {
    expect(() => planDelReparto(linea(), [activos[1]!])).toThrow(/ya no tiene stock/);
  });
});
