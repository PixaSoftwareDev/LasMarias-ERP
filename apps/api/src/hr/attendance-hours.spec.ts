import { computeWorkedHours } from './attendance-hours';

describe('computeWorkedHours', () => {
  it('empareja in/out consecutivos y suma horas', () => {
    const r = computeWorkedHours([
      { type: 'in', timestamp: new Date('2026-05-15T08:00:00Z') },
      { type: 'out', timestamp: new Date('2026-05-15T12:00:00Z') },
      { type: 'in', timestamp: new Date('2026-05-15T13:00:00Z') },
      { type: 'out', timestamp: new Date('2026-05-15T17:00:00Z') },
    ]);
    expect(r.workedHours).toBe(8);
    expect(r.pairs).toHaveLength(2);
  });

  it('marca pares incompletos sin romper', () => {
    const r = computeWorkedHours([
      { type: 'in', timestamp: new Date('2026-05-15T08:00:00Z') },
      { type: 'in', timestamp: new Date('2026-05-15T09:00:00Z') },
      { type: 'out', timestamp: new Date('2026-05-15T12:00:00Z') },
      { type: 'out', timestamp: new Date('2026-05-15T13:00:00Z') }, // sin in previo
    ]);
    expect(r.pairs).toHaveLength(1);
    expect(r.unpairedIns).toHaveLength(1);
    expect(r.unpairedOuts).toHaveLength(1);
  });
});
