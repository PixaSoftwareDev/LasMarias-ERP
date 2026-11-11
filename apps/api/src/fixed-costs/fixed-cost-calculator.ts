import Big from 'big.js';
import { sumarMeses } from '@lasmarias/shared-schemas';

// Cuenta de los costos fijos del mes. Pura y verificable a mano:
//   total          = Σ montos (a centavos). Un gasto repartido en N meses entra con su cuota.
//   costo por litro = total / litros de leche de un mes normal (4 decimales)
//   cubierto        = lo que las elaboraciones del mes cargaron DE VERDAD (suma de sus líneas
//                     "COSTOS FIJOS DE PLANTA"), no litros × $/litro
//   sin cubrir      = total − cubierto (>0 no llegó a ningún queso; <0 se cubrió de más)

const MONEY_DP = 2;
const RATE_DP = 4;

export interface FixedCostTotals {
  total: string;
  costoPorLitro: string | null; // null si no hubo litros (no se divide por cero)
}

export function computeFixedCosts(lines: { monto: string | number }[], litros: string | number): FixedCostTotals {
  const total = lines.reduce((acc, l) => acc.plus(new Big(String(l.monto)).round(MONEY_DP)), new Big(0));
  const L = new Big(String(litros));
  return {
    total: total.toFixed(MONEY_DP),
    costoPorLitro: L.gt(0) ? total.div(L).toFixed(RATE_DP) : null,
  };
}

// Lo que las elaboraciones del mes llevan cargado DE VERDAD y lo que quedó afuera. `cargado`
// es la suma de las líneas de costos fijos de las órdenes cerradas del mes: una orden cerrada
// antes de cargar los costos fijos (o todavía abierta) no cargó nada y todo eso queda sin cubrir.
export function cobertura(total: string, cargado: string) {
  const cubierto = new Big(cargado).round(MONEY_DP);
  return { cubierto: cubierto.toFixed(MONEY_DP), sinCubrir: new Big(total).minus(cubierto).toFixed(MONEY_DP) };
}

// Leche de un mes normal: promedio de los 12 meses COMPLETOS anteriores a `mesActual` que
// tuvieron producción (un mes sin leche, ej. antes de usar el sistema, no baja el promedio).
// Redondeado al litro.
export function promedioLitros(
  litrosPorMes: Map<string, string>,
  mesActual: string,
  meses = 12,
): { promedio: string | null; meses: number } {
  const desde = sumarMeses(mesActual, -meses);
  const vals = [...litrosPorMes.entries()]
    .filter(([m, l]) => m >= desde && m < mesActual && new Big(l).gt(0))
    .map(([, l]) => new Big(l));
  if (!vals.length) return { promedio: null, meses: 0 };
  const sum = vals.reduce((a, b) => a.plus(b), new Big(0));
  return { promedio: sum.div(vals.length).round(0).toFixed(0), meses: vals.length };
}

// Leche de un mes normal de UN mes dado (por la que se dividen sus gastos). Para que la historia
// no cambie sola: (1) la base que quedó guardada al cargar el mes; si no hay, (2) la leche
// cargada a mano; si no, (3) el promedio de los 12 meses ANTERIORES a ese mes (no a hoy).
// null = sin historia (se usa la leche del propio mes).
export function baseDelMes(
  guardada: string | null,
  manual: string | null,
  litrosPorMes: Map<string, string>,
  mes: string,
): string | null {
  return guardada ?? manual ?? promedioLitros(litrosPorMes, mes).promedio;
}

// Mes cuyo $/litro se suma al cerrar cada elaboración: el más nuevo marcado LISTO con un $/litro
// mayor a 0. Un mes a medio cargar o vacío no se usa. `meses` viene del más nuevo al más viejo.
export function mesEnUso<T extends { listo: boolean; costoPorLitro: string | null }>(meses: T[]): T | undefined {
  return meses.find((d) => d.listo && d.costoPorLitro != null && new Big(d.costoPorLitro).gt(0));
}
