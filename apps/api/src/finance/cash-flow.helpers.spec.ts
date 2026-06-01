import { computeCashFlow, type CashFlowMovement } from './cash-flow.helpers';

describe('computeCashFlow', () => {
  const m = (kind: 'income' | 'expense', amount: number, occurredAt: string): CashFlowMovement => ({
    kind,
    amount,
    occurredAt,
  });

  it('suma ingresos − egresos por día', () => {
    const r = computeCashFlow(
      [
        m('income', 1000, '2026-05-01T10:00:00Z'),
        m('expense', 300, '2026-05-01T15:00:00Z'),
        m('income', 500, '2026-05-02T09:00:00Z'),
      ],
      '2026-05-01T00:00:00Z',
      '2026-05-31T23:59:59Z',
      'day',
    );
    expect(r.rows).toEqual([
      { period: '2026-05-01', income: 1000, expense: 300, net: 700 },
      { period: '2026-05-02', income: 500, expense: 0, net: 500 },
    ]);
    expect(r.totalIncome).toBe(1500);
    expect(r.totalExpense).toBe(300);
    expect(r.net).toBe(1200);
  });

  it('agrupa por mes con granularidad month', () => {
    const r = computeCashFlow(
      [
        m('income', 100, '2026-05-05T00:00:00Z'),
        m('income', 200, '2026-05-20T00:00:00Z'),
        m('expense', 50, '2026-06-01T00:00:00Z'),
      ],
      '2026-01-01T00:00:00Z',
      '2026-12-31T23:59:59Z',
      'month',
    );
    expect(r.rows).toEqual([
      { period: '2026-05-01', income: 300, expense: 0, net: 300 },
      { period: '2026-06-01', income: 0, expense: 50, net: -50 },
    ]);
    expect(r.net).toBe(250);
  });

  it('bordes de fecha inclusivos en ambos extremos', () => {
    const r = computeCashFlow(
      [
        m('income', 100, '2026-05-01T00:00:00Z'), // borde from
        m('income', 200, '2026-05-31T23:59:59Z'), // borde to
        m('income', 999, '2026-06-01T00:00:00Z'), // fuera
        m('income', 999, '2026-04-30T23:59:59Z'), // fuera
      ],
      '2026-05-01T00:00:00Z',
      '2026-05-31T23:59:59Z',
      'month',
    );
    expect(r.totalIncome).toBe(300);
  });

  it('sin movimientos devuelve totales en cero', () => {
    const r = computeCashFlow([], '2026-05-01T00:00:00Z', '2026-05-31T23:59:59Z', 'day');
    expect(r).toEqual({ rows: [], totalIncome: 0, totalExpense: 0, net: 0 });
  });

  it('centavos exactos', () => {
    const r = computeCashFlow(
      [m('income', 0.1, '2026-05-01T00:00:00Z'), m('income', 0.2, '2026-05-01T01:00:00Z')],
      '2026-05-01T00:00:00Z',
      '2026-05-31T23:59:59Z',
      'day',
    );
    expect(r.rows[0]?.income).toBe(0.3);
  });
});
