import type { Weekday } from '@lasmarias/shared-schemas';

// CLAUDE.md §4.6.1 — Cálculo de próxima fecha de reparto válida.
// Entradas: días recurrentes de la zona, cutoff (HH:mm), excepciones (suspendidos/extras),
// hora actual. Salida: próxima fecha de reparto (YYYY-MM-DD).

const WEEKDAY_ORDER: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface DeliveryRules {
  deliveryDays: Weekday[];
  cutoffTime: string; // HH:mm
  suspendedDates: Set<string>; // YYYY-MM-DD
  extraDates: Set<string>;
}

function toYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function nextDeliveryDate(now: Date, rules: DeliveryRules, lookaheadDays = 30): string {
  const parts = rules.cutoffTime.split(':').map(Number);
  const cutHour = parts[0] ?? 0;
  const cutMin = parts[1] ?? 0;
  const cutoffPassedToday = now.getHours() > cutHour || (now.getHours() === cutHour && now.getMinutes() >= cutMin);

  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (cutoffPassedToday) cursor.setDate(cursor.getDate() + 1);

  for (let i = 0; i < lookaheadDays; i++) {
    const ymd = toYMD(cursor);
    const weekday = WEEKDAY_ORDER[cursor.getDay()]!;
    const isRecurring = rules.deliveryDays.includes(weekday);
    const isExtra = rules.extraDates.has(ymd);
    const isSuspended = rules.suspendedDates.has(ymd);
    if (!isSuspended && (isRecurring || isExtra)) return ymd;
    cursor.setDate(cursor.getDate() + 1);
  }
  throw new Error('No se encontró fecha de reparto válida en los próximos 30 días');
}

// Valida que una fecha solicitada sea válida según reglas.
export function isValidDeliveryDate(date: string, rules: DeliveryRules): boolean {
  if (rules.suspendedDates.has(date)) return false;
  if (rules.extraDates.has(date)) return true;
  const d = new Date(`${date}T00:00:00`);
  return rules.deliveryDays.includes(WEEKDAY_ORDER[d.getDay()]!);
}
