import { receptionCharges } from './producer-accounts.helpers';

// Pago a tambo: cómo se reparte el "debe" de una recepción entre uno o varios tambos.
describe('receptionCharges', () => {
  it('single-tambo viejo (sin lines): usa el costo del lote sobre el productor', () => {
    const charges = receptionCharges({ producerId: 'p1', liters: 1000, batchUnitCost: 320 });
    expect(charges).toEqual([{ producerId: 'p1', liters: 1000, price: 320, amount: 320000 }]);
  });

  it('multi-tambo: una fila por tambo con sus litros × su precio congelado', () => {
    const charges = receptionCharges({
      producerId: 'p1',
      liters: 3000,
      lines: [
        { producerId: 'p1', liters: 1000, pricePerLiter: 320 },
        { producerId: 'p2', liters: 1200, pricePerLiter: 310 },
        { producerId: 'p3', liters: 800, pricePerLiter: 300 },
      ],
    });
    expect(charges).toEqual([
      { producerId: 'p1', liters: 1000, price: 320, amount: 320000 },
      { producerId: 'p2', liters: 1200, price: 310, amount: 372000 },
      { producerId: 'p3', liters: 800, price: 300, amount: 240000 },
    ]);
    // La suma de los cargos = total de la descarga.
    const total = charges.reduce((a, c) => a + c.amount, 0);
    expect(total).toBe(932000);
  });

  it('tambo sin precio congelado: cargo 0 (no rompe)', () => {
    const charges = receptionCharges({
      producerId: 'p1',
      liters: 500,
      lines: [{ producerId: 'p1', liters: 500 }],
    });
    expect(charges[0]).toEqual({ producerId: 'p1', liters: 500, price: 0, amount: 0 });
  });
});
