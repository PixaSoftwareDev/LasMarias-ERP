import type { BackupConfig } from '@lasmarias/shared-schemas';

// Lógica PURA del calendario de copias: cuándo corresponde correr, qué copia faltó y
// qué archivos viejos rotar. Sin reloj ni disco: todo entra por parámetro, así los
// tests se verifican a mano (CLAUDE.md §8).

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  // Arranca APAGADO (pedido del dueño, oct 2026): nada corre solo hasta que alguien
  // aprieta "Activar" en la pantalla de Copias, desde la PC donde quiere guardarlas.
  enabled: false,
  hour: '03:00',
  days: [1, 2, 3, 4, 5, 6, 7], // todos los días
};

// El servidor NO es el archivo de copias (pedido del dueño, oct 2026): guarda solo
// una semana como red de seguridad y el historial completo queda en la PC del dueño.
export const MAX_AUTO_FILES = 7;
// Días que sobrevive un archivo en el servidor, también los de las copias manuales.
export const MAX_FILE_AGE_DAYS = 7;

// Clave de fecha LOCAL del servidor (YYYY-MM-DD). Las copias se piensan en "días".
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Día de la semana ISO: 1=lunes … 7=domingo.
export function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

const dayMonth = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

// ¿Corresponde disparar la copia automática ahora? Regla: hoy es un día elegido, ya
// pasó la hora configurada y todavía no hubo un INTENTO automático hoy (si el último
// intento falló, no se reintenta solo: queda el aviso). Al arrancar el servidor esto
// mismo hace de "ponerse al día": si estuvo apagado a la hora, corre apenas prende.
export function isDue(config: BackupConfig, lastAutoAttemptDateKey: string | null, now: Date): boolean {
  if (!config.enabled) return false;
  if (!config.days.includes(isoWeekday(now))) return false;
  const [h, m] = config.hour.split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < (h ?? 0) * 60 + (m ?? 0)) return false;
  return lastAutoAttemptDateKey !== localDateKey(now);
}

// Última fecha programada ANTERIOR a hoy (mira hasta 14 días atrás). Sirve para
// detectar "la copia de ayer no se hizo" cuando el servidor estuvo apagado.
export function previousScheduledDate(config: BackupConfig, now: Date): Date | null {
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (config.days.includes(isoWeekday(d))) return d;
  }
  return null;
}

export interface RunForWarnings {
  startedAt: Date;
  status: 'ok' | 'error';
}

// Avisos para el Inicio ("Para resolver") y la pantalla de copias.
// runs viene ordenado de la más nueva a la más vieja.
export function computeWarnings(config: BackupConfig, runs: RunForWarnings[], now: Date): string[] {
  const warnings: string[] = [];
  if (!config.enabled) {
    warnings.push(
      'Las copias de seguridad están apagadas. Activalas en Copias de seguridad desde la PC donde quieras guardarlas.',
    );
    return warnings;
  }
  if (runs.length === 0) return warnings; // recién instalado: la primera corre sola a la hora.

  const prev = previousScheduledDate(config, now);
  // Antes de la primera copia de la historia el sistema no existía: no es un día perdido.
  const oldest = runs[runs.length - 1];
  if (prev && oldest && localDateKey(prev) >= localDateKey(oldest.startedAt)) {
    const key = localDateKey(prev);
    const ranThatDay = runs.some((r) => r.status === 'ok' && localDateKey(r.startedAt) === key);
    if (!ranThatDay) {
      warnings.push(
        `La copia de seguridad del ${dayMonth(prev)} no se hizo (el servidor estuvo apagado o falló).`,
      );
    }
  }

  const last = runs[0];
  if (last && last.status === 'error') {
    warnings.push('La última copia de seguridad falló. Entrá a Copias de seguridad para ver el detalle.');
  }
  return warnings;
}

export interface RunForPrune {
  trigger: 'auto' | 'manual';
  fileAvailable: boolean;
  startedAt: Date;
}

// Rotación: de las copias con archivo (ordenadas nueva→vieja) devuelve las que lo
// pierden, por dos motivos: ya hay más de `keep` automáticas más nuevas, o el archivo
// pasó los `maxAgeDays` días (esto último alcanza también a las manuales, así el
// servidor nunca junta copias viejas). La fila del historial queda igual.
export function runsToPrune<T extends RunForPrune>(
  runsDesc: T[],
  now: Date,
  keep: number = MAX_AUTO_FILES,
  maxAgeDays: number = MAX_FILE_AGE_DAYS,
): T[] {
  const withFile = runsDesc.filter((r) => r.fileAvailable);
  const sobrantes = withFile.filter((r) => r.trigger === 'auto').slice(keep);
  const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
  const vencidas = withFile.filter((r) => r.startedAt.getTime() < cutoff);
  return [...new Set([...sobrantes, ...vencidas])];
}
