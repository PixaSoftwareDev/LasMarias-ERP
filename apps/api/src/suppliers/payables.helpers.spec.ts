import { payableStatus } from './payables.service';

// Estado del comprobante derivado de pagos vs monto. Verificable a mano (CLAUDE.md §8).
describe('payableStatus', () => {
  it('sin pagos → pendiente', () => {
    expect(payableStatus(1000, 0)).toBe('pendiente');
  });

  it('pago parcial → parcial', () => {
    expect(payableStatus(1000, 400)).toBe('parcial');
  });

  it('pago total → pagada', () => {
    expect(payableStatus(1000, 1000)).toBe('pagada');
  });

  it('tolera ruido de punto flotante: 1000 − 1e-10 → pagada', () => {
    expect(payableStatus(1000, 1000 - 1e-10)).toBe('pagada');
  });

  it('pago mayor al monto → pagada', () => {
    expect(payableStatus(1000, 1200)).toBe('pagada');
  });
});
