import { baseDelMes, cobertura, computeFixedCosts, mesEnUso, promedioLitros } from './fixed-cost-calculator';
import { avisosAlConfirmar, cuotaDe, gastosGrandesDeUnMes, cuotasDelMes, saveFixedCostMonthInputSchema, sinCubrirDelPeriodo, sumarMeses } from '@lasmarias/shared-schemas';

// Todo verificable a mano.

describe('computeFixedCosts', () => {
  const lines = [
    { tipo: 'Luz', datos: [{ campo: 'Factura', valor: '0001-4567' }], monto: 4_500_000 },
    { monto: 3_200_000.5 },
    { tipo: 'Sueldo', datos: [{ campo: 'Empleado', valor: 'Juan' }], monto: 1_450_000 },
    { tipo: 'Sueldo', datos: [{ campo: 'Empleado', valor: 'Ana' }], monto: 1_160_000 },
    { monto: 200_000 },
  ];

  it('mes normal: total y $/litro', () => {
    const r = computeFixedCosts(lines, '382404');
    expect(r.total).toBe('10510000.50');
    // 10.510.000,50 / 382.404 = 27,48401…
    expect(r.costoPorLitro).toBe('27.4840');
  });

  it('ejemplo del dueño: $30.000.000 / 382.404 L = $78,4511 por litro', () => {
    expect(computeFixedCosts([{ monto: 30_000_000 }], 382404).costoPorLitro).toBe('78.4511');
  });

  it('decimal exacto: 0,10 + 0,20 = 0,30', () => {
    expect(computeFixedCosts([{ monto: 0.1 }, { monto: 0.2 }], 1).total).toBe('0.30');
  });

  it('mes sin litros: no divide por cero', () => {
    const r = computeFixedCosts(lines, 0);
    expect(r.total).toBe('10510000.50');
    expect(r.costoPorLitro).toBeNull();
  });

  it('mes vacío: todo en 0', () => {
    const r = computeFixedCosts([], 1000);
    expect(r.total).toBe('0.00');
    expect(r.costoPorLitro).toBe('0.0000');
  });
});

describe('repartir en N meses (aguinaldo)', () => {
  it('$6.000.000 en 6 meses → $1.000.000 cada mes, exacto', () => {
    expect([1, 2, 3, 4, 5, 6].map((k) => cuotaDe(6_000_000, 6, k))).toEqual(Array(6).fill('1000000.00'));
  });

  it('$1.000.000 en 3 meses → la última cuota se lleva el centavo que sobra', () => {
    const c = [1, 2, 3].map((k) => cuotaDe(1_000_000, 3, k));
    expect(c).toEqual(['333333.33', '333333.33', '333333.34']);
    expect(c.reduce((a, x) => a + Math.round(Number(x) * 100), 0)).toBe(100_000_000);
  });

  it('repartir en 1 = todo en el mes', () => {
    expect(cuotaDe(750_000.5, 1, 1)).toBe('750000.50');
  });

  it('las cuotas caen en los meses siguientes, cruzando el año', () => {
    const meses = [
      { month: '2026-12', lines: [{ tipo: 'Aguinaldo', datos: [], monto: 600_000, repetir: false, repartirEn: 3, pendiente: false }] },
    ];
    expect(sumarMeses('2026-12', 1)).toBe('2027-01');
    expect(cuotasDelMes('2026-12', meses)).toEqual([]); // la 1ª cuota es del propio mes
    expect(cuotasDelMes('2027-01', meses).map((c) => [c.numero, c.de, c.cuota])).toEqual([[2, 3, '200000.00']]);
    expect(cuotasDelMes('2027-02', meses).map((c) => [c.numero, c.cuota])).toEqual([[3, '200000.00']]);
    expect(cuotasDelMes('2027-03', meses)).toEqual([]); // ya terminó
  });

  it('las cuotas siguen en los meses siguientes', () => {
    const meses = [
      { month: '2026-06', lines: [{ tipo: 'Aguinaldo', datos: [], monto: 600_000, repetir: false, repartirEn: 6, pendiente: false }] },
    ];
    expect(cuotasDelMes('2026-07', meses).map((c) => c.cuota)).toEqual(['100000.00']);
  });

  it('mes de julio: sueldos $3.000.000 + 2ª cuota del aguinaldo de junio ($6M/6) ÷ 40.000 L = $100/L', () => {
    const r = computeFixedCosts([{ monto: 3_000_000 }, { monto: cuotaDe(6_000_000, 6, 2) }], 40_000);
    expect(r.total).toBe('4000000.00');
    expect(r.costoPorLitro).toBe('100.0000');
  });
});

