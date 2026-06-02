import { z } from 'zod';

// Configuración editable por el admin (CLAUDE.md §4.10): datos de la empresa para el
// remito y límites de calidad de leche para el bloqueo automático de recepciones.

// --- Datos de la empresa (salen en el remito) ---
export const companySettingsSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  taxId: z.string().max(30).optional(),
  phone: z.string().max(60).optional(),
});
export type CompanySettings = z.infer<typeof companySettingsSchema>;

// --- Límites de calidad de la leche (umbrales de bloqueo) ---
export const qualityLimitsSchema = z.object({
  maxTemperatureCelsius: z.number().positive(),
  minPh: z.number().positive(),
  maxPh: z.number().positive(),
  maxSomaticCellCount: z.number().int().positive(),
  maxBacterialCount: z.number().int().positive(),
});
export type QualityLimits = z.infer<typeof qualityLimitsSchema>;

// Configuración completa que devuelve la app.
export const appSettingsSchema = z.object({
  company: companySettingsSchema,
  qualityLimits: qualityLimitsSchema,
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

// Inputs de actualización (cada grupo se guarda por separado).
export const updateCompanySettingsSchema = companySettingsSchema;
export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;

export const updateQualityLimitsSchema = qualityLimitsSchema.refine(
  (v) => v.minPh < v.maxPh,
  { message: 'El pH mínimo debe ser menor que el máximo', path: ['minPh'] },
);
export type UpdateQualityLimitsInput = z.infer<typeof updateQualityLimitsSchema>;
