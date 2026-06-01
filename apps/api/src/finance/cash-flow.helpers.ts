import Big from 'big.js';
import type { CashFlowReport, CashFlowRow } from '@lasmarias/shared-schemas';

// Lógica de dominio financiera en funciones puras (CLAUDE.md §8).
// Decimal exacto con Big.js (HALF_UP por default).
const MONEY_DP = 2;

export interface CashFlowMovement {
  kind: 'income' | 'expense';
  amount: number; // positivo
  occurredAt: Date | string;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

// Clave de período según granularidad. 'day' → YYYY-MM-DD; 'month' → YYYY-MM-01.
// Usa UTC para consistencia con timestamptz almacenado.
function periodKey(d: Date, granularity: 'day' | 'month'): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  if (granularity === 'month') return `${y}-${m}-01`;
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Suma ingresos − egresos agrupando por período. Bordes de fecha inclusivos.
// Movimientos fuera de [from, to] se descartan (ambos extremos incluidos).
export function computeCashFlow(
  movements: ReadonlyArray<CashFlowMovement>,
  from: Date | string,
  to: Date | string,
  granularity: 'day' | 'month',
): CashFlowReport {
  const fromMs = toDate(from).getTime();
  const toMs = toDate(to).getTime();

  const byPeriod = new Map<string, { income: Big; expense: Big }>();
  let totalIncome = new Big(0);
  let totalExpense = new Big(0);

  for (const m of movements) {
    const d = toDate(m.occurredAt);
    const ms = d.getTime();
    if (ms < fromMs || ms > toMs) continue; // inclusivo en ambos extremos
    const key = periodKey(d, granularity);
    const bucket = byPeriod.get(key) ?? { income: new Big(0), expense: new Big(0) };
    const amt = new Big(m.amount);
    if (m.kind === 'income') {
      bucket.income = bucket.income.plus(amt);
      totalIncome = totalIncome.plus(amt);
    } else {
      bucket.expense = bucket.expense.plus(amt);
      totalExpense = totalExpense.plus(amt);
    }
    byPeriod.set(key, bucket);
  }

  const rows: CashFlowRow[] = [...byPeriod.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([period, b]) => ({
      period,
      income: b.income.round(MONEY_DP).toNumber(),
      expense: b.expense.round(MONEY_DP).toNumber(),
      net: b.income.minus(b.expense).round(MONEY_DP).toNumber(),
    }));

  return {
    rows,
    totalIncome: totalIncome.round(MONEY_DP).toNumber(),
    totalExpense: totalExpense.round(MONEY_DP).toNumber(),
    net: totalIncome.minus(totalExpense).round(MONEY_DP).toNumber(),
  };
}
