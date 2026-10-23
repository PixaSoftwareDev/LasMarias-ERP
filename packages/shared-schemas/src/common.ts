import { z } from 'zod';

// Tipos primitivos reutilizables.

export const uuidSchema = z.string().uuid();

export const isoDateTimeSchema = z.string().datetime({ offset: true });

// CUIT argentino — 11 dígitos. Validación simple (formato), no checksum.
export const cuitSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d{1}$/, 'CUIT inválido (formato esperado: 20-12345678-9)')
  // "00000000000" no es un CUIT: es lo que se tipea cuando el cliente no tiene. Va vacío.
  .refine((v) => /[1-9]/.test(v), 'Si el cliente no tiene CUIT, dejá el campo vacío.');

// CUIT opcional de verdad: el campo vacío del formulario llega como "" y antes se rechazaba
// por "CUIT inválido", así que un cliente sin CUIT no se podía cargar (por eso en producción
// tipearon 00000000000). Vacío = null: al crear queda sin CUIT y al editar BORRA el que tenía.
export const optionalCuitSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  cuitSchema.nullable().optional(),
);

// Email opcional pero estricto
export const emailSchema = z.string().email('Email inválido');

// Email opcional de verdad: un input vacío ("" o solo espacios) cuenta como
// "sin email", no como email inválido. Si viene algo, se valida el formato.
export const optionalEmailSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  emailSchema.optional(),
);

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

// BULTOS — cuenta de bolsas/cajas que viaja en paralelo a los kg (pedido del dueño,
// jul 2026). Siempre ENTERO y opcional: null/undefined = "no se contaron bultos", que es
// el caso de todo lo cargado antes de esta función y de la leche a granel. El kg sigue
// siendo la unidad de control (stock, FEFO, costo); el bulto es una cuenta paralela.
export const bultosSchema = z
  .number()
  .int('Los bultos se cuentan enteros')
  .nonnegative('Los bultos no pueden ser negativos')
  .optional();

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
