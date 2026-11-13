import type { IngredientBasis } from './recipe';

// Envases (baldes, bolsas, cajas): insumos que se cuentan por UNIDAD y escalan con lo
// producido. No existe medio balde: se consumen enteros (pedido del dueño, 12/11/2026).
//   "por bulto"         → cantidad × bultos de la tachada
//   "por kg de producto" → cantidad × kg, redondeado hacia arriba (0,1 × 168 kg = 16,8 → 17)
// La cuenta exacta (big.js) la hace la calculadora en la API; esta es la misma regla para
// que la pantalla sugiera el número antes de cerrar.

interface IngredienteEnvase {
  unit: string;
  basis: IngredientBasis;
  quantity: number;
}

export function esEnvase(ing: IngredienteEnvase): boolean {
  return ing.unit === 'unidad' && (ing.basis === 'per_kg_product' || ing.basis === 'per_bulto');
}

export function envaseSugerido(ing: IngredienteEnvase, kg: number, bultos: number): number {
  const exacto = ing.quantity * (ing.basis === 'per_bulto' ? bultos : kg);
  // Se redondea a 6 decimales antes del techo: 0,1 × 170 en float da 17,000000000000004.
  return Math.ceil(Math.round(exacto * 1e6) / 1e6);
}
