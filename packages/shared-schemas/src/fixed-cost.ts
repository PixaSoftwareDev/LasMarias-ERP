import { z } from 'zod';
import { monthKeySchema, sumarMeses } from './month';

// Costos fijos de planta (audio del dueño 10/11/2026): luz, gas, sueldos con cargas, etc.
// Se cargan por mes (tipo de gasto + sus campos + monto); el sistema los divide por los litros de leche elaborados ese mes. Al
// cerrar cada elaboración que usa leche cruda se suma solo una línea "COSTOS FIJOS DE PLANTA"
// = litros de leche × $/litro del último mes cargado (siempre se suma). Sin tocar recetas.

export const COSTO_FIJO_NOMBRE = 'COSTOS FIJOS DE PLANTA';


// Tipo de gasto (lo arma el dueño, nada precargado): un nombre y los campos que quiera
// (ej. Sueldo → Empleado, Puesto, CUIL, Fecha de ingreso; Luz → N° de factura, Período).
// Los campos son SOLO para identificar el gasto: el monto se carga aparte y es lo único
// que entra en la cuenta.
const campoNombre = z.string().trim().min(1, 'Falta el nombre del campo').max(60);
export const fixedCostTypeInputSchema = z.object({
  nombre: z.string().trim().min(1, 'Falta el nombre del tipo de gasto').max(80),
  campos: z
    .array(campoNombre)
    .max(10, 'Máximo 10 campos')
    .refine((c) => new Set(c.map((x) => x.toLowerCase())).size === c.length, 'Hay dos campos con el mismo nombre'),
  // true = el monto cambia cada mes (luz, agua, gas): al copiarlo al mes nuevo queda marcado
  // "falta la factura de este mes" hasta que se cargue el monto nuevo.
  variable: z.boolean().default(false),
});
export type FixedCostTypeInput = z.infer<typeof fixedCostTypeInputSchema>;

export const fixedCostTypeSchema = fixedCostTypeInputSchema.extend({ id: z.string().uuid() });
export type FixedCostType = z.infer<typeof fixedCostTypeSchema>;

// Un gasto del mes. Guarda una COPIA del nombre del tipo y de sus campos, así un mes viejo se
// sigue leyendo igual aunque después se cambie o se borre el tipo.
export const fixedCostLineSchema = z.object({
  tipo: z.string().trim().min(1, 'Falta el tipo de gasto').max(80),
  datos: z
    .array(z.object({ campo: campoNombre, valor: z.string().trim().max(200) }))
    .max(10)
    .default([]),
  monto: z.number().nonnegative('No puede ser negativo').max(1e12),
  // true = gasto de todos los meses (se copia al mes siguiente); false = solo de este mes
  // (ej. horas extras, una reparación): no se copia.
  repetir: z.boolean().default(false),
  // Pagos grandes que no son de un solo mes (aguinaldo, seguro anual): el admin carga el monto
  // REAL pagado y el sistema lo reparte en partes iguales en este mes y los siguientes.
  // 1 = todo en este mes.
  repartirEn: z.number().int().min(1, 'Mínimo 1 mes').max(12, 'Máximo 12 meses').default(1),
  // true = gasto variable copiado del mes anterior al que todavía no se le cargó la factura
  // nueva (se está usando el monto del mes pasado). Solo es un aviso: igual se suma.
  pendiente: z.boolean().default(false),
});
export type FixedCostLine = z.infer<typeof fixedCostLineSchema>;

// --- Reparto en cuotas (puro, en centavos enteros: exacto y verificable a mano) ---------
// Cuota = monto / meses, redondeada para abajo al centavo; la ÚLTIMA cuota se lleva el
// resto, así la suma de las cuotas da exactamente el monto. Ej: $1.000.000 en 3 meses →
// 333.333,33 + 333.333,33 + 333.333,34.


/** Cuota número `numero` (1..n) de `monto` repartido en `n` meses, en pesos con 2 decimales. */
export function cuotaDe(monto: number, n: number, numero: number): string {
  const total = Math.round(monto * 100);
  if (n <= 1) return (total / 100).toFixed(2);
  const base = Math.floor(total / n);
  const c = numero < n ? base : total - base * (n - 1);
  return (c / 100).toFixed(2);
}

export const fixedCostCuotaSchema = z.object({
  desde: monthKeySchema, // mes donde se cargó el gasto
  tipo: z.string(),
  datos: z.array(z.object({ campo: z.string(), valor: z.string() })),
  montoTotal: z.number(),
  numero: z.number().int(), // cuota 2 de 6, etc.
  de: z.number().int(),
  cuota: z.string(),
});
export type FixedCostCuota = z.infer<typeof fixedCostCuotaSchema>;

