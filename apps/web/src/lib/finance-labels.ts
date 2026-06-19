// Etiquetas legibles para el administrativo (CLAUDE.md §7 — cero jerga técnica).
// Los movimientos que el sistema genera solo (cobros, pagos, cheques) llegan con un
// código interno en snake_case. Acá los traducimos a nombre del negocio.

const CATEGORY_LABELS: Record<string, string> = {
  cobro_cliente: 'Cobro de cliente',
  pago_tambo: 'Pago a tambo',
  pago_proveedor: 'Pago a proveedor',
  cheque_cobrado: 'Cheque cobrado',
  cheque_propio: 'Cheque propio',
  materia_prima: 'Compra de leche',
};

/** Convierte el código interno de una categoría de caja en texto legible. */
export function categoryLabel(raw: string): string {
  if (CATEGORY_LABELS[raw]) return CATEGORY_LABELS[raw];
  // Cualquier otro código con guiones bajos → texto con espacios y mayúscula inicial.
  if (raw.includes('_')) {
    const s = raw.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return raw;
}
