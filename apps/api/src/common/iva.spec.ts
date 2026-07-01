import { applyIva } from './iva';

// IVA con decimal exacto (big.js). Cada resultado verificado a mano.
describe('applyIva', () => {
  it('sin_iva deja el monto igual', () => {
    expect(applyIva(320, 'sin_iva', 21)).toBe('320');
  });

  it('modo indefinido se trata como sin IVA', () => {
    expect(applyIva(320, undefined, 21)).toBe('320');
  });

  it('con_iva suma la alícuota: 320 × 1.21 = 387.2', () => {
    expect(applyIva(320, 'con_iva', 21)).toBe('387.2');
  });

  it('con_iva es exacto en decimal: 0.10 × 1.21 = 0.121 (sin error de float)', () => {
    expect(applyIva('0.10', 'con_iva', 21)).toBe('0.121');
  });

  it('alícuota 0 no cambia el monto aunque sea con_iva', () => {
    expect(applyIva(1500, 'con_iva', 0)).toBe('1500');
  });

  it('acepta el monto como string', () => {
    expect(applyIva('1000', 'con_iva', 10.5)).toBe('1105');
  });
});