describe('leche de un mes normal (promedio 12 meses) y sin cubrir', () => {
  it('ejemplo: $30.000.000 ÷ 380.000 L normales = $78,9474/L', () => {
    expect(computeFixedCosts([{ monto: 30_000_000 }], 380_000).costoPorLitro).toBe('78.9474');
  });

  it('sin cubrir = total − lo que las elaboraciones cargaron DE VERDAD', () => {
    // Se cargaron $19.736.850 en las elaboraciones del mes → 30.000.000 − 19.736.850 = 10.263.150
    expect(cobertura('30000000.00', '19736850.00')).toEqual({ cubierto: '19736850.00', sinCubrir: '10263150.00' });
  });

  it('elaboraciones cerradas antes de cargar los costos fijos no cargaron nada: queda TODO sin cubrir', () => {
    // Caso real de la prueba del 11/11: septiembre $8.600.000 y ninguna orden con la línea.
    expect(cobertura('8600000.00', '0')).toEqual({ cubierto: '0.00', sinCubrir: '8600000.00' });
  });

  it('mes fuerte: se cargó más que el gasto → sin cubrir negativo (se cubrió de más)', () => {
    expect(cobertura('30000000.00', '35526330.00')).toEqual({ cubierto: '35526330.00', sinCubrir: '-5526330.00' });
  });

  it('promedio: solo los 12 meses completos anteriores con leche; el mes en curso y los sin leche no cuentan', () => {
    const l = new Map([
      ['2025-10', '999999'], // hace 13 meses: afuera
      ['2025-11', '300000'],
      ['2026-01', '0'], // sin producción: no baja el promedio
      ['2026-06', '400000'],
      ['2026-10', '380000'],
      ['2026-11', '50000'], // mes en curso: afuera
    ]);
    // (300.000 + 400.000 + 380.000) / 3 = 360.000
    expect(promedioLitros(l, '2026-11')).toEqual({ promedio: '360000', meses: 3 });
  });

  it('promedio redondea al litro: (1 + 2) / 2 = 1,5 → 2', () => {
    expect(promedioLitros(new Map([['2026-09', '1'], ['2026-10', '2']]), '2026-11').promedio).toBe('2');
  });

  it('sin historia: null', () => {
    expect(promedioLitros(new Map(), '2026-11')).toEqual({ promedio: null, meses: 0 });
  });
});

describe('leche de un mes normal de CADA mes (no cambia con el paso del tiempo)', () => {
  const litros = new Map([
    ['2026-07', '387096'],
    ['2026-08', '390423'],
    ['2026-09', '378010'],
    ['2026-10', '382404'],
    ['2026-11', '106895'], // mes en curso
  ]);

  it('cada mes se divide por el promedio de los meses ANTERIORES a él, no a hoy', () => {
    // septiembre: (387.096 + 390.423) / 2 = 388.759,5 → 388.760
    expect(baseDelMes(null, null, litros, '2026-09')).toBe('388760');
    // octubre: (387.096 + 390.423 + 378.010) / 3 = 385.176,33 → 385.176
    expect(baseDelMes(null, null, litros, '2026-10')).toBe('385176');
    // noviembre: (387.096 + 390.423 + 378.010 + 382.404) / 4 = 384.483,25 → 384.483
    expect(baseDelMes(null, null, litros, '2026-11')).toBe('384483');
  });

  it('el mes siguiente no cambia la base de un mes ya pasado', () => {
    const conDiciembre = new Map(litros).set('2026-12', '500000');
    expect(baseDelMes(null, null, conDiciembre, '2026-10')).toBe('385176');
  });

  it('la base guardada del mes manda (aunque después cambie la leche a mano o el promedio)', () => {
    expect(baseDelMes('384483', '400000', litros, '2026-11')).toBe('384483');
  });

  it('sin base guardada: la leche cargada a mano manda sobre el promedio', () => {
    expect(baseDelMes(null, '400000', litros, '2026-11')).toBe('400000');
  });

  it('sin historia: null (después se usa la leche del propio mes)', () => {
    expect(baseDelMes(null, null, new Map(), '2026-07')).toBeNull();
  });
});

