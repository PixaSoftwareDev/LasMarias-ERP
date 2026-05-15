import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

// CLAUDE.md §4.8 — RRHH y asistencia biométrica.

export const employeeSchema = z.object({
  id: uuidSchema,
  externalId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  documentNumber: z.string().optional(),
  sector: z.string().optional(),
  shift: z.enum(['morning', 'afternoon', 'night', 'rotating']).optional(),
  hourlyCost: z.number().nonnegative().optional(),
  hiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Employee = z.infer<typeof employeeSchema>;

export const attendanceEventTypeSchema = z.enum(['in', 'out']);
export type AttendanceEventType = z.infer<typeof attendanceEventTypeSchema>;

export const attendanceEventSchema = z.object({
  id: uuidSchema,
  employeeId: uuidSchema,
  employeeName: z.string(),
  type: attendanceEventTypeSchema,
  timestamp: isoDateTimeSchema,
  source: z.enum(['biometric', 'manual']),
  deviceId: z.string().optional(),
  geoLat: z.number().optional(),
  geoLng: z.number().optional(),
  createdAt: isoDateTimeSchema,
});
export type AttendanceEvent = z.infer<typeof attendanceEventSchema>;

export const createEmployeeInputSchema = z.object({
  externalId: z.string().max(50).optional(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  documentNumber: z.string().max(20).optional(),
  sector: z.string().max(60).optional(),
  shift: z.enum(['morning', 'afternoon', 'night', 'rotating']).optional(),
  hourlyCost: z.number().nonnegative().optional(),
  hiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeInputSchema>;

export const ingestAttendanceInputSchema = z.object({
  events: z
    .array(
      z.object({
        externalEmployeeId: z.string(),
        type: attendanceEventTypeSchema,
        timestamp: isoDateTimeSchema,
        deviceId: z.string().optional(),
      }),
    )
    .min(1),
});
export type IngestAttendanceInput = z.infer<typeof ingestAttendanceInputSchema>;

export const manualAttendanceInputSchema = z.object({
  employeeId: uuidSchema,
  type: attendanceEventTypeSchema,
  geoLat: z.number().optional(),
  geoLng: z.number().optional(),
  notes: z.string().max(500).optional(),
});
export type ManualAttendanceInput = z.infer<typeof manualAttendanceInputSchema>;
