import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';
import { currencySchema } from './money';

// CLAUDE.md §4.4 — Inventario por lote, FEFO, alertas.

export const movementTypeSchema = z.enum(['in', 'out', 'adjustment', 'transfer']);
export type MovementType = z.infer<typeof movementTypeSchema>;

export const movementReasonSchema = z.enum([
  'production',
  'purchase',
  'sale',
  'return',
  'consumption',
  'count',
  'discard',
  'transfer',
]);
export type MovementReason = z.infer<typeof movementReasonSchema>;

export const warehouseSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  kind: z.enum(['cold_chamber', 'sector', 'dry_storage', 'maturation']),
  targetTemperatureCelsius: z.number().optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Warehouse = z.infer<typeof warehouseSchema>;

export const inventoryMovementSchema = z.object({
  id: uuidSchema,
  batchId: uuidSchema,
  batchCode: z.string(),
  productId: uuidSchema,
  productName: z.string(),
  type: movementTypeSchema,
  reason: movementReasonSchema,
  quantity: z.number(),
  unit: z.string(),
  warehouseId: uuidSchema.optional(),
  warehouseName: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
  createdById: uuidSchema,
  createdAt: isoDateTimeSchema,
});
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;

export const stockSummarySchema = z.object({
  // string (no uuid): la leche cruda usa un id sintético ('leche-cruda').
  productId: z.string(),
  productName: z.string(),
  sku: z.string(),
  unit: z.string(),
  // Categoría del producto para agrupar el inventario (materia_prima, intermedio, queso, etc.).
  category: z.string().optional(),
  totalQuantity: z.number(),
  batchCount: z.number().int(),
  nearestExpiration: isoDateTimeSchema.optional(),
  minStock: z.number().optional(),
  // Nombres de las cámaras/sectores donde hay lotes de este producto.
  warehouses: z.array(z.string()).optional(),
  alertLevel: z.enum(['ok', 'low', 'critical', 'expiring']).optional(),
});
export type StockSummary = z.infer<typeof stockSummarySchema>;

// Ingreso directo de stock (insumos, envases). Genera un lote de entrada.
// No es el módulo de compras completo (diferido); es una carga simple.
export const stockEntryInputSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().positive('La cantidad tiene que ser mayor a 0'),
  unitCost: z.number().nonnegative().optional(),
  // Moneda del costo cargado. Si es USD/EUR se convierte a $ con la cotización del día
  // y se congela en el lote (la calculadora siempre trabaja en pesos). Default ARS.
  currency: currencySchema.optional(),
  warehouseId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
});
export type StockEntryInput = z.infer<typeof stockEntryInputSchema>;

// Dar de baja stock por descarte/merma/vencimiento (salida con motivo, FEFO).
export const discardReasonSchema = z.enum(['vencido', 'merma', 'descarte', 'rotura']);
export type DiscardReason = z.infer<typeof discardReasonSchema>;

export const discardStockInputSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().positive('La cantidad tiene que ser mayor a 0'),
  reason: discardReasonSchema,
  notes: z.string().max(1000).optional(),
});
export type DiscardStockInput = z.infer<typeof discardStockInputSchema>;

// Ajuste por conteo físico: el sistema lleva el stock a la cantidad contada.
export const countAdjustInputSchema = z.object({
  productId: uuidSchema,
  countedQuantity: z.number().nonnegative('No puede ser negativo'),
  notes: z.string().max(1000).optional(),
});
export type CountAdjustInput = z.infer<typeof countAdjustInputSchema>;

export const createWarehouseInputSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  kind: z.enum(['cold_chamber', 'sector', 'dry_storage', 'maturation']),
  targetTemperatureCelsius: z.number().optional(),
});
export type CreateWarehouseInput = z.infer<typeof createWarehouseInputSchema>;

// Edición de cámara: mismos campos opcionales + activar/desactivar.
export const updateWarehouseInputSchema = createWarehouseInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseInputSchema>;

// --- Trazabilidad bidireccional (CLAUDE.md §4.4)
// Se construye recorriendo inventory_movements (no parent_batch_id), de modo que
// resuelve multi-padre (un lote producto hecho de varios lotes de leche) y multi-paso
// (leche → masa → mozzarella). Protegido contra ciclos.

