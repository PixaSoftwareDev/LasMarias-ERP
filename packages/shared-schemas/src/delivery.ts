import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// CLAUDE.md §4.6.1 y §4.10.1 — Calendario de reparto integrado a pedidos.

export const weekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export type Weekday = z.infer<typeof weekdaySchema>;

export const deliveryZoneSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  description: z.string().optional(),
  deliveryDays: z.array(weekdaySchema),
  cutoffTime: z.string().regex(/^\d{2}:\d{2}$/),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type DeliveryZone = z.infer<typeof deliveryZoneSchema>;

export const deliveryExceptionKindSchema = z.enum(['suspended', 'extra']);
export type DeliveryExceptionKind = z.infer<typeof deliveryExceptionKindSchema>;

export const deliveryExceptionSchema = z.object({
  id: uuidSchema,
  zoneId: uuidSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: deliveryExceptionKindSchema,
  reason: z.string().max(200).optional(),
  createdAt: isoDateTimeSchema,
});
export type DeliveryException = z.infer<typeof deliveryExceptionSchema>;

export const createDeliveryZoneInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  deliveryDays: z.array(weekdaySchema).min(1, 'Elegí al menos un día de reparto'),
  cutoffTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Horario inválido (formato HH:mm)'),
});
export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneInputSchema>;

export const createDeliveryExceptionInputSchema = z.object({
  zoneId: uuidSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: deliveryExceptionKindSchema,
  reason: z.string().max(200).optional(),
});
export type CreateDeliveryExceptionInput = z.infer<typeof createDeliveryExceptionInputSchema>;
