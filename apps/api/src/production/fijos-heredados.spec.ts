import { fijosHeredados } from './fijos-heredados';

describe('fijosHeredados (costos fijos que trae la masa)', () => {
  it('una masa: 175 kg de una masa con $1.000.000 de fijos en 2.000 kg → $87.500; 250 kg → $350/kg', () => {
    // 1.000.000 / 2.000 = 500 $/kg de masa × 175 = 87.500 ; 87.500 / 250 = 350
    const r = fijosHeredados([{ code: 'A', kgConsumidos: 175, fijoMasa: '1000000', kgMasa: 2000 }], 250);
    expect(r).toEqual({ total: '87500.00', porKg: '350.00', sinFijos: [] });
  });

  it('dos masas, una sin costos fijos: solo suma la que tiene y avisa la otra', () => {
    const r = fijosHeredados(
      [
        { code: 'A', kgConsumidos: 100, fijoMasa: '300000', kgMasa: 1000 }, // 300 $/kg → 30.000
        { code: 'B', kgConsumidos: 50, fijoMasa: null, kgMasa: 800 },
      ],
      150,
    );
    expect(r).toEqual({ total: '30000.00', porKg: '200.00', sinFijos: ['B'] });
  });

  it('caso real OP-20261124-0001: 5.272.584 / 3.271,2 kg = 1.611,82 $/kg de masa', () => {
    const r = fijosHeredados([{ code: 'M', kgConsumidos: 100, fijoMasa: '5272584.00', kgMasa: '3271.2' }], 100);
    expect(r?.porKg).toBe('1611.82');
  });

  it('sin masa consumida → null; kg de producto 0 → porKg null sin romper', () => {
    expect(fijosHeredados([], 10)).toBeNull();
    expect(fijosHeredados([{ code: 'A', kgConsumidos: 10, fijoMasa: '100', kgMasa: 10 }], 0)).toEqual({
      total: '100.00',
      porKg: null,
      sinFijos: [],
    });
  });

  it('decimal exacto: 0,1 + 0,2 de fijos por kg no da 0,30000000004', () => {
    const r = fijosHeredados(
      [
        { code: 'A', kgConsumidos: 1, fijoMasa: '0.1', kgMasa: 1 },
        { code: 'B', kgConsumidos: 1, fijoMasa: '0.2', kgMasa: 1 },
      ],
      1,
    );
    expect(r?.total).toBe('0.30');
  });
});
