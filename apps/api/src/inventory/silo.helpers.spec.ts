import { siloFillPercent, isLowLevel, siloAvailableLiters, siloHasRoomFor } from './silo.helpers';

// Nivel de silo verificable a mano (CLAUDE.md §9).
describe('siloFillPercent', () => {
  it('8200 / 10000 = 82%', () => {
    expect(siloFillPercent(8200, 10000)).toBe(82);
  });

  it('13900 / 30000 = 46.3%', () => {
    expect(siloFillPercent(13900, 30000)).toBe(46.3);
  });

  it('silo vacío = 0%', () => {
    expect(siloFillPercent(0, 10000)).toBe(0);
  });

  it('sin capacidad cargada = 0% (no divide por cero)', () => {
    expect(siloFillPercent(500, 0)).toBe(0);
  });

  it('excedido: 11000 / 10000 = 110% (la UI lo marca como alerta)', () => {
    expect(siloFillPercent(11000, 10000)).toBe(110);
  });
});

describe('isLowLevel', () => {
  it('14% es bajo (< 15%)', () => {
    expect(isLowLevel(14)).toBe(true);
  });
  it('15% no es bajo', () => {
    expect(isLowLevel(15)).toBe(false);
  });
  it('82% no es bajo', () => {
    expect(isLowLevel(82)).toBe(false);
  });
});

// Capacidad disponible para validar la recepción (el camión no entra en un silo chico).
describe('siloAvailableLiters / siloHasRoomFor', () => {
  it('silo de 20000 con 5000 cargados → 15000 disponibles', () => {
    expect(siloAvailableLiters(20000, 5000)).toBe(15000);
  });

  it('sin capacidad cargada → Infinity (sin límite)', () => {
    expect(siloAvailableLiters(0, 5000)).toBe(Infinity);
  });

  it('29000 L NO entran en un silo de 20000 vacío', () => {
    expect(siloHasRoomFor(20000, 0, 29000)).toBe(false);
  });

  it('20000 L entran justo en un silo de 20000 vacío', () => {
    expect(siloHasRoomFor(20000, 0, 20000)).toBe(true);
  });

  it('9000 L entran en lo que queda de un silo de 20000 con 11000', () => {
    expect(siloHasRoomFor(20000, 11000, 9000)).toBe(true);
  });
});