/**
 * Cuotas que le caen a `mes` de gastos cargados en meses ANTERIORES con "repartir en N meses".
 */
export function cuotasDelMes(
  mes: string,
  meses: { month: string; lines: FixedCostLine[] }[],
): FixedCostCuota[] {
  const out: FixedCostCuota[] = [];
  for (const m of meses) {
    if (m.month >= mes) continue;
    for (const l of m.lines) {
      const n = l.repartirEn ?? 1;
      for (let k = 1; k < n; k++) {
        if (sumarMeses(m.month, k) !== mes) continue;
        out.push({ desde: m.month, tipo: l.tipo, datos: l.datos, montoTotal: l.monto, numero: k + 1, de: n, cuota: cuotaDe(l.monto, n, k + 1) });
      }
    }
  }
  return out.sort((a, b) => a.desde.localeCompare(b.desde));
}

export const saveFixedCostMonthInputSchema = z.object({
  // Un gasto repartido en N meses NO puede además repetirse: al copiarlo cada mes arrancaría un
  // reparto nuevo y las cuotas se irían sumando (un seguro de $1,2M en 12 cuotas terminaría en
  // $1,2M por mes). Sus cuotas ya pasan solas a los meses siguientes.
  lines: z
    .array(fixedCostLineSchema)
    .max(300)
    .refine((ls) => ls.every((l) => !(l.repetir && l.repartirEn > 1)), {
      message: 'Un gasto repartido en varios meses no se puede marcar "se repite todos los meses": sus cuotas ya pasan solas.',
    }),
});
export type SaveFixedCostMonthInput = z.infer<typeof saveFixedCostMonthInputSchema>;

export const fixedCostMonthSchema = z.object({
  month: monthKeySchema,
  lines: z.array(fixedCostLineSchema),
  cuotas: z.array(fixedCostCuotaSchema), // cuotas que le caen de meses anteriores (aguinaldo repartido, etc.)
  total: z.string(), // gastos del mes (si se reparten, solo la 1ª cuota) + cuotas de meses anteriores
  litros: z.string(), // litros de leche elaborados en el mes (reales)
  litrosBase: z.string(), // por cuánto se divide: la leche de un mes normal (o la del mes, si todavía no hay historia)
  costoPorLitro: z.string().nullable(), // total / litrosBase; null = no hay litros para dividir
  cubierto: z.string(), // lo que las elaboraciones del mes cargaron DE VERDAD (suma de sus líneas de costos fijos)
  sinCubrir: z.string(), // total − cubierto: >0 no llegó a ningún queso, <0 se cubrió de más
  ordenesSinCostoFijo: z.number().int(), // elaboraciones del mes con leche cerradas SIN la línea (ej. antes de cargar los costos fijos)
  listo: z.boolean(), // el administrativo lo marcó terminado: recién ahí se puede usar
  enUso: z.boolean(), // es el mes cuyo $/litro se suma hoy al cerrar (el más nuevo LISTO)
  mesCompleto: z.boolean(), // false = mes en curso (los litros todavía suben)
});
export type FixedCostMonth = z.infer<typeof fixedCostMonthSchema>;

export const fixedCostsOverviewSchema = z.object({
  months: z.array(fixedCostMonthSchema), // más nuevo primero
  tipos: z.array(fixedCostTypeSchema), // por nombre
  enUso: z
    .object({ month: monthKeySchema, costoPorLitro: z.string() })
    .nullable(),
  litrosPorMes: z.record(z.string()), // AAAA-MM → litros de leche elaborados (para la vista previa)
  basePorMes: z.record(z.string().nullable()), // AAAA-MM → leche de un mes normal de ESE mes (vista previa de un mes nuevo)
  cargadoPorMes: z.record(z.string()), // AAAA-MM → costos fijos cargados de verdad en las elaboraciones del mes
  sinCostoFijoPorMes: z.record(z.number().int()), // AAAA-MM → elaboraciones cerradas sin la línea
  // Leche de un mes normal: promedio de los últimos 12 meses completos con producción, o el
  // número cargado a mano. Los gastos de cada mes se dividen por esto (NIC 2: capacidad normal),
  // así un mes flojo no encarece el queso: lo que falta se muestra como "sin cubrir".
  litrosNormales: z.object({
    valor: z.string().nullable(), // el que se usa (manual ?? promedio); null = sin historia
    promedio: z.string().nullable(),
    mesesPromedio: z.number().int(), // cuántos meses entraron en el promedio
    manual: z.string().nullable(),
  }),
  mesActual: monthKeySchema,
});
export const setFixedCostMonthListoInputSchema = z.object({ listo: z.boolean() });
export type SetFixedCostMonthListoInput = z.infer<typeof setFixedCostMonthListoInputSchema>;

