import { formatMilkBatchCode, parseMilkBatchCode } from './batch-code';

describe('formatMilkBatchCode / parseMilkBatchCode', () => {
  it('formatea con padding correcto', () => {
    const code = formatMilkBatchCode({ date: new Date(2026, 4, 15), sequence: 7 });
    expect(code).toBe('LM-LC-20260515-0007');
  });

  it('formatea secuencia mayor a 9999 (sin truncar)', () => {
    const code = formatMilkBatchCode({ date: new Date(2026, 11, 1), sequence: 12345 });
    expect(code).toBe('LM-LC-20261201-12345');
  });

  it('parsea un código válido', () => {
    const parsed = parseMilkBatchCode('LM-LC-20260515-0042');
    expect(parsed).not.toBeNull();
    expect(parsed?.sequence).toBe(42);
    expect(parsed?.date.getFullYear()).toBe(2026);
    expect(parsed?.date.getMonth()).toBe(4); // mayo
    expect(parsed?.date.getDate()).toBe(15);
  });

  it('devuelve null para formato inválido', () => {
    expect(parseMilkBatchCode('cualquier-cosa')).toBeNull();
    expect(parseMilkBatchCode('LM-LC-2026-05-15-0042')).toBeNull();
  });
});
