'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { DeliveryException, DeliveryZone, Weekday } from '@lasmarias/shared-schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { deliveryApi } from '@/features/api';
import { ApiError } from '@/lib/api-client';

const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom',
};
// Orden ISO (lunes primero)
const WEEKDAY_ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function dayOfWeekKey(date: Date): Weekday {
  const js = date.getDay(); // 0=sun
  const order: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return order[js] as Weekday;
}

function buildCalendarWeeks(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // Start on Monday (ISO week)
  const startOffset = (first.getDay() + 6) % 7;
  const cells: (Date | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface DayPopoverProps {
  date: Date;
  zone: DeliveryZone;
  isDeliveryDay: boolean;
  exception?: DeliveryException;
  onClose: () => void;
}

function DayPopover({ date, zone, isDeliveryDay, exception, onClose }: DayPopoverProps) {
  const queryClient = useQueryClient();
  const dateStr = isoDate(date.getFullYear(), date.getMonth(), date.getDate());
  const label = date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  const addException = useMutation({
    mutationFn: (kind: 'suspended' | 'extra') =>
      deliveryApi.createException({ zoneId: zone.id, date: dateStr, kind }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-exceptions', zone.id] });
      toast.success('Excepción guardada');
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Error'),
  });

  return (
    <div className="absolute z-10 mt-1 w-64 rounded-lg border border-border bg-surface-elevated p-4 shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-sm font-medium capitalize">{label}</p>
        <button onClick={onClose} className="text-foreground-muted hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      {exception ? (
        <div className={`rounded-md px-3 py-2 text-sm ${exception.kind === 'suspended' ? 'bg-error-50 text-error-700' : 'bg-success-50 text-success-700'}`}>
          {exception.kind === 'suspended' ? '🚫 Reparto suspendido' : '✅ Reparto extra'}
          {exception.reason && <p className="mt-1 text-xs opacity-80">{exception.reason}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-foreground-muted mb-1">
            {isDeliveryDay ? 'Día de reparto regular.' : 'Día sin reparto regular.'}
          </p>
          {isDeliveryDay && (
            <Button
              size="sm"
              variant="danger"
              loading={addException.isPending}
              onClick={() => addException.mutate('suspended')}
            >
              Suspender este día
            </Button>
          )}
          {!isDeliveryDay && (
            <Button
              size="sm"
              loading={addException.isPending}
              onClick={() => addException.mutate('extra')}
            >
              Agregar reparto extra
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CalendarioPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const zonesQuery = useQuery({ queryKey: ['delivery-zones'], queryFn: () => deliveryApi.listZones() });
  const zones: DeliveryZone[] = zonesQuery.data ?? [];
  const zone = zones.find((z) => z.id === selectedZoneId);

  const exceptionsQuery = useQuery({
    queryKey: ['delivery-exceptions', selectedZoneId],
    queryFn: () => deliveryApi.listExceptions(selectedZoneId),
    enabled: !!selectedZoneId,
  });
  const exceptions: DeliveryException[] = exceptionsQuery.data ?? [];
  const exceptionMap = new Map(exceptions.map((e) => [e.date, e]));

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  }

  const weeks = buildCalendarWeeks(year, month);
  const todayStr = isoDate(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Calendario de reparto"
        description="Vista mensual por zona. Marcá días suspendidos o repartos extra."
        breadcrumbs={[
          { href: '/dashboard', label: 'Inicio' },
          { href: '/admin', label: 'Administración' },
          { label: 'Calendario' },
        ]}
      />

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedZoneId}
          onChange={(e) => { setSelectedZoneId(e.target.value); setSelectedDay(null); }}
          className="min-h-touch rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm"
        >
          <option value="">Elegí una zona</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={prevMonth} className="rounded-md border border-border p-2 hover:bg-surface-subtle" aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-36 text-center font-medium">{MONTH_NAMES[month]} {year}</span>
          <button onClick={nextMonth} className="rounded-md border border-border p-2 hover:bg-surface-subtle" aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Leyenda */}
      {zone && (
        <div className="flex flex-wrap gap-4 text-xs text-foreground-muted">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary-100 ring-1 ring-primary-400" /> Reparto regular</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-success-100 ring-1 ring-success-400" /> Reparto extra</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-error-100 ring-1 ring-error-400" /> Suspendido</span>
          <span className="ml-auto">Días habituales: {zone.deliveryDays.map((d) => WEEKDAY_LABELS[d]).join(', ')} · Cutoff: {zone.cutoffTime}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {/* Header de días */}
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAY_ORDER.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-foreground-muted">{WEEKDAY_LABELS[d]}</div>
            ))}
          </div>

          {/* Grilla */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-border last:border-0">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="min-h-16 bg-surface-subtle" />;

                const dateStr = isoDate(day.getFullYear(), day.getMonth(), day.getDate());
                const isToday = dateStr === todayStr;
                const isDeliveryDay = zone ? zone.deliveryDays.includes(dayOfWeekKey(day)) : false;
                const exception = exceptionMap.get(dateStr);
                const isSelected = selectedDay?.toDateString() === day.toDateString();
                const isPast = day < now && !isToday;

                let bg = '';
                if (exception?.kind === 'suspended') bg = 'bg-error-50';
                else if (exception?.kind === 'extra') bg = 'bg-success-50';
                else if (isDeliveryDay) bg = 'bg-primary-50';

                return (
                  <div key={di} className={`relative min-h-16 border-r border-border last:border-0 ${bg}`}>
                    <button
                      onClick={() => {
                        if (!zone || isPast) return;
                        setSelectedDay(isSelected ? null : day);
                      }}
                      disabled={!zone || isPast}
                      className={`flex h-full w-full flex-col items-start p-2 text-left transition-colors
                        ${zone && !isPast ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}
                      `}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-sm
                        ${isToday ? 'bg-primary-600 font-bold text-white' : isPast ? 'text-foreground-muted' : 'font-medium'}
                      `}>
                        {day.getDate()}
                      </span>
                      {exception && (
                        <span className={`mt-1 text-xs ${exception.kind === 'suspended' ? 'text-error-600' : 'text-success-600'}`}>
                          {exception.kind === 'suspended' ? 'Suspendido' : 'Extra'}
                        </span>
                      )}
                      {isDeliveryDay && !exception && (
                        <span className="mt-1 text-xs text-primary-600">Reparto</span>
                      )}
                    </button>

                    {isSelected && zone && (
                      <DayPopover
                        date={day}
                        zone={zone}
                        isDeliveryDay={isDeliveryDay}
                        exception={exception}
                        onClose={() => setSelectedDay(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {!zone && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground-muted">Seleccioná una zona para ver el calendario</CardTitle>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