export const setLitrosNormalesInputSchema = z.object({
  litros: z.number().positive('Tienen que ser más de 0 litros').max(1e9).nullable(), // null = volver al promedio
});
export type SetLitrosNormalesInput = z.infer<typeof setLitrosNormalesInputSchema>;


export type FixedCostsOverview = z.infer<typeof fixedCostsOverviewSchema>;

/**
 * Costos fijos que no llegó a cargar ningún queso en los meses de un período (para restarlos en
 * Rentabilidad: margen − sin cubrir = lo que realmente se ganó). Son por MES COMPLETO: un período
 * de días toma los meses que toca. El mes en curso no se cuenta (todavía faltan elaboraciones).
 */
export function sinCubrirDelPeriodo(
  meses: { month: string; total: string; sinCubrir: string }[],
  desde: string, // AAAA-MM-DD
  hasta: string, // AAAA-MM-DD
  mesActual: string,
): { total: number; meses: string[]; sinCargar: string[]; enCurso: boolean } {
  const out = { total: 0, meses: [] as string[], sinCargar: [] as string[], enCurso: false };
  let cents = 0;
  for (let mes = desde.slice(0, 7); mes <= hasta.slice(0, 7); mes = sumarMeses(mes, 1)) {
    if (mes >= mesActual) {
      out.enCurso = true;
      break;
    }
    const m = meses.find((x) => x.month === mes);
    if (!m) {
      out.sinCargar.push(mes);
      continue;
    }
    out.meses.push(mes);
    cents += Math.round(Number(m.sinCubrir) * 100);
  }
  out.total = cents / 100;
  return out;
}

/**
 * Avisos antes de confirmar un mes (no lo impiden, piden una segunda confirmación):
 *  - faltan: gastos que el mes anterior tenía marcados "se repite" y en este mes no están
 *    (ej. el Gas de noviembre no aparece en diciembre). Se compara por tipo: si hay menos
 *    gastos de un tipo que el mes anterior, faltan los que no coinciden en sus datos.
 *  - enCurso: el mes todavía no terminó (seguramente faltan facturas).
 */
export function avisosAlConfirmar(
  mes: string,
  lineas: { tipo: string; datos: { valor: string }[] }[],
  anterior: { month: string; lines: FixedCostLine[] } | undefined,
  mesActual: string,
): { faltan: { tipo: string; detalle: string; monto: number; mes: string }[]; enCurso: boolean } {
  const firma = (datos: { valor: string }[]) => datos.map((d) => d.valor.trim().toLowerCase()).join('|');
  const faltan: { tipo: string; detalle: string; monto: number; mes: string }[] = [];
  if (anterior) {
    const tipos = [...new Set(anterior.lines.filter((l) => l.repetir).map((l) => l.tipo))];
    for (const tipo of tipos) {
      const antes = anterior.lines.filter((l) => l.repetir && l.tipo === tipo);
      const ahora = lineas.filter((l) => l.tipo === tipo);
      const deficit = antes.length - ahora.length;
      if (deficit <= 0) continue;
      const firmasAhora = new Set(ahora.map((l) => firma(l.datos)));
      // Primero los que no coinciden en sus datos (ej. el sueldo de Ana); si no alcanza, el resto.
      const orden = [...antes.filter((l) => !firmasAhora.has(firma(l.datos))), ...antes.filter((l) => firmasAhora.has(firma(l.datos)))];
      for (const l of orden.slice(0, deficit)) {
        faltan.push({ tipo, detalle: l.datos.map((d) => d.valor).filter(Boolean).join(' · '), monto: l.monto, mes: anterior.month });
      }
    }
  }
  return { faltan, enCurso: mes >= mesActual };
}

/**
 * Gastos "grandes de un solo mes": no se repiten, no están repartidos y pasan el `umbral` (15%)
 * del total del mes. Cargados de una vez hacen saltar el $/litro (y lo pagan las elaboraciones
 * del mes siguiente): conviene repartirlos. Los de tipos que cambian cada mes (luz, gas, agua)
 * no cuentan: llegan todos los meses. Devuelve los índices de esos gastos en `lineas`.
 */
export function gastosGrandesDeUnMes(
  lineas: { tipo: string; monto: number; repetir: boolean; repartirEn: number }[],
  totalMes: number,
  tiposVariables: string[],
  umbral = 0.15,
): number[] {
  if (!(totalMes > 0)) return [];
  return lineas.flatMap((l, i) =>
    !l.repetir && l.repartirEn <= 1 && !tiposVariables.includes(l.tipo) && l.monto > totalMes * umbral ? [i] : [],
  );
}
