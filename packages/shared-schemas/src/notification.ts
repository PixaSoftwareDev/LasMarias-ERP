import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// CLAUDE.md §4.11 — Sistema transversal de alertas.

export const notificationSeveritySchema = z.enum(['info', 'warning', 'danger']);
export type NotificationSeverity = z.infer<typeof notificationSeveritySchema>;

export const notificationKindSchema = z.enum([
  'low_stock',
  'near_expiration',
  'milk_quality_blocked',
  'production_yield_deviation',
  'overdue_invoice',
  'pending_delivery',
  'system',
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  body: z.string().optional(),
  severity: notificationSeveritySchema,
  kind: notificationKindSchema,
  referenceType: z.string().optional(),
  referenceId: uuidSchema.optional(),
  read: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type Notification = z.infer<typeof notificationSchema>;
