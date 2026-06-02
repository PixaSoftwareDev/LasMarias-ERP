import Big from 'big.js';
import type { AccountAging, ClientType } from '@lasmarias/shared-schemas';

// Lógica de dominio comercial en funciones puras (CLAUDE.md §8).
// Decimal exacto con Big.js (HALF_UP es el default de big.js: Big.RM = 1).
const MONEY_DP = 2;

// --- Resolución de precio por lista (tipo de cliente) con override a mano ---
export interface PriceListEntry {
  clientType: ClientType;
  productId: string;
  unitPrice: number; // 0 explícito es válido
}

export interface ResolvePriceResult {
  unitPrice: number | null; // null si no hay precio (NO 0)
  warning: string | null; // 'PRODUCTO_SIN_PRECIO' cuando no hay entrada ni override
  source: 'override' | 'list' | null;
}

// El override gana siempre. Si no hay override, busca el precio de lista para el
// (tipo de cliente, producto). Precio 0 explícito es válido. Sin entrada → null + warning.
export function resolvePrice(args: {
  clientType: ClientType;
  productId: string;
  items: ReadonlyArray<PriceListEntry>;
  override?: number | null;
}): ResolvePriceResult {
  if (args.override !== undefined && args.override !== null) {
    return { unitPrice: new Big(args.override).round(MONEY_DP).toNumber(), warning: null, source: 'override' };
  }
  const match = args.items.find(
    (i) => i.clientType === args.clientType && i.productId === args.productId,
  );
  if (!match) {
    return { unitPrice: null, warning: 'PRODUCTO_SIN_PRECIO', source: null };
  }
  return { unitPrice: new Big(match.unitPrice).round(MONEY_DP).toNumber(), warning: null, source: 'list' };
}

// --- Cuenta corriente: saldo + antigüedad por tramos con imputación FIFO ---
export interface ReceivableMovement {
  kind: 'charge' | 'payment' | 'credit_note';
  amount: number; // siempre positivo
  occurredAt: Date | string;
  dueDate?: Date | string | null;
}

export interface ReceivableResult {
  balance: number; // Σcharge − Σpayment − Σcredit_note (puede ser negativo)
  aging: AccountAging; // sobre cargos impagos (imputación FIFO de pagos sobre cargos viejos)
  overdue: number; // deuda VENCIDA: Σ cargos impagos cuyo vencimiento ya pasó
  warnings: string[]; // 'SALDO_A_FAVOR' si el saldo es negativo
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

// Tramo de antigüedad de un cargo según días transcurridos desde su vencimiento
// (o fecha de ocurrencia si no tiene vencimiento) hasta asOf. 0-30 (≤30) / 31-60 / 60+.
function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Calcula saldo y antigüedad. Imputación FIFO: los cobros y notas de crédito
// cancelan primero los cargos más viejos (por fecha de vencimiento, luego occurredAt).
// El remanente impagado de cada cargo se clasifica por tramo de antigüedad.
export function computeReceivable(
  movements: ReadonlyArray<ReceivableMovement>,
  asOfDate: Date | string,
): ReceivableResult {
  const asOf = toDate(asOfDate);
  const warnings: string[] = [];

  // Saldo total = Σcharge − Σpayment − Σcredit_note.
  let balance = new Big(0);
  for (const m of movements) {
    const amt = new Big(m.amount);
    if (m.kind === 'charge') balance = balance.plus(amt);
    else balance = balance.minus(amt);
  }

  // Cargos ordenados por antigüedad (FIFO: vencimiento, luego occurredAt).
  const charges = movements
    .filter((m) => m.kind === 'charge')
    .map((m) => ({
      remaining: new Big(m.amount),
      ageRef: toDate(m.dueDate ?? m.occurredAt),
    }))
    .sort((a, b) => a.ageRef.getTime() - b.ageRef.getTime());

  // Total de pagos + notas de crédito imputable a cargos.
  let credits = new Big(0);
  for (const m of movements) {
    if (m.kind === 'payment' || m.kind === 'credit_note') credits = credits.plus(new Big(m.amount));
  }

  // Imputación FIFO: descontar credits de los cargos más viejos.
  for (const c of charges) {
    if (credits.lte(0)) break;
    const applied = credits.gte(c.remaining) ? c.remaining : credits;
    c.remaining = c.remaining.minus(applied);
    credits = credits.minus(applied);
  }

  // Clasificar el remanente impago de cada cargo por tramo.
  let current = new Big(0); // 0-30 (≤30)
  let d31to60 = new Big(0); // 31-60
  let over60 = new Big(0); // 60+
  let overdue = new Big(0); // VENCIDO: vencimiento ya pasó (days > 0)
  for (const c of charges) {
    if (c.remaining.lte(0)) continue;
    const days = daysBetween(c.ageRef, asOf);
    if (days <= 30) current = current.plus(c.remaining);
    else if (days <= 60) d31to60 = d31to60.plus(c.remaining);
    else over60 = over60.plus(c.remaining);
    if (days > 0) overdue = overdue.plus(c.remaining);
  }

  if (balance.lt(0)) warnings.push('SALDO_A_FAVOR');

  return {
    balance: balance.round(MONEY_DP).toNumber(),
    aging: {
      current: current.round(MONEY_DP).toNumber(),
      d31to60: d31to60.round(MONEY_DP).toNumber(),
      over60: over60.round(MONEY_DP).toNumber(),
    },
    overdue: overdue.round(MONEY_DP).toNumber(),
    warnings,
  };
}
