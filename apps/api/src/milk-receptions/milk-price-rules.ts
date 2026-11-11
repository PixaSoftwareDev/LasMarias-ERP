import { sumarMeses } from '@lasmarias/shared-schemas';

// ¿El precio de un mes pasa a ser el precio acordado del tambo? Solo si es el precio más nuevo:
// el mes actual, o el anterior mientras el actual todavía no tiene precio (se carga octubre a
// principios de noviembre). Corregir un mes viejo NO pisa el acordado: las recepciones nuevas
// tomarían un precio viejo.
export function debeActualizarAcordado(mes: string, mesActual: string, actualTienePrecio: boolean, hayPosterior: boolean): boolean {
  if (hayPosterior || mes > mesActual) return false;
  if (mes === mesActual) return true;
  return mes === sumarMeses(mesActual, -1) && !actualTienePrecio;
}
