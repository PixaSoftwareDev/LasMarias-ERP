'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Download, DatabaseBackup, HardDriveDownload, Loader2, MonitorCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
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
  syncBackupsToThisPc,
} from '@/hooks/use-backup-auto-save';
import type { BackupRun } from '@lasmarias/shared-schemas';

// Copias de seguridad de la base. La copia corre SOLA en el servidor (días + hora
// configurables acá). "Guardar en esta PC" baja las copias nuevas a Descargas cada
// vez que la app está abierta en esta computadora.

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']; // ISO 1..7

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

  // --- Config editable (se precarga cuando llega la data) ---
  const [enabled, setEnabled] = useState(true);
  const [hour, setHour] = useState('03:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [loadedKey, setLoadedKey] = useState('');
  useEffect(() => {
    if (!overview) return;
    const key = JSON.stringify(overview.config);
    if (key === loadedKey) return;
    setLoadedKey(key);
    setEnabled(overview.config.enabled);
    setHour(overview.config.hour);
    setDays(overview.config.days);
  }, [overview, loadedKey]);

  const saveConfig = useMutation({
    mutationFn: () => backupsApi.updateConfig({ enabled, hour, days: [...days].sort((a, b) => a - b) }),
    onSuccess: () => {
      refresh();
      toast.success('Configuración guardada.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar. Probá de nuevo.'),
  });

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
  useEffect(() => {
    setAutoSave(isAutoSaveEnabled());
    setLastLocal(lastSavedAt());
  }, []);

  async function togglePcSave() {
    if (!overview) return;
    setTogglingPc(true);
    try {
      if (autoSave) {
        disableAutoSave();
        setAutoSave(false);
        toast.success('Esta PC ya no guarda copias automáticamente.');
      } else {
        await enableAutoSave(overview);
        setAutoSave(true);
        setLastLocal(lastSavedAt());
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
    } catch {
      toast.error('No se pudieron bajar las copias. Probá de nuevo.');
    } finally {
      setTogglingPc(false);
    }
  }

  const download = useMutation({
    mutationFn: (run: BackupRun) => backupsApi.download(run),
    onSuccess: () => toast.success('Copia descargada.'),
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

  const warnings = overview?.warnings ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Copias de seguridad"
        description="La copia de la base se hace sola en el servidor. Desde acá también se descarga a esta PC."
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

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Automático en el servidor */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseBackup className="h-5 w-5 text-primary-600" aria-hidden="true" />
              Copia automática en el servidor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-5 w-5 rounded border-border accent-primary-600"
              />
              <span className="text-sm font-medium">Hacer una copia automática</span>
            </label>

            <Field label="Hora" htmlFor="backup-hour" hint="Hora del servidor. De madrugada no molesta a nadie.">
              <Input
                id="backup-hour"
                type="time"
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                disabled={!enabled}
                className="max-w-[160px]"
              />
            </Field>

            <div>
              <span className="mb-2 block text-sm font-medium">Días</span>
              <div className="flex gap-2" role="group" aria-label="Días de la semana">
                {DAY_LABELS.map((label, i) => {
                  const day = i + 1;
                  const active = days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!enabled}
                      aria-pressed={active}
                      aria-label={['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i]}
                      onClick={() =>
                        setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
                      }
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-semibold transition-colors',
                        active
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-border bg-surface text-foreground-muted hover:border-primary-300',
                        !enabled && 'opacity-50',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {enabled && days.length === 0 && (
                <p className="mt-1 text-xs text-red-600">Elegí al menos un día.</p>
              )}
            </div>

            <Button
              onClick={() => saveConfig.mutate()}
              disabled={saveConfig.isPending || (enabled && days.length === 0)}
              className="w-full sm:w-auto"
            >
              {saveConfig.isPending ? 'Guardando…' : 'Guardar configuración'}
            </Button>
          </CardContent>
        </Card>

        {/* Guardado en esta PC */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDriveDownload className="h-5 w-5 text-primary-600" aria-hidden="true" />
              Guardar copias en esta PC
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-foreground-muted">
              Con esto prendido, cada vez que abras la aplicación en esta computadora las copias
              nuevas se bajan solas a tu carpeta de Descargas. Si la PC estuvo apagada, se pone al
              día al abrir y te avisa.
            </p>
            {autoSave && (
              <p className="flex items-center gap-2 text-sm text-primary-700">
                <MonitorCheck className="h-4 w-4" aria-hidden="true" />
                {lastLocal
                  ? `Última copia guardada en esta PC: ${formatDateTime(lastLocal)}`
                  : 'Activado en esta PC.'}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={autoSave ? 'secondary' : 'primary'}
                onClick={togglePcSave}
                disabled={togglingPc || !overview}
              >
                {togglingPc ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Un momento…
                  </>
                ) : autoSave ? (
                  'Dejar de guardar en esta PC'
                ) : (
                  'Guardar copias en esta PC'
                )}
              </Button>
              {autoSave && (
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
          emptyDescription="La primera se va a hacer sola a la hora configurada, o tocá «Hacer copia ahora»."
        />
      )}
    </div>
  );
}
