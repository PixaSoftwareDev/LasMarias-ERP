import { computeReceivable, resolvePrice, type PriceListEntry, type ReceivableMovement } from './accounts.helpers';

describe('resolvePrice', () => {
  const items: PriceListEntry[] = [
    { clientType: 'minorista', productId: 'p1', unitPrice: 100 },
    { clientType: 'mayorista', productId: 'p1', unitPrice: 80 },
    { clientType: 'minorista', productId: 'p2', unitPrice: 0 }, // precio 0 explícito válido
  ];

  it('toma el precio de lista según el tipo de cliente', () => {
    expect(resolvePrice({ clientType: 'mayorista', productId: 'p1', items })).toEqual({
      unitPrice: 80,
      warning: null,
      source: 'list',
    });
  });

  it('el override gana sobre la lista', () => {
    expect(
      resolvePrice({ clientType: 'minorista', productId: 'p1', items, override: 123.456 }),
    ).toEqual({ unitPrice: 123.46, warning: null, source: 'override' });
  });

  it('acepta precio 0 explícito en la lista (no lo trata como faltante)', () => {
    expect(resolvePrice({ clientType: 'minorista', productId: 'p2', items })).toEqual({
      unitPrice: 0,
      warning: null,
      source: 'list',
    });
  });

  it('override 0 explícito es válido', () => {
    expect(
      resolvePrice({ clientType: 'mayorista', productId: 'p1', items, override: 0 }),
    ).toEqual({ unitPrice: 0, warning: null, source: 'override' });
  });

  it('sin entrada ni override devuelve null + warning (NO 0)', () => {
    expect(resolvePrice({ clientType: 'distribuidor', productId: 'p1', items })).toEqual({
      unitPrice: null,
      warning: 'PRODUCTO_SIN_PRECIO',
      source: null,
    });
  });

  it('override null no cuenta como override (cae a la lista / faltante)', () => {
    expect(
      resolvePrice({ clientType: 'distribuidor', productId: 'p1', items, override: null }),
    ).toEqual({ unitPrice: null, warning: 'PRODUCTO_SIN_PRECIO', source: null });
  });
});

describe('computeReceivable', () => {
  const asOf = new Date('2026-05-30T00:00:00Z');

  function charge(amount: number, dueDate: string): ReceivableMovement {
    return { kind: 'charge', amount, occurredAt: dueDate, dueDate };
  }
  function payment(amount: number, occurredAt = '2026-05-30T00:00:00Z'): ReceivableMovement {
    return { kind: 'payment', amount, occurredAt };
  }

  it('saldo simple: un cargo sin pagos', () => {
    const r = computeReceivable([charge(1000, '2026-05-20T00:00:00Z')], asOf);
    expect(r.balance).toBe(1000);
    expect(r.aging).toEqual({ current: 1000, d31to60: 0, over60: 0 });
    expect(r.warnings).toEqual([]);
  });

  it('imputación FIFO multi-cargo: el pago cancela el cargo más viejo primero', () => {
    const r = computeReceivable(
      [
        charge(500, '2026-01-01T00:00:00Z'), // viejo (>60 días)
        charge(300, '2026-05-25T00:00:00Z'), // reciente
        payment(500),
      ],
      asOf,
    );
    expect(r.balance).toBe(300);
    // El pago canceló el cargo viejo; queda solo el reciente en current.
    expect(r.aging).toEqual({ current: 300, d31to60: 0, over60: 0 });
  });

  it('cobro mayor al saldo deja saldo negativo (a favor) sin clampear', () => {
    const r = computeReceivable([charge(1000, '2026-05-20T00:00:00Z'), payment(1500)], asOf);
    expect(r.balance).toBe(-500);
    expect(r.warnings).toContain('SALDO_A_FAVOR');
    // Todos los cargos quedaron cancelados por FIFO → aging en cero.
    expect(r.aging).toEqual({ current: 0, d31to60: 0, over60: 0 });
  });

  it('borde día 30 cae en current, día 31 cae en 31-60', () => {
    // asOf = 2026-05-30. due 2026-04-30 → 30 días; due 2026-04-29 → 31 días.
    const r30 = computeReceivable([charge(100, '2026-04-30T00:00:00Z')], asOf);
    expect(r30.aging).toEqual({ current: 100, d31to60: 0, over60: 0 });

    const r31 = computeReceivable([charge(100, '2026-04-29T00:00:00Z')], asOf);
    expect(r31.aging).toEqual({ current: 0, d31to60: 100, over60: 0 });
  });

  it('borde día 60 en 31-60, día 61 en 60+', () => {
    // due 2026-03-31 → 60 días; due 2026-03-30 → 61 días.
    const r60 = computeReceivable([charge(100, '2026-03-31T00:00:00Z')], asOf);
    expect(r60.aging).toEqual({ current: 0, d31to60: 100, over60: 0 });

    const r61 = computeReceivable([charge(100, '2026-03-30T00:00:00Z')], asOf);
    expect(r61.aging).toEqual({ current: 0, d31to60: 0, over60: 100 });
  });

  it('cancelación exacta: pago igual al cargo deja saldo 0 y aging 0', () => {
    const r = computeReceivable([charge(742.5, '2026-05-20T00:00:00Z'), payment(742.5)], asOf);
    expect(r.balance).toBe(0);
    expect(r.aging).toEqual({ current: 0, d31to60: 0, over60: 0 });
    expect(r.warnings).toEqual([]);
  });

  it('centavos: suma exacta sin error de punto flotante', () => {
    const r = computeReceivable(
      [
        charge(0.1, '2026-05-20T00:00:00Z'),
        charge(0.2, '2026-05-21T00:00:00Z'),
        payment(0.1),
      ],
      asOf,
    );
    expect(r.balance).toBe(0.2);
    expect(r.aging.current).toBe(0.2);
  });

  it('nota de crédito baja el saldo igual que un pago', () => {
    const r = computeReceivable(
      [charge(1000, '2026-05-20T00:00:00Z'), { kind: 'credit_note', amount: 200, occurredAt: '2026-05-25T00:00:00Z' }],
      asOf,
    );
    expect(r.balance).toBe(800);
    expect(r.aging.current).toBe(800);
  });
});
