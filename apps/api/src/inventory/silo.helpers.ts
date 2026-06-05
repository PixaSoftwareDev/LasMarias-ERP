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
