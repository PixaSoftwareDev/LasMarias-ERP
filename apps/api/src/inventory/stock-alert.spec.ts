import { resolveAlertLevel } from './stock-alert';

describe('resolveAlertLevel', () => {
  describe('sin stock mínimo configurado', () => {
    it('nunca devuelve low aunque el stock sea bajo o cero', () => {
      expect(resolveAlertLevel({ totalQuantity: 0, minStock: null })).toBe('ok');
      expect(resolveAlertLevel({ totalQuantity: 0, minStock: undefined })).toBe('ok');
      expect(resolveAlertLevel({ totalQuantity: 2 })).toBe('ok');
    });

    it('respeta el vencimiento si lo hay', () => {
      expect(resolveAlertLevel({ totalQuantity: 100, daysToExpire: 30 })).toBe('ok');
      expect(resolveAlertLevel({ totalQuantity: 100, daysToExpire: 5 })).toBe('expiring');
      expect(resolveAlertLevel({ totalQuantity: 100, daysToExpire: 0 })).toBe('critical');
    });
  });

  describe('con stock mínimo, sin problema de vencimiento', () => {
    it('por encima del mínimo → ok', () => {
      expect(resolveAlertLevel({ totalQuantity: 20, minStock: 10 })).toBe('ok');
    });

    it('por encima del mínimo pero próximo a vencer → expiring', () => {
      expect(resolveAlertLevel({ totalQuantity: 20, minStock: 10, daysToExpire: 3 })).toBe(
        'expiring',
      );
    });

    it('igual al mínimo → low (borde inclusivo)', () => {
      expect(resolveAlertLevel({ totalQuantity: 10, minStock: 10 })).toBe('low');
    });

    it('por debajo del mínimo → low', () => {
      expect(resolveAlertLevel({ totalQuantity: 3, minStock: 10 })).toBe('low');
      expect(resolveAlertLevel({ totalQuantity: 0, minStock: 10 })).toBe('low');
    });

    it('mínimo cero: stock cero queda en low (borde inclusivo)', () => {
      expect(resolveAlertLevel({ totalQuantity: 0, minStock: 0 })).toBe('low');
      expect(resolveAlertLevel({ totalQuantity: 1, minStock: 0 })).toBe('ok');
    });
  });

  describe('prioridad de alertas', () => {
    it('critical (vencido) gana sobre low (stock bajo)', () => {
      expect(
        resolveAlertLevel({ totalQuantity: 2, minStock: 10, daysToExpire: -1 }),
      ).toBe('critical');
      expect(
        resolveAlertLevel({ totalQuantity: 2, minStock: 10, daysToExpire: 0 }),
      ).toBe('critical');
    });

    it('low gana sobre expiring cuando hay ambos', () => {
      expect(
        resolveAlertLevel({ totalQuantity: 5, minStock: 10, daysToExpire: 4 }),
      ).toBe('low');
    });
  });
});
