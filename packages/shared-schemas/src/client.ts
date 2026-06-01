import { z } from 'zod';
import { cuitSchema, emailSchema, isoDateTimeSchema, phoneSchema, uuidSchema } from './common';

// Cliente comercial — minorista, mayorista, distribuidor.

export const clientTypeSchema = z.enum(['minorista', 'mayorista', 'distribuidor']);
export type ClientType = z.infer<typeof clientTypeSchema>;

export const clientSchema = z.object({
  id: uuidSchema,
  businessName: z.string().min(1).max(200), // Razón social
  taxId: cuitSchema.optional(), // CUIT
  type: clientTypeSchema,
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  // Condición de pago default: null = contado; N = a N días (vencimiento del cargo).
  paymentTermDays: z.number().int().min(0).max(365).nullable().optional(),
  notes: z.string().max(1000).optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type Client = z.infer<typeof clientSchema>;

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
