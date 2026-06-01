import {
  computeElaborationCost,
  computeElaborationVariance,
  type ElaborationCostInput,
} from './elaboration-cost';

// =============================================================================
// Batería de tests de QA — Calculadora de costo de elaboración (CLAUDE.md §5).
//
// Cada caso tiene su aritmética verificada A MANO en los comentarios. Los valores
// esperados son DECIMALES EXACTOS (string). Reglas de redondeo (half-up):
//   - Montos en $:           2 decimales   → "319050.00"
//   - Costo unitario $/kg:   4 decimales   → "3358.4211"
//   - Rendimiento kg/litro:  4 decimales   → "0.0950"
//   - Porcentajes de desvío: 4 decimales   → "5.6107"
//
// NOTA: hoy `computeElaborationCost` es un stub que lanza NOT_IMPLEMENTED, así que
// TODA esta batería está en ROJO a propósito. La implementación (paso 3) la pone
// en verde sin tocar estos números.
// =============================================================================

describe('computeElaborationCost', () => {
  // ---------------------------------------------------------------------------
  // CASO 1 — Lote normal completo (queso "Pategrás") con subproducto suero.
  //
  // Receta v1: rendimiento esperado 0,10 kg/litro.
  //   primaryInput  Leche      $300/litro
  //   insumos:      Fermento   $20/litro   (per_liter_milk, q=1)
  //                 Cuajo      $8/litro    (per_liter_milk, q=1)
  //                 Sal        $50/kg      (per_kg_product, q=1)
  //                 ManoObra   $40/kg      (per_kg_product, q=1)
  //                 Energía    $5/litro    (per_liter_milk, q=1)
  //                 Envase     $1500 fijo  (fixed_per_order, q=1)
  //   subproducto:  Suero      0,85 kg/litro, recupero $30/kg
  //
  // Lote REAL: litros=1000, kg_producto=95, suero_real=800.
  //   Leche:    1×1000 × 300 = 300000.00   (costoInputs)
  //   Fermento: 1×1000 × 20  =  20000.00
  //   Cuajo:    1×1000 × 8   =   8000.00
  //   Sal:      1×95   × 50  =   4750.00
  //   ManoObra: 1×95   × 40  =   3800.00
  //   Energía:  1×1000 × 5   =   5000.00
  //   Envase:   1      × 1500=   1500.00
  //   costoInsumos = 20000+8000+4750+3800+5000+1500 = 43050.00
  //   costoBruto   = 300000 + 43050 = 343050.00
  //   valorSubprod = 800 × 30 = 24000.00
  //   costoNeto    = 343050 − 24000 = 319050.00
  //   rendimiento  = 95 / 1000 = 0.0950
  //   costoPorKg   = 319050 / 95 = 3358.42105… → 3358.4211
  // ---------------------------------------------------------------------------
  const recetaPategras = {
    primaryInputs: [{ name: 'Leche', unitCost: '300' }],
    ingredients: [
      { name: 'Fermento', quantity: '1', unitCost: '20', basis: 'per_liter_milk' as const },
      { name: 'Cuajo', quantity: '1', unitCost: '8', basis: 'per_liter_milk' as const },
      { name: 'Sal', quantity: '1', unitCost: '50', basis: 'per_kg_product' as const },
      { name: 'Mano de obra', quantity: '1', unitCost: '40', basis: 'per_kg_product' as const },
      { name: 'Energía', quantity: '1', unitCost: '5', basis: 'per_liter_milk' as const },
      { name: 'Envase', quantity: '1', unitCost: '1500', basis: 'fixed_per_order' as const },
    ],
  };

  const caso1Real: ElaborationCostInput = {
    mode: 'real',
    litros: '1000',
    productKg: '95',
    primaryInputs: [{ name: 'Leche', quantity: '1000', unitCost: '300' }],
    ingredients: recetaPategras.ingredients,
    byproducts: [{ name: 'Suero', quantity: '800', valorRecupero: '30' }],
  };

  it('caso 1 — lote normal: cada línea verificada a mano', () => {
    const r = computeElaborationCost(caso1Real);
    expect(r.costoInputs).toBe('300000.00');
    expect(r.costoInsumos).toBe('43050.00');
    expect(r.costoBruto).toBe('343050.00');
    expect(r.valorSubproductos).toBe('24000.00');
    expect(r.costoNeto).toBe('319050.00');
    expect(r.rendimiento).toBe('0.0950');
    expect(r.costoPorKg).toBe('3358.4211');
    expect(r.warnings).toEqual([]);
  });

  // CASO 1 estándar: litros=1000, kg_esperado=0,10×1000=100, suero esperado=0,85×1000=850.
  //   Sal:      1×100 × 50 = 5000 ; ManoObra: 1×100 × 40 = 4000
  //   costoInsumos = 20000+8000+5000+4000+5000+1500 = 43500.00
  //   costoBruto   = 343500.00 ; valorSubprod = 850×30 = 25500.00
  //   costoNeto    = 318000.00 ; rendimiento = 100/1000 = 0.1000
  //   costoPorKg   = 318000/100 = 3180.0000
  const caso1Estandar: ElaborationCostInput = {
    mode: 'estandar',
    litros: '1000',
    productKg: '100',
    primaryInputs: [{ name: 'Leche', quantity: '1000', unitCost: '300' }],
    ingredients: recetaPategras.ingredients,
    byproducts: [{ name: 'Suero', quantity: '850', valorRecupero: '30' }],
  };

  it('caso 1 — costo estándar de la misma receta', () => {
    const r = computeElaborationCost(caso1Estandar);
    expect(r.costoInsumos).toBe('43500.00');
    expect(r.costoNeto).toBe('318000.00');
    expect(r.rendimiento).toBe('0.1000');
    expect(r.costoPorKg).toBe('3180.0000');
  });

  it('caso 1 — desvíos real vs estándar ($ y %)', () => {
    const estandar = computeElaborationCost(caso1Estandar);
    const real = computeElaborationCost(caso1Real);
    const v = computeElaborationVariance(estandar, real);
    // costo_neto: 319050 − 318000 = +1050 ; 1050/318000 = +0,3302 %
    expect(v.desvioCostoNeto).toBe('1050.00');
    expect(v.desvioCostoNetoPct).toBe('0.3302');
    // costo/kg: 3358.4211 − 3180 = +178.4211 ; /3180 = +5,6107 %
    expect(v.desvioCostoPorKg).toBe('178.4211');
    expect(v.desvioCostoPorKgPct).toBe('5.6107');
    // rendimiento: 0,0950 − 0,1000 = −0,0050 ; −5,0000 %
    expect(v.desvioRendimiento).toBe('-0.0050');
    expect(v.desvioRendimientoPct).toBe('-5.0000');
  });

  // ---------------------------------------------------------------------------
  // CASO 2 — Lote sin subproductos: costo_neto = costo_insumos (+ inputs).
  //   "Ricota simple": Leche $300/litro ; Sal $50/kg (per_kg, q=1). Sin subproductos.
  //   Lote: litros=100, kg=20.
  //   Leche: 100×300 = 30000.00 ; Sal: 20×50 = 1000.00
  //   costoInsumos=1000.00 ; bruto=31000.00 ; subprod=0.00 ; neto=31000.00
  //   costoPorKg = 31000/20 = 1550.0000 ; rendimiento = 20/100 = 0.2000
  // ---------------------------------------------------------------------------
  it('caso 2 — sin subproductos: costo neto = bruto, crédito 0', () => {
    const r = computeElaborationCost({
      mode: 'real',
      litros: '100',
      productKg: '20',
      primaryInputs: [{ name: 'Leche', quantity: '100', unitCost: '300' }],
      ingredients: [{ name: 'Sal', quantity: '1', unitCost: '50', basis: 'per_kg_product' }],
      byproducts: [],
    });
    expect(r.valorSubproductos).toBe('0.00');
    expect(r.costoBruto).toBe('31000.00');
    expect(r.costoNeto).toBe('31000.00');
    expect(r.costoPorKg).toBe('1550.0000');
    expect(r.rendimiento).toBe('0.2000');
  });

  // ---------------------------------------------------------------------------
  // CASO 3 — kg_producto = 0: no divide por cero, avisa.
  //   Lote: litros=100, kg=0, sin subproductos. Leche 100×300=30000 ; Sal 0×50=0.
  //   bruto=neto=30000.00 ; costoPorKg = null + KG_PRODUCTO_CERO.
  //   rendimiento = 0/100 = 0.0000 (litros válidos).
  // ---------------------------------------------------------------------------
  it('caso 3 — kg_producto = 0: costoPorKg null + advertencia, no rompe', () => {
    const r = computeElaborationCost({
      mode: 'real',
      litros: '100',
      productKg: '0',
      primaryInputs: [{ name: 'Leche', quantity: '100', unitCost: '300' }],
      ingredients: [{ name: 'Sal', quantity: '1', unitCost: '50', basis: 'per_kg_product' }],
      byproducts: [],
    });
    expect(r.costoNeto).toBe('30000.00');
    expect(r.costoPorKg).toBeNull();
    expect(r.rendimiento).toBe('0.0000');
    expect(r.warnings).toContain('KG_PRODUCTO_CERO');
  });

  // ---------------------------------------------------------------------------
  // CASO 4 — Cambio de versión: un lote viejo conserva los costos de SU versión.
  //   v1: Leche $300/litro. Lote viejo litros=100, kg=10 → 30000/10 = 3000.0000
  //   v2: Leche $360/litro (suba posterior). Lote nuevo litros=100, kg=10 → 3600.0000
  //   El cálculo usa SIEMPRE los datos de la versión referenciada por el lote.
  // ---------------------------------------------------------------------------
  it('caso 4 — inmutabilidad por versión de receta', () => {
    const loteViejoConV1 = computeElaborationCost({
      mode: 'real',
      litros: '100',
      productKg: '10',
      primaryInputs: [{ name: 'Leche', quantity: '100', unitCost: '300' }],
      ingredients: [],
      byproducts: [],
    });
    const loteNuevoConV2 = computeElaborationCost({
      mode: 'real',
      litros: '100',
      productKg: '10',
      primaryInputs: [{ name: 'Leche', quantity: '100', unitCost: '360' }],
      ingredients: [],
      byproducts: [],
    });
    expect(loteViejoConV1.costoPorKg).toBe('3000.0000');
    expect(loteNuevoConV2.costoPorKg).toBe('3600.0000');
  });

  // ---------------------------------------------------------------------------
  // CASO 5 — Insumo "fijo por orden" NO escala con litros ni kg.
  //   Receta: Leche $300/litro + Setup $1500 fijo.
  //   Lote A (chico): litros=100, kg=10  → Leche 30000 + fijo 1500 = 31500 ; /10  = 3150.0000
  //   Lote B (grande):litros=1000,kg=100 → Leche 300000+ fijo 1500 = 301500; /100 = 3015.0000
  //   El componente fijo es 1500.00 en ambos (no cambia).
  // ---------------------------------------------------------------------------
  it('caso 5 — el insumo fijo no escala con el tamaño del lote', () => {
    const fijo = { name: 'Setup', quantity: '1', unitCost: '1500', basis: 'fixed_per_order' as const };
    const loteA = computeElaborationCost({
      mode: 'real', litros: '100', productKg: '10',
      primaryInputs: [{ name: 'Leche', quantity: '100', unitCost: '300' }],
      ingredients: [fijo], byproducts: [],
    });
    const loteB = computeElaborationCost({
      mode: 'real', litros: '1000', productKg: '100',
      primaryInputs: [{ name: 'Leche', quantity: '1000', unitCost: '300' }],
      ingredients: [fijo], byproducts: [],
    });
    // El fijo aporta lo mismo en ambos: costoInsumos = 1500.00 en los dos.
    expect(loteA.costoInsumos).toBe('1500.00');
    expect(loteB.costoInsumos).toBe('1500.00');
    expect(loteA.costoPorKg).toBe('3150.0000');
    expect(loteB.costoPorKg).toBe('3015.0000');
  });

  // ---------------------------------------------------------------------------
  // CASO 6 — Insumo con costo unitario 0: aparece con $0, no rompe ni se filtra.
  //   Leche $300/litro + Agua $0/litro (per_litro, q=1). Lote litros=100, kg=20.
  //   costoInsumos = 100×0 = 0.00 ; bruto = 30000.00 ; costoPorKg = 30000/20 = 1500.0000
  // ---------------------------------------------------------------------------
  it('caso 6 — insumo con costo unitario 0 no altera el total', () => {
    const r = computeElaborationCost({
      mode: 'real', litros: '100', productKg: '20',
      primaryInputs: [{ name: 'Leche', quantity: '100', unitCost: '300' }],
      ingredients: [{ name: 'Agua', quantity: '1', unitCost: '0', basis: 'per_liter_milk' }],
      byproducts: [],
    });
    expect(r.costoInsumos).toBe('0.00');
    expect(r.costoBruto).toBe('30000.00');
    expect(r.costoPorKg).toBe('1500.0000');
  });

  // ---------------------------------------------------------------------------
  // CASO 7 — litros = 0: rendimiento null, costoPorKg null, costo fijo SÍ se reporta.
  //   Receta caso 1 ; litros=0, kg=0. Todo per_litro y per_kg = 0; queda el fijo 1500.
  //   bruto = neto = 1500.00 ; rendimiento = null (LITROS_CERO) ; costoPorKg = null (KG_PRODUCTO_CERO)
  // ---------------------------------------------------------------------------
  it('caso 7 — litros = 0: no devuelve NaN/Infinity, avisa y reporta el fijo', () => {
    const r = computeElaborationCost({
      mode: 'real', litros: '0', productKg: '0',
      primaryInputs: [{ name: 'Leche', quantity: '0', unitCost: '300' }],
      ingredients: recetaPategras.ingredients,
      byproducts: [{ name: 'Suero', quantity: '0', valorRecupero: '30' }],
    });
    expect(r.costoNeto).toBe('1500.00');
    expect(r.rendimiento).toBeNull();
    expect(r.costoPorKg).toBeNull();
    expect(r.warnings).toEqual(expect.arrayContaining(['LITROS_CERO', 'KG_PRODUCTO_CERO']));
  });

  // ---------------------------------------------------------------------------
  // CASO 8 — Subproducto esperado pero kg real = 0 (se descartó el suero ese día).
  //   Receta caso 1 ; litros=1000, kg=100, suero_real=0.
  //   costoInsumos = 43500.00 (kg=100) ; bruto = 343500.00 ; crédito = 0×30 = 0.00
  //   neto = 343500.00 ; costoPorKg = 343500/100 = 3435.0000
  // ---------------------------------------------------------------------------
  it('caso 8 — subproducto con kg real 0: crédito 0, costo no recuperado', () => {
    const r = computeElaborationCost({
      mode: 'real', litros: '1000', productKg: '100',
      primaryInputs: [{ name: 'Leche', quantity: '1000', unitCost: '300' }],
      ingredients: recetaPategras.ingredients,
      byproducts: [{ name: 'Suero', quantity: '0', valorRecupero: '30' }],
    });
    expect(r.valorSubproductos).toBe('0.00');
    expect(r.costoNeto).toBe('343500.00');
    expect(r.costoPorKg).toBe('3435.0000');
  });

  // ---------------------------------------------------------------------------
  // CASO 9 — Recupero MAYOR al costo → costo neto NEGATIVO (no se clampea a 0).
  //   Leche $100/litro ; Crema premium recupero $300/kg.
  //   Lote: litros=100, kg=10, crema_real=50.
  //   costoInputs = 100×100 = 10000.00 ; subprod = 50×300 = 15000.00
  //   neto = 10000 − 15000 = −5000.00 ; costoPorKg = −5000/10 = −500.0000
  //   + advertencia COSTO_NETO_NEGATIVO.
  // ---------------------------------------------------------------------------
  it('caso 9 — costo neto negativo: NO se clampea a 0', () => {
    const r = computeElaborationCost({
      mode: 'real', litros: '100', productKg: '10',
      primaryInputs: [{ name: 'Leche', quantity: '100', unitCost: '100' }],
      ingredients: [],
      byproducts: [{ name: 'Crema', quantity: '50', valorRecupero: '300' }],
    });
    expect(r.valorSubproductos).toBe('15000.00');
    expect(r.costoNeto).toBe('-5000.00');
    expect(r.costoPorKg).toBe('-500.0000');
    expect(r.warnings).toContain('COSTO_NETO_NEGATIVO');
  });

  // ---------------------------------------------------------------------------
  // CASO 10 — Precisión DECIMAL exacta (no float binario).
  //   10a: Aditivo A $0,10/kg + Aditivo B $0,20/kg (per_kg, q=1), kg=1.
  //        0.10 + 0.20 = 0.30 EXACTO (no 0.30000000000000004).
  //   10c: Insumo $12,345/litro × 1000 litros = 12345.00 exacto.
  // ---------------------------------------------------------------------------
  it('caso 10a — 0.10 + 0.20 = 0.30 exacto (bloqueante: prohibido float binario)', () => {
    const r = computeElaborationCost({
      mode: 'real', litros: '10', productKg: '1',
      primaryInputs: [],
      ingredients: [
        { name: 'Aditivo A', quantity: '1', unitCost: '0.10', basis: 'per_kg_product' },
        { name: 'Aditivo B', quantity: '1', unitCost: '0.20', basis: 'per_kg_product' },
      ],
      byproducts: [],
    });
    expect(r.costoInsumos).toBe('0.30');
  });

  it('caso 10c — multiplicación con muchos decimales: 12.345 × 1000 = 12345.00', () => {
    const r = computeElaborationCost({
      mode: 'real', litros: '1000', productKg: '100',
      primaryInputs: [],
      ingredients: [{ name: 'Especial', quantity: '1', unitCost: '12.345', basis: 'per_liter_milk' }],
      byproducts: [],
    });
    expect(r.costoInsumos).toBe('12345.00');
  });

  // ---------------------------------------------------------------------------
  // CASO 11 — Subproducto sin valor de recupero (destino descarte) → crédito 0.
  //   Receta caso 1 ; suero con valorRecupero = null. litros=1000, kg=100, suero=800.
  //   valorSubproductos = 0.00 ; neto = bruto = 343500.00
  // ---------------------------------------------------------------------------
  it('caso 11 — subproducto sin valor de recupero: crédito 0, no NaN', () => {
    const r = computeElaborationCost({
      mode: 'real', litros: '1000', productKg: '100',
      primaryInputs: [{ name: 'Leche', quantity: '1000', unitCost: '300' }],
      ingredients: recetaPategras.ingredients,
      byproducts: [{ name: 'Suero', quantity: '800', valorRecupero: null }],
    });
    expect(r.valorSubproductos).toBe('0.00');
    expect(r.costoNeto).toBe('343500.00');
  });

  // ---------------------------------------------------------------------------
  // CASO 12 — Cantidad de receta ≠ 1: la quantity multiplica a la base.
  //   Sal: quantity 0,02 kg por kg de producto, $50/kg.    → 0,02×100 = 2 kg × 50 = 100.00
  //   Fermento: quantity 0,005 litro por litro, $400/litro.→ 0,005×1000 = 5 l × 400 = 2000.00
  //   Lote: litros=1000, kg=100. costoInsumos = 100 + 2000 = 2100.00
  // ---------------------------------------------------------------------------
  it('caso 12 — la cantidad de receta (≠1) escala correctamente con la base', () => {
    const r = computeElaborationCost({
      mode: 'real', litros: '1000', productKg: '100',
      primaryInputs: [],
      ingredients: [
        { name: 'Sal', quantity: '0.02', unitCost: '50', basis: 'per_kg_product' },
        { name: 'Fermento', quantity: '0.005', unitCost: '400', basis: 'per_liter_milk' },
      ],
      byproducts: [],
    });
    expect(r.costoInsumos).toBe('2100.00');
  });
});
