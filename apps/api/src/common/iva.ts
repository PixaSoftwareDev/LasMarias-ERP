import Big from 'big.js';
import type { IvaMode } from '@lasmarias/shared-schemas';

// Aplica IVA a un monto base con DECIMAL EXACTO (big.js), como exige la calculadora
// de costo (CLAUDE.md §5.3): nunca float binario.
//
//   "sin_iva" → el monto va directo.
//   "con_iva" → monto × (1 + alícuota/100).
//
// Devuelve string para conservar la precisión al guardarlo en columnas numeric.
export function applyIva(
  amount: number | string,
  mode: IvaMode | undefined,
  ratePercent: number,
): string {
  const base = new Big(amount);
  if (mode !== 'con_iva') return base.toString();
  const factor = new Big(1).plus(new Big(ratePercent).div(100));
  return base.times(factor).toString();
}
