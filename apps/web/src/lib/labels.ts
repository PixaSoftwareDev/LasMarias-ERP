// Etiquetas en español para enums del dominio. CLAUDE.md §5.1 — cero jerga técnica:
// el usuario nunca debe ver estados crudos de la base ("received", "production").

// --- Movimientos de inventario ---
export const movementReasonLabel: Record<string, string> = {
  production: 'Producción',
  purchase: 'Compra',
  sale: 'Venta',
  consumption: 'Consumo',
  count: 'Recuento',
  discard: 'Descarte',
  transfer: 'Transferencia',
};

export const movementTypeLabel: Record<string, string> = {
  in: 'Entrada',
  out: 'Salida',
  adjustment: 'Ajuste',
  transfer: 'Transferencia',
};

// Devuelve la etiqueta o, si no la conoce, el valor capitalizado (nunca el crudo en inglés a secas).
export function labelOr(map: Record<string, string>, value: string): string {
  return map[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}
