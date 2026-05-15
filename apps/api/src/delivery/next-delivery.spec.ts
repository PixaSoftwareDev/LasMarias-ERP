import { isValidDeliveryDate, nextDeliveryDate } from './next-delivery';

describe('nextDeliveryDate', () => {
  it('devuelve hoy si es día válido y el cutoff no pasó', () => {
    const now = new Date('2026-05-15T08:00:00'); // viernes
    const result = nextDeliveryDate(now, {
      deliveryDays: ['mon', 'wed', 'fri'],
      cutoffTime: '14:00',
      suspendedDates: new Set(),
      extraDates: new Set(),
    });
    expect(result).toBe('2026-05-15');
  });

  it('saltea al próximo día válido si pasó el cutoff', () => {
    const now = new Date('2026-05-15T15:00:00'); // viernes, después del cutoff
    const result = nextDeliveryDate(now, {
      deliveryDays: ['mon', 'wed', 'fri'],
      cutoffTime: '14:00',
      suspendedDates: new Set(),
      extraDates: new Set(),
    });
    expect(result).toBe('2026-05-18'); // próximo lunes
  });

  it('saltea fechas suspendidas', () => {
    const now = new Date('2026-05-13T08:00:00'); // miércoles
    const result = nextDeliveryDate(now, {
      deliveryDays: ['mon', 'wed', 'fri'],
      cutoffTime: '14:00',
      suspendedDates: new Set(['2026-05-13', '2026-05-15']),
      extraDates: new Set(),
    });
    expect(result).toBe('2026-05-18');
  });

  it('respeta fechas extras aunque no sean día recurrente', () => {
    const now = new Date('2026-05-13T08:00:00'); // miércoles 13
    const result = nextDeliveryDate(now, {
      deliveryDays: ['fri'],
      cutoffTime: '14:00',
      suspendedDates: new Set(),
      extraDates: new Set(['2026-05-14']), // jueves extra
    });
    expect(result).toBe('2026-05-14');
  });
});

describe('isValidDeliveryDate', () => {
  it('rechaza día suspendido', () => {
    expect(
      isValidDeliveryDate('2026-05-15', {
        deliveryDays: ['fri'],
        cutoffTime: '14:00',
        suspendedDates: new Set(['2026-05-15']),
        extraDates: new Set(),
      }),
    ).toBe(false);
  });

  it('acepta día extra', () => {
    expect(
      isValidDeliveryDate('2026-05-14', {
        deliveryDays: ['fri'],
        cutoffTime: '14:00',
        suspendedDates: new Set(),
        extraDates: new Set(['2026-05-14']),
      }),
    ).toBe(true);
  });

  it('acepta día recurrente', () => {
    expect(
      isValidDeliveryDate('2026-05-15', {
        deliveryDays: ['fri'],
        cutoffTime: '14:00',
        suspendedDates: new Set(),
        extraDates: new Set(),
      }),
    ).toBe(true);
  });
});
