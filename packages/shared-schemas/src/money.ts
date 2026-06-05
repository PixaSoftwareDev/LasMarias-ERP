import { z } from 'zod';
import { isoDateTimeSchema } from './common';

// Monedas soportadas. ARS es la moneda base del sistema (la calculadora trabaja en $).
// USD/EUR se convierten a $ EN EL ORIGEN y se congelan por operación (CLAUDE.md §6 nuevo).
export const currencySchema = z.enum(['ARS', 'USD', 'EUR']);
export type Currency = z.infer<typeof currencySchema>;

// Cotización del día: cuántos pesos vale 1 USD y 1 EUR. Carga manual, histórico por fecha.
export const exchangeRateSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  usd: z.number().positive(), // $ por 1 USD
  eur: z.number().positive(), // $ por 1 EUR
  updatedAt: isoDateTimeSchema,
});
export type ExchangeRate = z.infer<typeof exchangeRateSchema>;

export const upsertExchangeRateInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  usd: z.number().positive('El dólar tiene que ser mayor a 0'),
  eur: z.number().positive('El euro tiene que ser mayor a 0'),
});
export type UpsertExchangeRateInput = z.infer<typeof upsertExchangeRateInputSchema>;
