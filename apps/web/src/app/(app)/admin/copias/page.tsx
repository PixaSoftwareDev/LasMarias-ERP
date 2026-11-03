'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Download, DatabaseBackup, HardDriveDownload, Loader2, MonitorCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/page-header';
import { backupsApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  disableAutoSave,
  enableAutoSave,
  isAutoSaveEnabled,
  lastSavedAt,
  savedBackupIds,
  syncBackupsToThisPc,
} from '@/hooks/use-backup-auto-save';
import type { BackupRun } from '@lasmarias/shared-schemas';

// Copias de seguridad de la base. La copia corre SOLA en el servidor todos los días a
// una hora FIJA (no se configura desde acá: pedido del dueño, oct 2026). "Guardar en
// esta PC" baja las copias nuevas a Descargas cada vez que la app está abierta en esta
// computadora.

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']; // ISO 1..7
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CopiasPage() {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({ queryKey: ['backups'], queryFn: () => backupsApi.overview() });
  const overview = overviewQuery.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['backups'] });

  const servidorPrendido = !!overview?.config.enabled;

  // Días en que se hace la copia (la hora es siempre 03:00). Se guardan al tocarlos.
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [loadedKey, setLoadedKey] = useState('');
  useEffect(() => {
    if (!overview) return;
    const key = JSON.stringify(overview.config.days);
    if (key === loadedKey) return;
    setLoadedKey(key);
    setDays(overview.config.days);
  }, [overview, loadedKey]);

  const saveDays = useMutation({
    mutationFn: (next: number[]) => backupsApi.updateConfig({ enabled: true, days: next }),
    onSuccess: () => refresh(),
    onError: (e) => {
      setDays(overview?.config.days ?? [1, 2, 3, 4, 5, 6, 7]);
      toast.error(e instanceof ApiError ? e.message : 'No se pudieron guardar los días. Probá de nuevo.');
    },
  });

  function toggleDay(day: number) {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
    if (next.length === 0) {
      toast.error('Tiene que quedar al menos un día con copia.');
      return;
    }
    setDays(next);
    saveDays.mutate(next);
  }

  const runNow = useMutation({
    mutationFn: () => backupsApi.runNow(),
    onSuccess: (run) => {
      refresh();
      if (run.status === 'ok') toast.success('Copia hecha en el servidor.');
      else toast.error(`La copia falló: ${run.error ?? 'error desconocido'}`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo hacer la copia.'),
  });

  // --- Guardado en ESTA PC ---
  const [autoSave, setAutoSave] = useState(false);
  const [lastLocal, setLastLocal] = useState<string | null>(null);
  const [togglingPc, setTogglingPc] = useState(false);
  const [enEstaPc, setEnEstaPc] = useState<string[]>([]);
  useEffect(() => {
    setAutoSave(isAutoSaveEnabled());
    setLastLocal(lastSavedAt());
    setEnEstaPc(savedBackupIds());
  }, []);

  // Un solo interruptor (pedido del dueño, oct 2026): apretar "Guardar copias en esta
  // PC" prende TAMBIÉN la copia automática del servidor. Apagarlo solo deja de bajar
  // las copias a esta computadora: el servidor sigue copiando igual.
  async function togglePcSave() {
    if (!overview) return;
    setTogglingPc(true);
    try {
      if (autoSave && overview.config.enabled) {
        disableAutoSave();
        setAutoSave(false);
        toast.success('Esta PC ya no guarda copias. El servidor sigue copiando igual.');
      } else {
        if (!overview.config.enabled) {
          await backupsApi.updateConfig({ enabled: true, days });
          // Primera copia ya mismo, para comprobar en el momento que todo anda.
          const run = await backupsApi.runNow();
          if (run.status !== 'ok') {
            toast.error(`La primera copia falló: ${run.error ?? 'error desconocido'}. Revisá el detalle abajo.`);
          }
        }
        const fresh = await backupsApi.overview();
        await enableAutoSave(fresh);
        setAutoSave(true);
        setLastLocal(lastSavedAt());
        setEnEstaPc(savedBackupIds());
        refresh();
        toast.success('Listo: el servidor copia solo todos los días y esta PC las guarda.');
      }
    } catch {
      toast.error('No se pudo guardar la copia en esta PC. Probá de nuevo.');
    } finally {
      setTogglingPc(false);
    }
  }

  async function syncNow() {
    setTogglingPc(true);
    try {
      const n = await syncBackupsToThisPc(overview);
      if (n === 0) toast.success('Esta PC ya tiene todas las copias.');
      setLastLocal(lastSavedAt());
      setEnEstaPc(savedBackupIds());
    } catch {
      toast.error('No se pudieron bajar las copias. Probá de nuevo.');
    } finally {
      setTogglingPc(false);
    }
  }

  // "Prendido" de verdad = el servidor copia solo Y esta PC las guarda. Si el
  // servidor está apagado, el botón vuelve a ser el de arrancar todo.
  const prendido = servidorPrendido && autoSave;

  const download = useMutation({
    mutationFn: (run: BackupRun) => backupsApi.download(run),
    onSuccess: () => {
      setEnEstaPc(savedBackupIds());
      toast.success('Copia descargada.');
    },
    onError: () => toast.error('No se pudo descargar esa copia.'),
  });

  const columns: Column<BackupRun>[] = [
    {
      key: 'fecha',
      header: 'Fecha',
      primary: true,
      render: (r) => <span className="font-medium">{formatDateTime(r.startedAt)}</span>,
      sortValue: (r) => r.startedAt,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (r) =>
        r.status === 'ok' ? (
          <StatusBadge status="success">OK</StatusBadge>
        ) : (
          <StatusBadge status="danger">Falló</StatusBadge>
        ),
    },
    {
      key: 'donde',
      header: 'Guardada en',
      render: (r) =>
        r.status !== 'ok' ? (
          <span className="text-xs text-foreground-muted">—</span>
        ) : enEstaPc.includes(r.id) ? (
          <StatusBadge status="success">En esta PC</StatusBadge>
        ) : (
          <StatusBadge status="neutral">Solo en el servidor</StatusBadge>
        ),
    },
    {
      key: 'origen',
      header: 'Origen',
      secondary: true,
      render: (r) => (r.trigger === 'auto' ? 'Automática' : 'Manual'),
    },
    {
      key: 'tamano',
      header: 'Tamaño',
      align: 'right',
      secondary: true,
      render: (r) => formatSize(r.sizeBytes),
    },
    {
      key: 'bajar',
      header: '',
      align: 'right',
      render: (r) =>
        r.status === 'ok' && r.fileAvailable ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => download.mutate(r)}
            disabled={download.isPending}
            aria-label={`Descargar la copia del ${formatDateTime(r.startedAt)}`}
          >
            <Download className="mr-1 h-4 w-4" aria-hidden="true" /> Descargar
          </Button>
        ) : r.status === 'ok' ? (
          <span className="text-xs text-foreground-muted">Archivo rotado</span>
        ) : (
          <span className="text-xs text-red-600" title={r.error ?? undefined}>
            {r.error ? r.error.slice(0, 60) : 'Error'}
          </span>
        ),
    },
  ];

  // Apagado: la tarjeta ya explica que falta prenderlo, así que no repetimos avisos.
  const warnings = servidorPrendido ? (overview?.warnings ?? []) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Copias de seguridad"
        description="Un respaldo de toda la información del sistema, hecho solo todos los días y guardado en esta computadora."
        backHref="/admin"
        backLabel="Volver a Datos maestros"
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => runNow.mutate()} disabled={runNow.isPending}>
              {runNow.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Haciendo copia…
                </>
              ) : (
                <>
                  <DatabaseBackup className="mr-2 h-4 w-4" aria-hidden="true" /> Hacer copia ahora
                </>
              )}
            </Button>
          </div>
        }
      />

      {warnings.length > 0 && (
        <div className="space-y-2" role="alert">
          {warnings.map((w) => (
            <div key={w} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4">
        {/* Único lugar donde se prende todo: la PC donde se guardan las copias. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDriveDownload className="h-5 w-5 text-primary-600" aria-hidden="true" />
              Guardar copias en esta PC
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-foreground-muted">
              {servidorPrendido
                ? 'Las copias se hacen solas todos los días y quedan guardadas en esta computadora. En el servidor se conserva además la última semana, como respaldo.'
                : 'Apretá el botón para arrancar las copias de seguridad. A partir de ahí se hacen solas todos los días y se guardan en esta computadora.'}
            </p>
            {servidorPrendido && (
              <div>
                <span className="mb-2 block text-sm font-medium">Días en que se hace la copia</span>
                <div className="flex gap-2" role="group" aria-label="Días en que se hace la copia">
                  {DAY_LABELS.map((label, i) => {
                    const day = i + 1;
                    const active = days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={active}
                        aria-label={DAY_NAMES[i]}
                        onClick={() => toggleDay(day)}
                        disabled={saveDays.isPending}
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-semibold transition-colors',
                          active
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-border bg-surface text-foreground-muted hover:border-primary-300',
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-foreground-muted">
                  Tocá un día para sacarlo o volver a ponerlo. Si los domingos no se trabaja,
                  podés dejarlo afuera.
                </p>
              </div>
            )}

            {prendido && (
              <p className="flex items-center gap-2 text-sm text-primary-700">
                <MonitorCheck className="h-4 w-4" aria-hidden="true" />
                {lastLocal
                  ? `Última copia guardada en esta PC: ${formatDateTime(lastLocal)}`
                  : 'Activado en esta PC.'}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={prendido ? 'secondary' : 'primary'}
                onClick={togglePcSave}
                disabled={togglingPc || !overview}
              >
                {togglingPc ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Un momento…
                  </>
                ) : prendido ? (
                  'Dejar de guardar en esta PC'
                ) : (
                  'Activar copias de seguridad en esta PC'
                )}
              </Button>
              {prendido && (
                <Button variant="ghost" onClick={syncNow} disabled={togglingPc}>
                  Bajar las que falten ahora
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {overviewQuery.isLoading ? (
        <TableSkeleton rows={5} />
      ) : (
        <DataTable
          data={overview?.runs ?? []}
          columns={columns}
          getKey={(r) => r.id}
          pageSize={10}
          emptyIcon={DatabaseBackup}
          emptyTitle="Todavía no hay copias"
          emptyDescription="La primera se va a hacer sola de madrugada, o tocá «Hacer copia ahora»."
        />
      )}
    </div>
  );
}
