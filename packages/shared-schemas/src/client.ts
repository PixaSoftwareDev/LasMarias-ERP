import { z } from 'zod';
import { cuitSchema, optionalEmailSchema, isoDateTimeSchema, phoneSchema, uuidSchema } from './common';
import { currencySchema, ivaModeSchema } from './money';

// Cliente comercial — minorista o mayorista.

export const clientTypeSchema = z.enum(['minorista', 'mayorista']);
export type ClientType = z.infer<typeof clientTypeSchema>;

export const clientSchema = z.object({
  id: uuidSchema,
  businessName: z.string().min(1).max(200), // Razón social
  taxId: cuitSchema.optional(), // CUIT
  type: clientTypeSchema,
  email: optionalEmailSchema,
  phone: phoneSchema.optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  // Condición de pago default: null = contado; N = a N días (vencimiento del cargo).
  paymentTermDays: z.number().int().min(0).max(365).nullable().optional(),
  // Tratamiento de IVA al venderle a este cliente: 'con_iva' le suma la alícuota al
  // precio; 'sin_iva' va directo. Se carga caso por caso (no aplica a todos).
  ivaMode: ivaModeSchema.optional(),
  notes: z.string().max(1000).optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Client = z.infer<typeof clientSchema>;

// --- Precio particular por cliente (override sobre la lista por tipo) ---
// Un precio especial por (cliente, producto), cargado a mano por el comercial.
export const clientPriceItemSchema = z.object({
  productId: uuidSchema,
  productName: z.string(),
  sku: z.string(),
  unit: z.string(),
  unitPrice: z.number().nonnegative(),
  currency: currencySchema.optional(),
});
export type ClientPriceItem = z.infer<typeof clientPriceItemSchema>;

// Upsert masivo: reemplaza los precios particulares vigentes del cliente.
export const upsertClientPricesInputSchema = z.object({
  currency: currencySchema.optional(),
  items: z
    .array(z.object({ productId: uuidSchema, unitPrice: z.number().nonnegative() }))
    .min(1, 'Cargá al menos un precio'),
});
export type UpsertClientPricesInput = z.infer<typeof upsertClientPricesInputSchema>;

export const createClientInputSchema = clientSchema.omit({
  id: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateClientInput = z.infer<typeof createClientInputSchema>;

export const updateClientInputSchema = createClientInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;
