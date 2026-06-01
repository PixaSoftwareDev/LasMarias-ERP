import { planFefoAllocation } from './sales.service';

// La baja de stock del despacho se apoya en planFefoAllocation (función pura).
// Acá se verifica la asignación FEFO y la detección de faltante, sin tocar la base.

describe('planFefoAllocation (FEFO del despacho)', () => {
  it('toma del primer lote (más próximo a vencer) y sigue con el siguiente', () => {
    const plan = planFefoAllocation(30, [
      { id: 'a', remaining: 20 }, // vence antes
      { id: 'b', remaining: 50 },
    ]);
    expect(plan.shortage).toBe(0);
    expect(plan.allocations).toEqual([
      { batchId: 'a', take: 20, remainingAfter: 0 },
      { batchId: 'b', take: 10, remainingAfter: 40 },
    ]);
  });

  it('cubre exacto con un solo lote', () => {
    const plan = planFefoAllocation(20, [{ id: 'a', remaining: 20 }]);
    expect(plan.shortage).toBe(0);
    expect(plan.allocations).toEqual([{ batchId: 'a', take: 20, remainingAfter: 0 }]);
  });

  it('reporta faltante cuando no alcanza el stock', () => {
    const plan = planFefoAllocation(100, [{ id: 'a', remaining: 20 }]);
    expect(plan.shortage).toBe(80);
    expect(plan.allocations).toEqual([{ batchId: 'a', take: 20, remainingAfter: 0 }]);
  });

  it('saltea lotes sin stock disponible', () => {
    const plan = planFefoAllocation(10, [
      { id: 'a', remaining: 0 },
      { id: 'b', remaining: 15 },
    ]);
    expect(plan.shortage).toBe(0);
    expect(plan.allocations).toEqual([{ batchId: 'b', take: 10, remainingAfter: 5 }]);
  });

  it('sin lotes, todo es faltante', () => {
    const plan = planFefoAllocation(10, []);
    expect(plan.shortage).toBe(10);
    expect(plan.allocations).toEqual([]);
  });
});
