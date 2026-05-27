// Réplica en el front de los límites de calidad del backend
// (apps/api/src/milk-receptions/milk-quality-limits.ts) para avisar EN VIVO al
// operario ANTES de guardar (CLAUDE.md §5.1 "el sistema avisa antes del error").
// La decisión final (bloquear o no) la sigue tomando el backend; esto es orientativo.
// ⚠ Mantener en sync con el backend si cambian los límites.

export const QUALITY_LIMITS = {
  maxTemperatureCelsius: 6,
  minPh: 6.5,
  maxPh: 6.9,
  maxSomaticCellCount: 400_000,
  maxBacterialCount: 100_000,
};

export interface QualityValues {
  fatPercent?: number;
  proteinPercent?: number;
  somaticCellCount?: number;
  bacterialCount?: number;
  alcoholTestPassed?: boolean;
  antibioticsDetected?: boolean;
  ph?: number;
  temperatureCelsius?: number;
}

const num = (v: unknown): number | undefined =>
  v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v);

// Devuelve los motivos por los que la recepción quedaría BLOQUEADA. Vacío = aceptable.
export function evaluateQuality(q: QualityValues): string[] {
  const reasons: string[] = [];
  const temp = num(q.temperatureCelsius);
  const ph = num(q.ph);
  const rcs = num(q.somaticCellCount);
  const ufc = num(q.bacterialCount);

  if (q.antibioticsDetected === true) reasons.push('Se detectaron antibióticos.');
  if (q.alcoholTestPassed === false) reasons.push('La prueba de alcohol dio positiva (leche inestable).');
  if (temp !== undefined && temp > QUALITY_LIMITS.maxTemperatureCelsius)
    reasons.push(`Temperatura ${temp}°C supera el máximo de ${QUALITY_LIMITS.maxTemperatureCelsius}°C.`);
  if (ph !== undefined && ph < QUALITY_LIMITS.minPh) reasons.push(`pH ${ph} por debajo del mínimo (${QUALITY_LIMITS.minPh}).`);
  if (ph !== undefined && ph > QUALITY_LIMITS.maxPh) reasons.push(`pH ${ph} por encima del máximo (${QUALITY_LIMITS.maxPh}).`);
  if (rcs !== undefined && rcs > QUALITY_LIMITS.maxSomaticCellCount)
    reasons.push(`RCS ${rcs.toLocaleString('es-AR')} supera el límite de ${QUALITY_LIMITS.maxSomaticCellCount.toLocaleString('es-AR')} células/ml.`);
  if (ufc !== undefined && ufc > QUALITY_LIMITS.maxBacterialCount)
    reasons.push(`UFC ${ufc.toLocaleString('es-AR')} supera el límite de ${QUALITY_LIMITS.maxBacterialCount.toLocaleString('es-AR')} UFC/ml.`);

  return reasons;
}
