import type { ProductionCostBreakdown, SalesOrderLine } from '@lasmarias/shared-schemas';
import {
  aggregateSalesByProduct,
  buildYieldRow,
  computeMargin,
  type CostRow,
  type RevenueRow,
} from './reports.helpers';

function line(partial: Partial<SalesOrderLine>): SalesOrderLine {
  return {
    productId: 'p1',
    productName: 'Queso Cremoso',
    sku: 'QC',
    quantity: 1,
    unitPrice: 100,
    unit: 'kg',
    subtotal: 100,
    ...partial,
  };
}

describe('aggregateSalesByProduct', () => {
  it('suma cantidad y subtotal por producto a través de varias órdenes', () => {
    const result = aggregateSalesByProduct([
      [line({ productId: 'a', productName: 'Cremoso', quantity: 2, subtotal: 200 })],
      [
        line({ productId: 'a', productName: 'Cremoso', quantity: 3, subtotal: 300 }),
        line({ productId: 'b', productName: 'Ricota', quantity: 1, subtotal: 50 }),
      ],
    ]);

    expect(result).toEqual([
      { productId: 'a', productName: 'Cremoso', quantity: 5, subtotal: 500 },
      { productId: 'b', productName: 'Ricota', quantity: 1, subtotal: 50 },
    ]);
  });

  it('ordena por subtotal descendente', () => {
    const result = aggregateSalesByProduct([
      [
        line({ productId: 'a', productName: 'A', subtotal: 10 }),
        line({ productId: 'b', productName: 'B', subtotal: 90 }),
      ],
    ]);
    expect(result.map((r) => r.productId)).toEqual(['b', 'a']);
  });

  it('devuelve vacío sin líneas', () => {
    expect(aggregateSalesByProduct([])).toEqual([]);
    expect(aggregateSalesByProduct([[]])).toEqual([]);
  });
});

describe('buildYieldRow', () => {
  const cb: ProductionCostBreakdown = {
    real: {
      costoInputs: '1000',
      costoInsumos: '100',
      costoBruto: '1100',
      valorSubproductos: '100',
      costoNeto: '1000',
      rendimiento: '0.095',
      costoPorKg: '105.26',
      warnings: [],
    },
    estandar: {
      costoInputs: '1000',
      costoInsumos: '100',
      costoBruto: '1100',
      valorSubproductos: '100',
      costoNeto: '1000',
      rendimiento: '0.1',
      costoPorKg: '100',
      warnings: [],
    },
    variance: {
      desvioCostoNeto: '0',
      desvioCostoNetoPct: null,
      desvioCostoPorKg: '5.26',
      desvioCostoPorKgPct: '5.26',
      desvioRendimiento: '-0.005',
      desvioRendimientoPct: '-5',
    },
  };

  it('reusa los valores del costBreakdown sin recalcular', () => {
    const row = buildYieldRow({
      orderCode: 'OP-001',
      productName: 'Queso Cremoso',
      totalMilkLiters: '1000',
      totalPrincipalKg: '95',
      costBreakdown: cb,
    });

    expect(row).toEqual({
      orderCode: 'OP-001',
      productName: 'Queso Cremoso',
      litros: 1000,
      kgReal: 95,
      rendimientoReal: 0.095,
      rendimientoEsperado: 0.1,
      desvioRendimiento: -0.005,
      desvioRendimientoPct: -5,
    });
  });

  it('tolera costBreakdown nulo dejando los rendimientos en null', () => {
    const row = buildYieldRow({
      orderCode: 'OP-002',
      productName: 'Ricota',
      totalMilkLiters: '500',
      totalPrincipalKg: null,
      costBreakdown: null,
    });

    expect(row).toEqual({
      orderCode: 'OP-002',
      productName: 'Ricota',
      litros: 500,
      kgReal: 0,
      rendimientoReal: null,
      rendimientoEsperado: null,
      desvioRendimiento: null,
      desvioRendimientoPct: null,
    });
  });
});

describe('computeMargin', () => {
  it('calcula margen y % por cliente, neteando notas de crédito', () => {
    const revenue: RevenueRow[] = [
      { clientId: 'c1', clientName: 'Cliente 1', revenue: 1000, creditNotes: 100 },
    ];
    const cost: CostRow[] = [
      { clientId: 'c1', quantity: 10, unitCost: 50 }, // 500
      { clientId: 'c1', quantity: 2, unitCost: 25 }, // 50
    ];
    const rows = computeMargin(revenue, cost);
    expect(rows[0]).toEqual({
      clientId: 'c1',
      clientName: 'Cliente 1',
      revenue: 900, // 1000 − 100 NC
      cost: 550,
      margin: 350,
      marginPct: 38.8889,
      hasMissingCost: false,
    });
  });

  it('marca hasMissingCost cuando un lote no tiene unitCost (no asume 0)', () => {
    const rows = computeMargin(
      [{ clientId: 'c1', clientName: 'C1', revenue: 500 }],
      [
        { clientId: 'c1', quantity: 5, unitCost: 40 }, // 200
        { clientId: 'c1', quantity: 3, unitCost: null }, // sin costo
      ],
    );
    expect(rows[0]?.cost).toBe(200);
    expect(rows[0]?.hasMissingCost).toBe(true);
    expect(rows[0]?.margin).toBe(300);
  });

  it('marginPct null cuando revenue es 0', () => {
    const rows = computeMargin(
      [{ clientId: 'c1', clientName: 'C1', revenue: 0 }],
      [{ clientId: 'c1', quantity: 1, unitCost: 10 }],
    );
    expect(rows[0]?.revenue).toBe(0);
    expect(rows[0]?.marginPct).toBeNull();
    expect(rows[0]?.margin).toBe(-10);
  });

  it('ordena por margen descendente', () => {
    const rows = computeMargin(
      [
        { clientId: 'a', clientName: 'A', revenue: 100 },
        { clientId: 'b', clientName: 'B', revenue: 1000 },
      ],
      [],
    );
    expect(rows.map((r) => r.clientId)).toEqual(['b', 'a']);
  });
});
