import { z } from 'zod';

// Mes como texto AAAA-MM (lo usan el precio de la leche por mes y los costos fijos).
export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido (AAAA-MM)');

/** Suma (o resta, con k negativo) meses a un AAAA-MM: sumarMeses('2026-12', 1) = '2027-01'. */
export const sumarMeses = (m: string, k: number): string => {
  const idx = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + k;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
};
