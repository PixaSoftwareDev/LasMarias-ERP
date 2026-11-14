import { agruparRenglones } from '@lasmarias/shared-schemas';

// Remito con un renglón por producto (pedido del dueño, 12/11/2026). Caso real DSP-000166:
//   MASA 328 kg / 20 b (lote 9/11) + MASA 373 kg / 24 b (lote 10/11) + RICOTTA 15,2 kg / 1 b.
const renglon = (o: Record<string, unknown>) =>
  ({ productId: 'masa', productName: 'MASA', sku: 'MASA', unit: 'kg', unitPrice: 7000, priceBasis: 'unidad', ...o }) as any;

describe('agruparRenglones', () => {
  it('DSP-000166: los dos renglones de masa se ven como uno (701 kg, 44 bultos, $4.907.000)', () => {
    const grupos = agruparRenglones([
      renglon({ quantity: 328, bultos: 20, subtotal: 2296000, batchCode: 'LM-PP-20261109-0001' }),
      renglon({ quantity: 373, bultos: 24, subtotal: 2611000, batchCode: 'LM-PP-20261110-0001' }),
      renglon({ productId: 'ric', productName: 'RICOTTA', sku: 'RIC', unitPrice: 3100, quantity: 15.2, bultos: 1, subtotal: 47120 }),
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toMatchObject({ productName: 'MASA', quantity: 701, bultos: 44, subtotal: 4907000 });
    expect(grupos[0]!.lotes).toEqual([
      { batchCode: 'LM-PP-20261109-0001', quantity: 328, bultos: 20 },
      { batchCode: 'LM-PP-20261110-0001', quantity: 373, bultos: 24 },
    ]);
    expect(grupos[1]).toMatchObject({ productName: 'RICOTTA', quantity: 15.2, bultos: 1, lotes: [] });
  });

  it('venta nueva repartida: un renglón con sus lotes guardados', () => {
    const [g] = agruparRenglones([
      renglon({
        quantity: 701,
        bultos: 44,
        subtotal: 4907000,
        lotes: [
          { batchId: 'a', batchCode: 'A', quantity: 328, bultos: 20 },
          { batchId: 'b', batchCode: 'B', quantity: 373, bultos: 24 },
        ],
      }),
    ]);
    expect(g!.lotes.map((x) => x.batchCode)).toEqual(['A', 'B']);
  });

  it('mismo producto a distinto precio: quedan separados', () => {
    const grupos = agruparRenglones([
      renglon({ quantity: 100, subtotal: 700000 }),
      renglon({ quantity: 50, unitPrice: 6500, subtotal: 325000 }),
    ]);
    expect(grupos.map((g) => g.quantity)).toEqual([100, 50]);
  });

  it('uno por kg y otro por bulto, o crema con distinto % de grasa: separados', () => {
    expect(
      agruparRenglones([renglon({ quantity: 10, subtotal: 70000 }), renglon({ quantity: 10, priceBasis: 'bulto', subtotal: 7000 })]),
    ).toHaveLength(2);
    expect(
      agruparRenglones([
        renglon({ quantity: 10, fatPct: 59, fatBasePrice: 7199.5, subtotal: 1 }),
        renglon({ quantity: 10, fatPct: 60, fatBasePrice: 7199.5, subtotal: 1 }),
      ]),
    ).toHaveLength(2);
  });

  it('sumas exactas (0,1 + 0,2 kg; $0,10 + $0,20) y bultos solo si alguno los tiene', () => {
    const [g] = agruparRenglones([
      renglon({ quantity: 0.1, subtotal: 0.1 }),
      renglon({ quantity: 0.2, subtotal: 0.2 }),
    ]);
    expect(g).toMatchObject({ quantity: 0.3, subtotal: 0.3 });
    expect(g!.bultos).toBeUndefined();
  });

  it('el mismo lote en dos renglones se suma en uno', () => {
    const [g] = agruparRenglones([
      renglon({ quantity: 10, bultos: 1, subtotal: 1, batchCode: 'A' }),
      renglon({ quantity: 5, bultos: 1, subtotal: 1, batchCode: 'A' }),
    ]);
    expect(g!.lotes).toEqual([{ batchCode: 'A', quantity: 15, bultos: 2 }]);
  });
});
