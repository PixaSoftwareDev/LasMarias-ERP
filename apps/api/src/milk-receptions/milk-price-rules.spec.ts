import { debeActualizarAcordado } from './milk-price-rules';

describe('precio acordado del tambo al cargar el precio de un mes', () => {
  it('mes actual sin meses posteriores: actualiza', () => {
    expect(debeActualizarAcordado('2026-11', '2026-11', false, false)).toBe(true);
  });
  it('mes anterior, y el actual todavía sin precio: actualiza (se carga octubre a principios de noviembre)', () => {
    expect(debeActualizarAcordado('2026-10', '2026-11', false, false)).toBe(true);
  });
  it('mes anterior pero el actual ya tiene precio: NO actualiza', () => {
    expect(debeActualizarAcordado('2026-10', '2026-11', true, false)).toBe(false);
  });
  it('corregir un mes viejo (septiembre en noviembre): NO pisa el acordado', () => {
    expect(debeActualizarAcordado('2026-09', '2026-11', false, false)).toBe(false);
  });
  it('hay un mes posterior con precio: NO actualiza', () => {
    expect(debeActualizarAcordado('2026-11', '2026-11', false, true)).toBe(false);
  });
  it('enero: el mes anterior es diciembre del año pasado', () => {
    expect(debeActualizarAcordado('2026-12', '2027-01', false, false)).toBe(true);
  });
});
