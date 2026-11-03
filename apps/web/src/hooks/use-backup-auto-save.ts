'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import type { BackupsOverview, User } from '@lasmarias/shared-schemas';
import { backupsApi } from '@/features/api';

// Guardado de copias EN ESTA PC: el servidor hace la copia solo; cuando la app está
// abierta en la PC del admin, las copias nuevas se descargan solas a su carpeta de
// Descargas. Si la PC estuvo apagada, al abrir la app se pone al día y avisa.
// Todo el estado vive en ESTE navegador (localStorage): es una preferencia por PC.

const FLAG_KEY = 'lm.backupAutoSave';
const SAVED_KEY = 'lm.backupSavedIds';
const LAST_KEY = 'lm.backupLastSavedAt';
const SESSION_KEY = 'lm.backupSyncDone';
const MAX_PER_SYNC = 7; // tope por si la app estuvo cerrada muchos días

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* modo privado: la preferencia no persiste, nada se rompe */
  }
};

export const isAutoSaveEnabled = () => read(FLAG_KEY) === '1';
export const lastSavedAt = (): string | null => read(LAST_KEY);

const getSavedIds = (): string[] => {
  try {
    return JSON.parse(read(SAVED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const setSavedIds = (ids: string[]) => write(SAVED_KEY, JSON.stringify(ids.slice(-200)));

// Ids de las copias que YA están descargadas en esta computadora (para mostrarlo en
// el historial: "En esta PC" vs "Solo en el servidor").
export const savedBackupIds = (): string[] => getSavedIds();

const todayKey = () => new Date().toDateString();
const isBeforeToday = (iso: string) => new Date(iso).toDateString() !== todayKey();

// Descarga a esta PC las copias que falten. Devuelve cuántas guardó.
export async function syncBackupsToThisPc(overview?: BackupsOverview): Promise<number> {
  const data = overview ?? (await backupsApi.overview());
  const saved = getSavedIds();
  const pending = data.runs
    .filter((r) => r.status === 'ok' && r.fileAvailable && !saved.includes(r.id))
    .slice(0, MAX_PER_SYNC)
    .reverse(); // de la más vieja a la más nueva
  if (pending.length === 0) return 0;

  const missedBefore = pending.some((r) => isBeforeToday(r.startedAt));
  if (missedBefore) {
    toast.warning('Había copias sin guardar en esta PC (estaba apagada o la app cerrada). Guardándolas ahora…');
  }
  for (const run of pending) {
    // eslint-disable-next-line no-await-in-loop
    await backupsApi.download(run);
    saved.push(run.id);
    setSavedIds(saved);
  }
  write(LAST_KEY, new Date().toISOString());
  toast.success(
    pending.length === 1 ? 'Copia de seguridad guardada en esta PC.' : `${pending.length} copias de seguridad guardadas en esta PC.`,
  );
  return pending.length;
}

// Prender el guardado en esta PC: lo viejo se da por visto (no inunda Descargas con
// toda la historia) y se baja solo la última copia como comprobación.
export async function enableAutoSave(overview: BackupsOverview): Promise<void> {
  const ok = overview.runs.filter((r) => r.status === 'ok' && r.fileAvailable);
  const latest = ok[0];
  setSavedIds(ok.slice(1).map((r) => r.id));
  write(FLAG_KEY, '1');
  if (latest) await syncBackupsToThisPc(overview);
}

export function disableAutoSave(): void {
  write(FLAG_KEY, '0');
}

// Se monta en el shell de la app: una vez por sesión de navegador, si el usuario es
// admin y el guardado está prendido, baja las copias que falten.
export function useBackupAutoSave(user: User | null): void {
  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    if (!isAutoSaveEnabled()) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') return;
      sessionStorage.setItem(SESSION_KEY, '1'); // antes del await: evita doble corrida
    } catch {
      return;
    }
    void syncBackupsToThisPc().catch(() => {
      toast.error('No se pudieron guardar las copias en esta PC. Entrá a Copias de seguridad para reintentar.');
    });
  }, [user]);
}
