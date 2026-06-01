import {
  buildBackwardTrace,
  buildFefoSuggestion,
  buildForwardTrace,
  type BatchOutEdges,
  type FefoSuggestBatch,
  type TraceGraphReader,
} from './trace-graph';
import type { TraceBatch, TraceDispatch, TraceProducer } from '@lasmarias/shared-schemas';

// Reader en memoria para testear la trazabilidad sin tocar la base.
// Modela el grafo de inventory_movements + milkInputs.
interface Fixture {
  batches: Record<string, TraceBatch>;
  // batchId → orderIds donde se consumió (out/production_order)
  consumedInOrders?: Record<string, string[]>;
  // orderId → batchIds producto (in/production_order)
  orderOutputs?: Record<string, string[]>;
  // batchId producto → orderId que lo produjo
  producingOrder?: Record<string, string>;
  // orderId → batchIds consumidos (milkInputs, TODOS)
  orderInputs?: Record<string, string[]>;
  // batchId → despachos
  dispatches?: Record<string, TraceDispatch[]>;
  // batchId leche → productor
  producers?: Record<string, TraceProducer>;
  orderCodes?: Record<string, string>;
}

function makeReader(f: Fixture): TraceGraphReader & { getOrderCode(id: string): string } {
  return {
    getBatch: (id) => f.batches[id] ?? null,
    getOutEdges: (id): BatchOutEdges => ({
      consumedInOrderIds: f.consumedInOrders?.[id] ?? [],
      dispatches: f.dispatches?.[id] ?? [],
    }),
    getOrderOutputBatchIds: (orderId) => f.orderOutputs?.[orderId] ?? [],
    getProducingOrder: (id) => {
      const orderId = f.producingOrder?.[id];
      if (!orderId) return null;
      return { orderId, orderCode: f.orderCodes?.[orderId] ?? orderId };
    },
    getOrderInputBatchIds: (orderId) => f.orderInputs?.[orderId] ?? [],
    getProducer: (id) => f.producers?.[id] ?? null,
    getOrderCode: (orderId) => f.orderCodes?.[orderId] ?? orderId,
  };
}

function batch(id: string, extra: Partial<TraceBatch> = {}): TraceBatch {
  return {
    id,
    code: id.toUpperCase(),
    productId: null,
    productName: null,
    unit: 'kg',
    quantity: 0,
    isMilk: false,
    ...extra,
  };
}

const disp = (over: Partial<TraceDispatch> = {}): TraceDispatch => ({
  salesOrderId: 'so-1',
  salesOrderCode: 'DSP-000001',
  clientId: 'cli-1',
  clientName: 'Almacén Don José',
  quantity: 5,
  unit: 'kg',
  ...over,
});

describe('trazabilidad ASCENDENTE (multi-padre / fan-in)', () => {
  // Un queso (masa→queso) hecho a partir de DOS lotes de leche distintos.
  // El ascendente desde el queso debe devolver LOS DOS lotes de leche con sus productores.
  it('un producto hecho de 2 lotes de leche devuelve los dos en el ascendente', () => {
    const reader = makeReader({
      batches: {
        queso: batch('queso', { isMilk: false, productName: 'Cremoso' }),
        lecheA: batch('lecheA', { isMilk: true }),
        lecheB: batch('lecheB', { isMilk: true }),
      },
      producingOrder: { queso: 'ORD-1' },
      orderInputs: { 'ORD-1': ['lecheA', 'lecheB'] },
      orderCodes: { 'ORD-1': 'PROD-000001' },
      producers: {
        lecheA: { producerId: 'p-A', producerName: 'Tambo La Esperanza', receptionCode: 'REC-1' },
        lecheB: { producerId: 'p-B', producerName: 'Tambo San Pedro', receptionCode: 'REC-2' },
      },
    });

    const trace = buildBackwardTrace('queso', reader)!;
    expect(trace.batch.id).toBe('queso');
    expect(trace.producedBy?.orderCode).toBe('PROD-000001');
    const inputIds = trace.producedBy!.inputs.map((n) => n.batch.id).sort();
    expect(inputIds).toEqual(['lecheA', 'lecheB']);
    // Cada leche origen trae su productor.
    const productores = trace.producedBy!.inputs
      .map((n) => n.producer?.producerName)
      .sort();
    expect(productores).toEqual(['Tambo La Esperanza', 'Tambo San Pedro']);
    // Las leches no tienen orden productora.
    expect(trace.producedBy!.inputs.every((n) => n.producedBy === undefined)).toBe(true);
  });

  it('resuelve multi-paso leche → masa → mozzarella hacia atrás', () => {
    const reader = makeReader({
      batches: {
        mozza: batch('mozza'),
        masa: batch('masa'),
        leche: batch('leche', { isMilk: true }),
      },
      producingOrder: { mozza: 'ORD-2', masa: 'ORD-1' },
      orderInputs: { 'ORD-2': ['masa'], 'ORD-1': ['leche'] },
      producers: { leche: { producerId: 'p-A', producerName: 'Tambo La Esperanza' } },
    });

    const trace = buildBackwardTrace('mozza', reader)!;
    const masaNode = trace.producedBy!.inputs[0]!;
    expect(masaNode.batch.id).toBe('masa');
    const lecheNode = masaNode.producedBy!.inputs[0]!;
    expect(lecheNode.batch.id).toBe('leche');
    expect(lecheNode.producer?.producerName).toBe('Tambo La Esperanza');
  });
});

