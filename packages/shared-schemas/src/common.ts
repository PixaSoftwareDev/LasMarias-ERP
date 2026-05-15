import { z } from 'zod';

// Tipos primitivos reutilizables.

export const uuidSchema = z.string().uuid();

export const isoDateTimeSchema = z.string().datetime({ offset: true });

// CUIT argentino — 11 dígitos. Validación simple (formato), no checksum.
export const cuitSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d{1}$/, 'CUIT inválido (formato esperado: 20-12345678-9)');

// Email opcional pero estricto
export const emailSchema = z.string().email('Email inválido');

// Teléfono Argentina (permisivo, con o sin código de país)
export const phoneSchema = z
  .string()
  .min(6, 'Teléfono demasiado corto')
  .max(20, 'Teléfono demasiado largo')
  .regex(/^[+\d\s\-()]+$/, 'Teléfono inválido');

// Decimal monetario / cantidades — string para no perder precisión
export const decimalSchema = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'string' ? Number(v) : v))
  .refine((n) => !Number.isNaN(n) && Number.isFinite(n), 'Número inválido');

// Paginación común
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    data: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
