import type { Currency, ExchangeRate } from '@lasmarias/shared-schemas';

// Helpers de moneda compartidos por las pantallas que cargan precios (recetas,
// ingreso de stock, tambos, listas de precio). El backend congela todo en pesos;
// acá solo mostramos el equivalente en vivo para que el usuario sepa qué carga.

export const CURRENCY_OPTIONS: { value: Currency; label: string; symbol: string }[] = [
  { value: 'ARS', label: 'Pesos ($)', symbol: '$' },
  { value: 'USD', label: 'Dólares (US$)', symbol: 'US$' },
  { value: 'EUR', label: 'Euros (€)', symbol: '€' },
];

export function currencySymbol(currency: Currency): string {
  return CURRENCY_OPTIONS.find((o) => o.value === currency)?.symbol ?? '$';
}

// Cotización (pesos por 1 unidad de la moneda) según la última cargada. ARS = 1.
export function rateForCurrency(rate: ExchangeRate | undefined, currency: Currency): number | null {
  if (currency === 'ARS') return 1;
  if (!rate) return null;
  return currency === 'USD' ? rate.usd : rate.eur;
}

// Equivalente en pesos de un monto cargado en `currency`. Devuelve null si no se
// puede convertir todavía (sin cotización, o monto vacío/0).
export function equivalentArs(
  amount: number | string,
  currency: Currency,
  rate: ExchangeRate | undefined,
): number | null {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value) || value <= 0) return null;
  if (currency === 'ARS') return null; // sin sentido mostrar "≈ $X" si ya está en $
  const r = rateForCurrency(rate, currency);
  if (r == null || r <= 0) return null;
  return value * r;
}
