import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

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
  acidityDornic: z
    .number()
    .min(0, 'No puede ser negativo')
    .max(50, 'Valor fuera de rango razonable')
    .optional()
    .describe('Acidez en grados Dornic (°D)'),
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

// Una descarga puede traer leche de varios tambos (hasta 4): cada tambo con sus
// litros, para luego pagarle a cada productor por separado (pedido #17).
export const milkReceptionLineSchema = z.object({
  producerId: uuidSchema,
  producerName: z.string().min(1).max(200),
  liters: z.number().positive(),
  declaredLiters: z.number().nonnegative().optional(),
  // $/litro en pesos congelado al recibir (con IVA si el tambo es "con IVA"). Base del
  // pago a ese tambo.
  pricePerLiter: z.number().nonnegative().optional(),
});
export type MilkReceptionLine = z.infer<typeof milkReceptionLineSchema>;

export const milkReceptionSchema = z.object({
  id: uuidSchema,
  code: z.string().min(1).max(50), // código de lote generado
  receivedAt: isoDateTimeSchema,
  // Tambo "primario" (el primero de la descarga); el detalle real por tambo está en `lines`.
  producerId: uuidSchema,
  producerName: z.string().min(1).max(200), // denormalizado para reportes
  // Detalle por tambo (1..4). Vacío en recepciones viejas single-tambo.
  lines: z.array(milkReceptionLineSchema).default([]),
  vehiclePlate: z.string().max(20).optional(),
  driverName: z.string().max(120).optional(),
  remito: z.string().max(50).optional(),
  // Litros declarados en el remito (lo que dice el papel del transporte).
  declaredLiters: z.number().nonnegative().optional(),
  liters: z.number().positive('Los litros tienen que ser mayor a 0'),
  // Diferencia automática = litros recibidos − litros declarados (derivado).
  litersDifference: z.number().optional(),
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
  // Tambos de la descarga: 1 (single) hasta 4. Cada uno con sus litros (y declarados).
  producers: z
    .array(
      z.object({
        producerId: uuidSchema,
        liters: z
          .number({ invalid_type_error: 'Los litros tienen que ser un número' })
          .positive('Los litros tienen que ser mayor a 0'),
        declaredLiters: z.number().nonnegative().optional(),
      }),
    )
    .min(1, 'Cargá al menos un tambo')
    .max(4, 'Hasta 4 tambos por descarga'),
  vehiclePlate: z.string().max(20).optional(),
  driverName: z.string().max(120).optional(),
  remito: z.string().max(50).optional(),
  quality: milkQualityAnalysisSchema,
  // Destino de la leche en silos. La descarga se puede REPARTIR en varios silos cuando no
  // entra toda en uno (pedido: validar capacidad y pedir sumar otro silo). Cada asignación
  // genera su propio lote en ese silo. Si se omite, la leche queda en un único lote sin silo.
  silos: z
    .array(
      z.object({
        warehouseId: uuidSchema,
        liters: z.number().positive('Los litros tienen que ser mayor a 0'),
      }),
    )
    .max(10)
    .optional(),
  // Compat: cámara/sector único (si no se usa el reparto por silos).
  warehouseId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
  // Si el sistema detecta una recepción igual del mismo día (posible doble carga) frena y
  // avisa. El front reenvía con este flag en true cuando el usuario confirma que es real.
  confirmDuplicate: z.boolean().optional(),
});

export type CreateMilkReceptionInput = z.infer<typeof createMilkReceptionInputSchema>;