describe('qué mes se usa al cerrar una elaboración', () => {
  const mes = (month: string, listo: boolean, costoPorLitro: string | null) => ({ month, listo, costoPorLitro });

  it('noviembre a medio cargar (sin marcar listo): se sigue usando octubre', () => {
    expect(mesEnUso([mes('2026-11', false, '10.0000'), mes('2026-10', true, '24.2746')])?.month).toBe('2026-10');
  });
  it('noviembre marcado listo: se usa noviembre', () => {
    expect(mesEnUso([mes('2026-11', true, '24.8385'), mes('2026-10', true, '24.2746')])?.month).toBe('2026-11');
  });
  it('un mes listo en $0 no se usa (no suma $0 a todas las elaboraciones)', () => {
    expect(mesEnUso([mes('2026-11', true, '0.0000'), mes('2026-10', true, '24.2746')])?.month).toBe('2026-10');
  });
  it('ningún mes listo: no se suman costos fijos', () => {
    expect(mesEnUso([mes('2026-11', false, '24.8385')])).toBeUndefined();
  });
});

describe('rentabilidad: costos fijos sin cubrir del período', () => {
  const meses = [
    { month: '2026-11', total: '9550000.00', sinCubrir: '9052683.55' },
    { month: '2026-10', total: '9350000.00', sinCubrir: '9350000.00' },
    { month: '2026-09', total: '8600000.00', sinCubrir: '8600000.00' },
  ];

  it('septiembre a octubre: 8.600.000 + 9.350.000 = 17.950.000', () => {
    expect(sinCubrirDelPeriodo(meses, '2026-09-01', '2026-10-31', '2026-11')).toEqual({
      total: 17_950_000,
      meses: ['2026-09', '2026-10'],
      sinCargar: [],
      enCurso: false,
    });
  });

  it('el mes en curso no se cuenta (todavía faltan elaboraciones)', () => {
    const r = sinCubrirDelPeriodo(meses, '2026-10-01', '2026-11-30', '2026-11');
    expect(r.total).toBe(9_350_000);
    expect(r.enCurso).toBe(true);
  });

  it('un mes sin costos fijos cargados se avisa (no se inventa 0)', () => {
    const r = sinCubrirDelPeriodo(meses, '2026-08-01', '2026-09-30', '2026-11');
    expect(r).toEqual({ total: 8_600_000, meses: ['2026-09'], sinCargar: ['2026-08'], enCurso: false });
  });

  it('se cubrió de más (negativo): suma a favor', () => {
    const r = sinCubrirDelPeriodo([{ month: '2026-10', total: '100.00', sinCubrir: '-20.50' }], '2026-10-01', '2026-10-31', '2026-11');
    expect(r.total).toBe(-20.5);
  });
});

describe('un gasto repartido no se puede repetir (si no, las cuotas se apilan)', () => {
  const linea = (repetir: boolean, repartirEn: number) => ({ tipo: 'Seguro', datos: [], monto: 1_200_000, repetir, repartirEn, pendiente: false });
  it('repartido en 12 y "se repite": se rechaza', () => {
    expect(saveFixedCostMonthInputSchema.safeParse({ lines: [linea(true, 12)] }).success).toBe(false);
  });
  it('repartido en 12 sin repetir: ok', () => {
    expect(saveFixedCostMonthInputSchema.safeParse({ lines: [linea(false, 12)] }).success).toBe(true);
  });
  it('se repite sin repartir (sueldo): ok', () => {
    expect(saveFixedCostMonthInputSchema.safeParse({ lines: [linea(true, 1)] }).success).toBe(true);
  });
});

describe('avisos al confirmar un mes', () => {
  const l = (tipo: string, valores: string[], monto: number, repetir = true) => ({
    tipo,
    datos: valores.map((valor, i) => ({ campo: `c${i}`, valor })),
    monto,
    repetir,
    repartirEn: 1,
    pendiente: false,
  });
  const noviembre = {
    month: '2026-11',
    lines: [
      l('Sueldo', ['Juan Pérez'], 1_800_000),
      l('Sueldo', ['Ana Gómez'], 1_500_000),
      l('Luz', ['0001-45671'], 4_650_000),
      l('Gas', ['G-88123'], 1_300_000),
      l('Sueldo', ['Horas extra'], 250_000, false), // de un solo mes: no se espera en diciembre
    ],
  };

  it('diciembre sin el Gas: avisa que falta, con el monto de noviembre', () => {
    const dic = [l('Sueldo', ['Juan Pérez'], 1_800_000), l('Sueldo', ['Ana Gómez'], 1_500_000), l('Luz', ['0001-50000'], 4_800_000)];
    expect(avisosAlConfirmar('2026-12', dic, noviembre, '2027-01')).toEqual({
      faltan: [{ tipo: 'Gas', detalle: 'G-88123', monto: 1_300_000, mes: '2026-11' }],
      enCurso: false,
    });
  });

  it('falta un sueldo: avisa el de la persona que no está', () => {
    const dic = [l('Sueldo', ['Juan Pérez'], 1_800_000), l('Luz', ['x'], 1), l('Gas', ['y'], 1)];
    expect(avisosAlConfirmar('2026-12', dic, noviembre, '2027-01').faltan).toEqual([
      { tipo: 'Sueldo', detalle: 'Ana Gómez', monto: 1_500_000, mes: '2026-11' },
    ]);
  });

  it('la factura de luz con otro número NO cuenta como faltante', () => {
    const dic = [l('Sueldo', ['Juan Pérez'], 1), l('Sueldo', ['Ana Gómez'], 1), l('Luz', ['0001-99999'], 1), l('Gas', ['G-1'], 1)];
    expect(avisosAlConfirmar('2026-12', dic, noviembre, '2027-01').faltan).toEqual([]);
  });

  it('confirmar noviembre en diciembre: no avisa "no terminó"; confirmar diciembre en diciembre: sí', () => {
    expect(avisosAlConfirmar('2026-11', [], undefined, '2026-12').enCurso).toBe(false);
    expect(avisosAlConfirmar('2026-12', [], undefined, '2026-12').enCurso).toBe(true);
  });
});

