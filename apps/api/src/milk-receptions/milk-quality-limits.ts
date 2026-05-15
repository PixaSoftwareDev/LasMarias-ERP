import type { MilkQualityAnalysis } from '@lasmarias/shared-schemas';

// Límites de calidad para bloqueo automático (CLAUDE.md §4.1).
// En el futuro estos parámetros serán configurables desde Administración (§4.10).
// Por ahora viven en código como defaults razonables para leche bovina.

export interface MilkQualityLimits {
  // Temperatura al ingreso (°C) — la leche debe llegar fría
  maxTemperatureCelsius: number;
  // pH normal de leche cruda 6.6-6.8. Fuera de este rango sugiere acidez/alteración.
  minPh: number;
  maxPh: number;
  // RCS — Recuento de Células Somáticas. > 400.000 indica problemas de mastitis.
  maxSomaticCellCount: number;
  // UFC — Unidades Formadoras de Colonias. > 100.000 indica falta de higiene.
  maxBacterialCount: number;
}

export const DEFAULT_QUALITY_LIMITS: MilkQualityLimits = {
  maxTemperatureCelsius: 6, // INTA Argentina sugiere ≤6°C al ingreso
  minPh: 6.5,
  maxPh: 6.9,
  maxSomaticCellCount: 400_000,
  maxBacterialCount: 100_000,
};

export interface QualityEvaluation {
  acceptable: boolean;
  reasons: string[];
}

// Evalúa el análisis de calidad contra los límites.
// La presencia de antibióticos o el fallo del test de alcohol son rechazos absolutos.
// Los valores fuera de rango se enumeran con mensajes específicos para el usuario.
export function evaluateMilkQuality(
  q: MilkQualityAnalysis,
  limits: MilkQualityLimits = DEFAULT_QUALITY_LIMITS,
): QualityEvaluation {
  const reasons: string[] = [];

  if (q.antibioticsDetected === true) {
    reasons.push('Detección de antibióticos.');
  }
  if (q.alcoholTestPassed === false) {
    reasons.push('Prueba de alcohol positiva (leche inestable).');
  }
  if (q.temperatureCelsius !== undefined && q.temperatureCelsius > limits.maxTemperatureCelsius) {
    reasons.push(
      `Temperatura ${q.temperatureCelsius}°C supera el límite de ${limits.maxTemperatureCelsius}°C.`,
    );
  }
  if (q.ph !== undefined) {
    if (q.ph < limits.minPh) {
      reasons.push(`pH ${q.ph} por debajo del mínimo (${limits.minPh}).`);
    } else if (q.ph > limits.maxPh) {
      reasons.push(`pH ${q.ph} por encima del máximo (${limits.maxPh}).`);
    }
  }
  if (q.somaticCellCount !== undefined && q.somaticCellCount > limits.maxSomaticCellCount) {
    reasons.push(
      `RCS ${q.somaticCellCount.toLocaleString('es-AR')} supera el límite de ${limits.maxSomaticCellCount.toLocaleString('es-AR')} células/ml.`,
    );
  }
  if (q.bacterialCount !== undefined && q.bacterialCount > limits.maxBacterialCount) {
    reasons.push(
      `UFC ${q.bacterialCount.toLocaleString('es-AR')} supera el límite de ${limits.maxBacterialCount.toLocaleString('es-AR')} UFC/ml.`,
    );
  }

  return { acceptable: reasons.length === 0, reasons };
}
