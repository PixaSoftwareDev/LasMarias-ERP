// Etiquetas en español para enums del dominio. CLAUDE.md §5.1 — cero jerga técnica:
// el usuario nunca debe ver estados crudos de la base ("received", "production").

import type { Status } from '@/components/ui/status-badge';

// --- Órdenes de compra ---
export const purchaseOrderStatusLabel: Record<string, string> = {
  draft: 'Borrador',
  approved: 'Aprobada',
  received: 'Recibida',
  invoiced: 'Facturada',
  cancelled: 'Anulada',
};

export const purchaseOrderStatusTone: Record<string, Status> = {
  draft: 'neutral',
  approved: 'info',
  received: 'success',
  invoiced: 'success',
  cancelled: 'danger',
};

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

// --- Pedidos de venta ---
export const salesOrderStatusLabel: Record<string, string> = {
  taken: 'Tomado',
  confirmed: 'Confirmado',
  prepared: 'Preparado',
  loaded: 'Cargado',
  in_delivery: 'En reparto',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

// Devuelve la etiqueta o, si no la conoce, el valor capitalizado (nunca el crudo en inglés a secas).
export function labelOr(map: Record<string, string>, value: string): string {
  return map[value] ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}
