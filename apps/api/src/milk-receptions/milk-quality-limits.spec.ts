import { evaluateMilkQuality } from './milk-quality-limits';

describe('evaluateMilkQuality', () => {
  it('acepta una muestra dentro de todos los límites', () => {
    const result = evaluateMilkQuality({
      temperatureCelsius: 4,
      ph: 6.7,
      somaticCellCount: 200_000,
      bacterialCount: 50_000,
      alcoholTestPassed: true,
      antibioticsDetected: false,
      fatPercent: 3.4,
      proteinPercent: 3.2,
    });
    expect(result.acceptable).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('bloquea automáticamente cuando hay antibióticos', () => {
    const result = evaluateMilkQuality({
      antibioticsDetected: true,
      temperatureCelsius: 4,
    });
    expect(result.acceptable).toBe(false);
    expect(result.reasons[0]).toMatch(/antibióticos/i);
  });

  it('bloquea cuando la prueba de alcohol falla', () => {
    const result = evaluateMilkQuality({ alcoholTestPassed: false });
    expect(result.acceptable).toBe(false);
    expect(result.reasons[0]).toMatch(/alcohol/i);
  });

  it('bloquea por temperatura excedida con mensaje específico', () => {
    const result = evaluateMilkQuality({ temperatureCelsius: 12 });
    expect(result.acceptable).toBe(false);
    expect(result.reasons[0]).toContain('12');
  });

  it('acumula múltiples razones de rechazo', () => {
    const result = evaluateMilkQuality({
      temperatureCelsius: 15,
      ph: 5.8,
      somaticCellCount: 800_000,
      bacterialCount: 500_000,
      antibioticsDetected: true,
    });
    expect(result.acceptable).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('ignora campos no provistos sin marcarlos como problema', () => {
    const result = evaluateMilkQuality({});
    expect(result.acceptable).toBe(true);
  });
});