describe('aviso de gasto grande de un solo mes (más del 15% del total)', () => {
  const g = (tipo: string, monto: number, repetir = false, repartirEn = 1) => ({ tipo, monto, repetir, repartirEn });
  // Febrero de la simulación: gastos de todos los meses + reparación de $4.500.000.
  const feb = [g('Sueldo', 1_900_000, true), g('Sueldo', 1_600_000, true), g('Luz', 5_100_000, true), g('Gas', 1_400_000, true), g('Reparación', 4_500_000)];
  const total = feb.reduce((a, l) => a + l.monto, 0); // 14.500.000 → 15% = 2.175.000

  it('la reparación de $4.500.000 (31%) avisa', () => {
    expect(gastosGrandesDeUnMes(feb, total, ['Luz', 'Gas'])).toEqual([4]);
  });
  it('un sueldo grande que se repite NO avisa', () => {
    expect(gastosGrandesDeUnMes([g('Sueldo', 9_000_000, true), g('Luz', 1_000_000, true)], 10_000_000, ['Luz'])).toEqual([]);
  });
  it('si ya está repartido NO avisa', () => {
    expect(gastosGrandesDeUnMes([g('Reparación', 4_500_000, false, 12)], 10_000_000, [])).toEqual([]);
  });
  it('horas extra de $250.000 (2,7%) NO avisa', () => {
    expect(gastosGrandesDeUnMes([g('Sueldo', 250_000)], 9_300_000, [])).toEqual([]);
  });
  it('luz/gas (cambian cada mes) no avisan aunque falte tildar "se repite"', () => {
    expect(gastosGrandesDeUnMes([g('Luz', 5_000_000)], 8_000_000, ['Luz'])).toEqual([]);
  });
  it('justo en el 15% no avisa; un peso más, sí', () => {
    expect(gastosGrandesDeUnMes([g('X', 1_500_000)], 10_000_000, [])).toEqual([]);
    expect(gastosGrandesDeUnMes([g('X', 1_500_001)], 10_000_000, [])).toEqual([0]);
  });
});

describe('ajuste por inflación (pedido de Pablo 11/11/2026)', () => {
  it('ejemplo a mano: $12.401.556,83 / 377.011 L = $32,8944; con 2,5% → × 1,025 = $33,7168', () => {
    const r = computeFixedCosts([{ monto: '12401556.83' }], 377011, '2.5');
    expect(r.costoSinAjuste).toBe('32.8944');
    // 12.401.556,83 × 1,025 = 12.711.595,75…; / 377.011 = 33,71678…
    expect(r.costoPorLitro).toBe('33.7168');
  });

  it('el total del mes no cambia (la inflación solo sube lo que se suma por litro)', () => {
    expect(computeFixedCosts([{ monto: 1_000_000 }], 100_000, 3).total).toBe('1000000.00');
  });

  it('0% = igual que sin ajuste', () => {
    const r = computeFixedCosts([{ monto: 30_000_000 }], 382404, 0);
    expect(r.costoPorLitro).toBe('78.4511');
    expect(r.costoSinAjuste).toBe('78.4511');
  });

  it('sin litros: no divide por cero aunque haya ajuste', () => {
    const r = computeFixedCosts([{ monto: 1000 }], 0, 5);
    expect(r.costoPorLitro).toBeNull();
    expect(r.costoSinAjuste).toBeNull();
  });
});