// Lote dentro de una cadena de trazabilidad.
export const traceBatchSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  productId: uuidSchema.nullable(),
  productName: z.string().nullable(),
  unit: z.string(),
  quantity: z.number().nullable(), // cantidad consumida/producida en ese vínculo (si aplica)
  expirationDate: isoDateTimeSchema.optional(),
  isMilk: z.boolean(), // true si es leche cruda (origen, con recepción asociada)
});
export type TraceBatch = z.infer<typeof traceBatchSchema>;

// --- DESCENDENTE: de un lote hacia adelante (qué se hizo con él, a quién se vendió).
// Despacho a cliente.
export const traceDispatchSchema = z.object({
  salesOrderId: uuidSchema,
  salesOrderCode: z.string(),
  clientId: uuidSchema.nullable(),
  clientName: z.string(),
  quantity: z.number(),
  unit: z.string(),
  dispatchedAt: isoDateTimeSchema.optional(),
});
export type TraceDispatch = z.infer<typeof traceDispatchSchema>;

// Nodo de la cadena descendente: un lote, las órdenes donde se consumió (con sus
// lotes producto, recursivos) y los despachos a clientes.
export interface TraceForwardNode {
  batch: TraceBatch;
  // Órdenes de producción donde este lote se consumió.
  productionOrders: Array<{
    orderId: string;
    orderCode: string;
    // Lotes de producto que salieron de esa orden (recursión descendente).
    outputs: TraceForwardNode[];
  }>;
  // Ventas/despachos directos de este lote.
  dispatches: TraceDispatch[];
}

export const traceForwardNodeSchema: z.ZodType<TraceForwardNode> = z.lazy(() =>
  z.object({
    batch: traceBatchSchema,
    productionOrders: z.array(
      z.object({
        orderId: uuidSchema,
        orderCode: z.string(),
        outputs: z.array(traceForwardNodeSchema),
      }),
    ),
    dispatches: z.array(traceDispatchSchema),
  }),
);

export const traceForwardSchema = traceForwardNodeSchema;
export type TraceForward = TraceForwardNode;

// --- ASCENDENTE: de un lote hacia atrás (de qué leche/lotes se hizo, qué productor).
export const traceProducerSchema = z.object({
  producerId: uuidSchema,
  producerName: z.string(),
  receptionCode: z.string().optional(),
});
export type TraceProducer = z.infer<typeof traceProducerSchema>;

// Nodo de la cadena ascendente: un lote, la orden que lo produjo y los lotes que se
// consumieron en esa orden (recursión hacia atrás), más el productor si es leche origen.
export interface TraceBackwardNode {
  batch: TraceBatch;
  // Origen del lote: productor (si es leche cruda) o la orden que lo produjo.
  producer?: TraceProducer;
  producedBy?: {
    orderId: string;
    orderCode: string;
    // Lotes consumidos en esa orden (recursión ascendente).
    inputs: TraceBackwardNode[];
  };
}

export const traceBackwardNodeSchema: z.ZodType<TraceBackwardNode> = z.lazy(() =>
  z.object({
    batch: traceBatchSchema,
    producer: traceProducerSchema.optional(),
    producedBy: z
      .object({
        orderId: uuidSchema,
        orderCode: z.string(),
        inputs: z.array(traceBackwardNodeSchema),
      })
      .optional(),
  }),
);

export const traceBackwardSchema = traceBackwardNodeSchema;
export type TraceBackward = TraceBackwardNode;

// --- Sugerencia FEFO (solo lectura, no persiste). CLAUDE.md §4.4.
export const fefoAllocationSchema = z.object({
  batchId: uuidSchema,
  batchCode: z.string(),
  take: z.number(),
  expirationDate: isoDateTimeSchema.optional(),
});
export type FefoAllocationDto = z.infer<typeof fefoAllocationSchema>;

export const fefoSuggestionSchema = z.object({
  productId: uuidSchema,
  quantity: z.number(),
  allocations: z.array(fefoAllocationSchema),
  shortage: z.number(), // cantidad que no se pudo cubrir (0 si alcanza el stock)
});
export type FefoSuggestion = z.infer<typeof fefoSuggestionSchema>;

export const stockCountInputSchema = z.object({
  warehouseId: uuidSchema.optional(),
  counts: z
    .array(
      z.object({
        batchId: uuidSchema,
        countedQuantity: z.number().nonnegative(),
      }),
    )
    .min(1),
  notes: z.string().max(1000).optional(),
});
export type StockCountInput = z.infer<typeof stockCountInputSchema>;
