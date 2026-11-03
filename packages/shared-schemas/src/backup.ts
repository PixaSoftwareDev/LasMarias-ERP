import { z } from 'zod';

// Copias de seguridad de la base. La copia corre SOLA en el servidor todos los días a
// una hora FIJA (no configurable desde la app); la PC del dueño solo descarga
// (pantalla Admin → Copias).

// Días de la semana en formato ISO: 1=lunes … 7=domingo (como los muestra la pantalla, L a D).
export const backupConfigSchema = z.object({
  enabled: z.boolean(),
  hour: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (formato HH:MM, ej: 03:00)'),
  days: z
    .array(z.number().int().min(1).max(7))
    .min(1, 'Elegí al menos un día de la semana'),
});
export type BackupConfig = z.infer<typeof backupConfigSchema>;

// La HORA no se configura desde la app (pedido del dueño, oct 2026): la copia corre
// siempre a las 03:00. Sí se eligen los DÍAS (ej. sin domingos) y prendido/apagado.
export const updateBackupConfigInputSchema = backupConfigSchema.pick({ enabled: true, days: true });
export type UpdateBackupConfigInput = z.infer<typeof updateBackupConfigInputSchema>;

// Una corrida de copia (automática o a mano), con su resultado.
export const backupRunSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.string(),
  status: z.enum(['ok', 'error']),
  trigger: z.enum(['auto', 'manual']),
  fileName: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  error: z.string().nullable(),
  // false = el archivo ya se borró por rotación (la fila queda como historial).
  fileAvailable: z.boolean(),
});
export type BackupRun = z.infer<typeof backupRunSchema>;

export const backupsOverviewSchema = z.object({
  config: backupConfigSchema,
  runs: z.array(backupRunSchema),
  // Avisos listos para mostrar (Inicio → "Para resolver" y la pantalla de copias).
  warnings: z.array(z.string()),
});
export type BackupsOverview = z.infer<typeof backupsOverviewSchema>;