describe('trazabilidad DESCENDENTE (fan-out)', () => {
  // 1 lote de leche → orden → 2 productos → cada uno despachado a un cliente distinto.
  it('1 leche → 2 productos → 2 clientes, el descendente lista ambos', () => {
    const reader = makeReader({
      batches: {
        leche: batch('leche', { isMilk: true }),
        quesoA: batch('quesoA'),
        ricotaB: batch('ricotaB'),
      },
      consumedInOrders: { leche: ['ORD-1'] },
      orderOutputs: { 'ORD-1': ['quesoA', 'ricotaB'] },
      orderCodes: { 'ORD-1': 'PROD-000001' },
      dispatches: {
        quesoA: [disp({ salesOrderCode: 'DSP-1', clientName: 'Almacén Don José' })],
        ricotaB: [disp({ salesOrderCode: 'DSP-2', clientName: 'Supermercado Sur' })],
      },
    });

    const trace = buildForwardTrace('leche', reader)!;
    expect(trace.batch.id).toBe('leche');
    expect(trace.productionOrders).toHaveLength(1);
    const outputs = trace.productionOrders[0]!.outputs;
    expect(outputs.map((o) => o.batch.id).sort()).toEqual(['quesoA', 'ricotaB']);
    const clientes = outputs
      .flatMap((o) => o.dispatches.map((d) => d.clientName))
      .sort();
    expect(clientes).toEqual(['Almacén Don José', 'Supermercado Sur']);
  });

  it('un lote despachado directo lista el despacho con cliente y cantidad', () => {
    const reader = makeReader({
      batches: { queso: batch('queso') },
      dispatches: { queso: [disp({ quantity: 12, clientName: 'Rotisería El Buen Gusto' })] },
    });
    const trace = buildForwardTrace('queso', reader)!;
    expect(trace.dispatches).toHaveLength(1);
    expect(trace.dispatches[0]!.quantity).toBe(12);
    expect(trace.dispatches[0]!.clientName).toBe('Rotisería El Buen Gusto');
  });
});

describe('protección contra ciclos', () => {
  it('ascendente: un ciclo A→B→A no entra en loop infinito', () => {
    const reader = makeReader({
      batches: { a: batch('a'), b: batch('b') },
      // a producido por ORD-A que consume b; b producido por ORD-B que consume a (ciclo).
      producingOrder: { a: 'ORD-A', b: 'ORD-B' },
      orderInputs: { 'ORD-A': ['b'], 'ORD-B': ['a'] },
    });
    const trace = buildBackwardTrace('a', reader)!;
    const bNode = trace.producedBy!.inputs[0]!;
    expect(bNode.batch.id).toBe('b');
    // b vuelve a 'a' pero como ya fue visitado, se corta sin recursar.
    const aAgain = bNode.producedBy!.inputs[0]!;
    expect(aAgain.batch.id).toBe('a');
    expect(aAgain.producedBy).toBeUndefined();
  });

  it('descendente: un ciclo A→B→A no entra en loop infinito', () => {
    const reader = makeReader({
      batches: { a: batch('a'), b: batch('b') },
      consumedInOrders: { a: ['ORD-A'], b: ['ORD-B'] },
      orderOutputs: { 'ORD-A': ['b'], 'ORD-B': ['a'] },
    });
    const trace = buildForwardTrace('a', reader)!;
    const bNode = trace.productionOrders[0]!.outputs[0]!;
    expect(bNode.batch.id).toBe('b');
    const aAgain = bNode.productionOrders[0]!.outputs[0]!;
    expect(aAgain.batch.id).toBe('a');
    // Cortado: no vuelve a expandir órdenes.
    expect(aAgain.productionOrders).toEqual([]);
  });
});

describe('sugerencia FEFO', () => {
  const batches: FefoSuggestBatch[] = [
    { id: 'b1', code: 'L-001', remaining: 10, expirationDate: '2026-06-01T00:00:00.000Z' }, // vence antes
    { id: 'b2', code: 'L-002', remaining: 20, expirationDate: '2026-06-10T00:00:00.000Z' },
  ];

  it('toma primero el lote que vence antes y completa con el siguiente', () => {
    const r = buildFefoSuggestion(25, batches);
    expect(r.shortage).toBe(0);
    expect(r.allocations).toEqual([
      { batchId: 'b1', batchCode: 'L-001', take: 10, expirationDate: '2026-06-01T00:00:00.000Z' },
      { batchId: 'b2', batchCode: 'L-002', take: 15, expirationDate: '2026-06-10T00:00:00.000Z' },
    ]);
  });

  it('reporta faltante cuando no alcanza', () => {
    const r = buildFefoSuggestion(50, batches);
    expect(r.shortage).toBe(20);
    expect(r.allocations.map((a) => a.take)).toEqual([10, 20]);
  });

  it('cubre con un solo lote sin tocar el resto', () => {
    const r = buildFefoSuggestion(8, batches);
    expect(r.shortage).toBe(0);
    expect(r.allocations).toEqual([
      { batchId: 'b1', batchCode: 'L-001', take: 8, expirationDate: '2026-06-01T00:00:00.000Z' },
    ]);
  });
});
