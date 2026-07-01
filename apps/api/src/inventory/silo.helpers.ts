// Helpers puros de silos (CLAUDE.md §9). Verificables a mano, sin tocar la base.

// Porcentaje de llenado (0–100, una decimal). Capacidad 0/desconocida → 0%.
// Puede pasar de 100 si el silo se excede (se muestra como alerta arriba en la UI).
export function siloFillPercent(currentLiters: number, capacityLiters: number): number {
  if (!(capacityLiters > 0)) return 0;
  return Math.round((currentLiters / capacityLiters) * 1000) / 10;
}

// Nivel bajo: menos del umbral (por defecto 15%) y con capacidad cargada.
export function isLowLevel(fillPercent: number, threshold = 15): boolean {
  return fillPercent < threshold;
}

// Litros que todavía entran en un silo. Capacidad 0/desconocida → Infinity (sin límite).
export function siloAvailableLiters(capacityLiters: number, currentLiters: number): number {
  if (!(capacityLiters > 0)) return Infinity;
  return capacityLiters - currentLiters;
}

// ¿Entran `requested` litros en el silo? (tolerancia mínima por redondeo).
export function siloHasRoomFor(
  capacityLiters: number,
  currentLiters: number,
  requestedLiters: number,
): boolean {
  return requestedLiters <= siloAvailableLiters(capacityLiters, currentLiters) + 1e-6;
}
