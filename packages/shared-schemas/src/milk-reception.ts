import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common.js';

// Recepción de leche cruda en planta (CLAUDE.md §4.1).
// Cada ingreso es una recepción; al guardarse genera un lote de leche cruda.

// Análisis de calidad. Los límites configurables están en el dominio del backend.
export const milkQualityAnalysisSchema = z.object({
  // Composición
  fatPercent: z
    .number()
    .min(0, 'No puede ser negativo')
    .max(15, 'Valor fuera de rango razonable')
    .optional(),
  proteinPercent: z.number().min(0).max(10).optional(),
  // Recuentos
  somaticCellCount: z
    .number()
    .int()
    .min(0, 'No puede ser negativo')
    .optional()
    .describe('RCS — Recuento de Células Somáticas, células/ml'),
  bacterialCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('UFC — Unidades Formadoras de Colonias, UFC/ml'),
  // Pruebas binarias
  alcoholTestPassed: z.boolean().optional(),
  antibioticsDetected: z.boolean().optional(),
  // Físico-químicos
  ph: z.number().min(0).max(14).optional(),
  temperatureCelsius: z
    .number()
    .min(-5, 'Temperatura fuera de rango')
    .max(40, 'Temperatura fuera de rango')
    .optional(),
});

export type MilkQualityAnalysis = z.infer<typeof milkQualityAnalysisSchema>;

export const milkReceptionStatusSchema = z.enum([
  'aceptada',
  'bloqueada',  // calidad fuera de límite — bloqueo automático
  'anulada',
]);
export type MilkReceptionStatus = z.infer<typeof milkReceptionStatusSchema>;

export const milkReceptionSchema = z.object({
  id: uuidSchema,
  code: z.string().min(1).max(50), // código de lote generado
  receivedAt: isoDateTimeSchema,
  producerId: uuidSchema,
  producerName: z.string().min(1).max(200), // denormalizado para reportes
  vehiclePlate: z.string().max(20).optional(),
  driverName: z.string().max(120).optional(),
  liters: z.number().positive('Los litros tienen que ser mayor a 0'),
  quality: milkQualityAnalysisSchema,
  status: milkReceptionStatusSchema,
  blockedReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  batchId: uuidSchema.optional(),
  createdBy: uuidSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type MilkReception = z.infer<typeof milkReceptionSchema>;

// Input para crear: el usuario carga lo importante; el sistema genera código,
// estado y batch.
export const createMilkReceptionInputSchema = z.object({
  receivedAt: isoDateTimeSchema,
  producerId: uuidSchema,
  vehiclePlate: z.string().max(20).optional(),
  driverName: z.string().max(120).optional(),
  liters: z
    .number({ invalid_type_error: 'Los litros tienen que ser un número' })
    .positive('Los litros tienen que ser mayor a 0'),
  quality: milkQualityAnalysisSchema,
  notes: z.string().max(1000).optional(),
});

export type CreateMilkReceptionInput = z.infer<typeof createMilkReceptionInputSchema>;
