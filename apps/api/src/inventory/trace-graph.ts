import type {
  TraceBackwardNode,
  TraceBatch,
  TraceDispatch,
  TraceForwardNode,
  TraceProducer,
} from '@lasmarias/shared-schemas';

// Lógica pura de trazabilidad bidireccional (CLAUDE.md §4.4).
//
// Se recorre el grafo de inventory_movements, NO la columna parent_batch_id, para que:
//  - DESCENDENTE: un lote → órdenes donde se consumió → lotes producto → (recursión).
//  - ASCENDENTE: un lote → orden que lo produjo → lotes consumidos (multi-padre) → (recursión).
//
// La fuente de datos se abstrae en TraceGraphReader para poder testear sin tocar la base.
// La protección contra ciclos usa un set de batchIds visitados.

// Aristas que salen de un lote, derivadas de inventory_movements.
export interface BatchOutEdges {
  // Órdenes de producción donde se consumió el lote (movimientos out/production_order).
  consumedInOrderIds: string[];
  // Despachos del lote a clientes (movimientos con reference_type='sales_order').
  dispatches: TraceDispatch[];
}

export interface TraceGraphReader {
  // Datos del lote para armar el nodo. null si no existe.
  getBatch(batchId: string): TraceBatch | null;
  // DESCENDENTE: qué se hizo con este lote.
  getOutEdges(batchId: string): BatchOutEdges;
  // DESCENDENTE: lotes producto que salieron de una orden (movimientos in/production_order).
  getOrderOutputBatchIds(orderId: string): string[];
  // ASCENDENTE: orden que produjo este lote (movimiento in/production_order), o null si es origen.
  getProducingOrder(batchId: string): { orderId: string; orderCode: string } | null;
  // ASCENDENTE: lotes consumidos en una orden (milkInputs — TODOS los lotes consumidos).
  getOrderInputBatchIds(orderId: string): string[];
  // ASCENDENTE: productor de un lote de leche cruda (vía recepción), o null si no aplica.
  getProducer(batchId: string): TraceProducer | null;
}

// Código de orden auxiliar para el descendente (las aristas solo traen el id).
export interface OrderCodeLookup {
  getOrderCode(orderId: string): string;
}

export function buildForwardTrace(
  batchId: string,
  reader: TraceGraphReader & OrderCodeLookup,
): TraceForwardNode | null {
  return walkForward(batchId, reader, new Set<string>());
}

function walkForward(
  batchId: string,
  reader: TraceGraphReader & OrderCodeLookup,
  visited: Set<string>,
): TraceForwardNode | null {
  const batch = reader.getBatch(batchId);
  if (!batch) return null;
  // Protección contra ciclos: si ya lo visitamos, devolvemos el nodo "hoja" sin recursar.
  if (visited.has(batchId)) {
    return { batch, productionOrders: [], dispatches: [] };
  }
  visited.add(batchId);

  const edges = reader.getOutEdges(batchId);
  const productionOrders = edges.consumedInOrderIds.map((orderId) => {
    const outputs: TraceForwardNode[] = [];
    for (const outBatchId of reader.getOrderOutputBatchIds(orderId)) {
      const child = walkForward(outBatchId, reader, visited);
      if (child) outputs.push(child);
    }
    return { orderId, orderCode: reader.getOrderCode(orderId), outputs };
  });

  return { batch, productionOrders, dispatches: edges.dispatches };
}

export function buildBackwardTrace(
  batchId: string,
  reader: TraceGraphReader,
): TraceBackwardNode | null {
  return walkBackward(batchId, reader, new Set<string>());
}

function walkBackward(
  batchId: string,
  reader: TraceGraphReader,
  visited: Set<string>,
): TraceBackwardNode | null {
  const batch = reader.getBatch(batchId);
  if (!batch) return null;
  if (visited.has(batchId)) {
    return { batch };
  }
  visited.add(batchId);

  const producingOrder = reader.getProducingOrder(batchId);
  if (!producingOrder) {
    // Lote origen (leche cruda): adjuntamos el productor si lo hay.
    const producer = reader.getProducer(batchId);
    return producer ? { batch, producer } : { batch };
  }

  const inputs: TraceBackwardNode[] = [];
  for (const inputBatchId of reader.getOrderInputBatchIds(producingOrder.orderId)) {
    const parent = walkBackward(inputBatchId, reader, visited);
    if (parent) inputs.push(parent);
  }

  return {
    batch,
    producedBy: {
      orderId: producingOrder.orderId,
      orderCode: producingOrder.orderCode,
      inputs,
    },
  };
}

// --- Sugerencia FEFO pura: dada la cantidad y los lotes ordenados por vencimiento
// (más próximo primero), arma las asignaciones y el faltante. No persiste nada.
export interface FefoSuggestBatch {
  id: string;
  code: string;
  remaining: number;
  expirationDate?: string;
}

export interface FefoSuggestResult {
  allocations: Array<{ batchId: string; batchCode: string; take: number; expirationDate?: string }>;
  shortage: number;
}

export function buildFefoSuggestion(
  quantity: number,
  batches: FefoSuggestBatch[],
): FefoSuggestResult {
  let pending = quantity;
  const allocations: FefoSuggestResult['allocations'] = [];
  for (const batch of batches) {
    if (pending <= 0) break;
    if (batch.remaining <= 0) continue;
    const take = Math.min(batch.remaining, pending);
    allocations.push({
      batchId: batch.id,
      batchCode: batch.code,
      take,
      expirationDate: batch.expirationDate,
    });
    pending -= take;
  }
  return { allocations, shortage: Math.max(0, pending) };
}
