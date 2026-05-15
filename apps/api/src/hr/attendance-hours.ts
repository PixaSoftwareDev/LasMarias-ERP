// Cálculo de horas trabajadas a partir de eventos in/out (CLAUDE.md §4.8).
// Empareja in con el siguiente out del mismo empleado; ignora pares incompletos
// pero los marca para revisión.

export interface AttendanceEventLite {
  type: 'in' | 'out';
  timestamp: Date;
}

export interface AttendancePeriodResult {
  workedMs: number;
  workedHours: number;
  pairs: Array<{ in: Date; out: Date; ms: number }>;
  unpairedIns: Date[];
  unpairedOuts: Date[];
}

export function computeWorkedHours(events: AttendanceEventLite[]): AttendancePeriodResult {
  const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const pairs: AttendancePeriodResult['pairs'] = [];
  const unpairedIns: Date[] = [];
  const unpairedOuts: Date[] = [];
  let pendingIn: Date | null = null;
  for (const e of sorted) {
    if (e.type === 'in') {
      if (pendingIn) unpairedIns.push(pendingIn);
      pendingIn = e.timestamp;
    } else {
      if (pendingIn) {
        const ms = e.timestamp.getTime() - pendingIn.getTime();
        if (ms > 0) pairs.push({ in: pendingIn, out: e.timestamp, ms });
        pendingIn = null;
      } else {
        unpairedOuts.push(e.timestamp);
      }
    }
  }
  if (pendingIn) unpairedIns.push(pendingIn);
  const workedMs = pairs.reduce((s, p) => s + p.ms, 0);
  return {
    workedMs,
    workedHours: Math.round((workedMs / 3_600_000) * 100) / 100,
    pairs,
    unpairedIns,
    unpairedOuts,
  };
}
