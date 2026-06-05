'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, formatMoney as money } from '@/lib/utils';
import type { HomeCalendarEvent, HomeEventType } from '@lasmarias/shared-schemas';

// Calendario mensual liviano (Date nativo, sin librería). Cada día muestra
// puntitos por tipo de evento; al click se ve la lista de eventos del día.
// CLAUDE.md §5.2 — colores semánticos: cobro=ámbar, vencimiento=rojo, despacho=azul.

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const TYPE_STYLE: Record<HomeEventType, { dot: string; label: string }> = {
  cobro: { dot: 'bg-amber-500', label: 'Cobro' },
  vencimiento_lote: { dot: 'bg-red-500', label: 'Vencimiento de lote' },
  despacho: { dot: 'bg-secondary-500', label: 'Venta' },
  pago_proveedor: { dot: 'bg-orange-500', label: 'Pago a proveedor' },
};

// YYYY-MM del Date dado.
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Día de la semana en formato lunes=0 … domingo=6.
function mondayIndex(d: Date) {
  return (d.getDay() + 6) % 7;
}

interface Props {
  // Mes mostrado (YYYY-MM) controlado por el padre.
  month: string;
  onMonthChange: (month: string) => void;
  events: HomeCalendarEvent[];
  loading?: boolean;
  // Variante compacta para columna lateral angosta: tipografía y celdas más
  // chicas, sin leyenda. No afecta la funcionalidad (selección de día sigue).
  compact?: boolean;
}

export function MonthCalendar({ month, onMonthChange, events, loading, compact = false }: Props) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const parts = month.split('-');
  const year = Number(parts[0]);
  const monthNum = Number(parts[1]);
  const firstOfMonth = new Date(year, monthNum - 1, 1);
  const todayKey = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  // Eventos agrupados por fecha (YYYY-MM-DD).
  const byDate = useMemo(() => {
    const map = new Map<string, HomeCalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [events]);

  // Grilla: celdas vacías iniciales (offset) + días del mes.
  const offset = mondayIndex(firstOfMonth);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const dayKey = (day: number) => `${month}-${String(day).padStart(2, '0')}`;

  const goMonth = (delta: number) => {
    const d = new Date(year, monthNum - 1 + delta, 1);
    onMonthChange(monthKey(d));
    setSelectedDay(null);
  };

  const monthLabel = firstOfMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const selectedEvents = selectedDay ? byDate.get(selectedDay) ?? [] : [];

  return (
    <div className={cn('flex flex-col', compact ? 'gap-3' : 'gap-4')}>
      {/* Cabecera: navegación de mes. */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="Mes anterior"
          className={cn(
            'flex items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-subtle hover:text-foreground',
            compact ? 'h-8 w-8' : 'min-h-touch min-w-touch',
          )}
        >
          <ChevronLeft className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
        </button>
        <h3
          className={cn(
            'font-display font-semibold capitalize tracking-tight text-foreground',
            compact ? 'text-sm' : 'text-lg',
          )}
        >
          {monthLabel}
        </h3>
        <button
          type="button"
          onClick={() => goMonth(1)}
          aria-label="Mes siguiente"
          className={cn(
            'flex items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-subtle hover:text-foreground',
            compact ? 'h-8 w-8' : 'min-h-touch min-w-touch',
          )}
        >
          <ChevronRight className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
        </button>
      </div>

      {/* Encabezados de día de la semana. */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
        {WEEKDAYS.map((d) => (
          <div key={d}>{compact ? d.charAt(0) : d}</div>
        ))}
      </div>

      {/* Grilla de días. */}
      <div className={cn('grid grid-cols-7 gap-1', loading && 'animate-pulse opacity-60')}>
        {cells.map((day, i) => {
          if (day == null) return <div key={`empty-${i}`} className="aspect-square" />;
          const key = dayKey(day);
          const dayEvents = byDate.get(key) ?? [];
          const types = Array.from(new Set(dayEvents.map((e) => e.type)));
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDay(isSelected ? null : key)}
              aria-label={`${day} — ${dayEvents.length} evento(s)`}
              aria-pressed={isSelected}
              className={cn(
                'flex aspect-square flex-col items-center justify-start rounded-lg border transition-colors',
                compact ? 'gap-0.5 p-0.5 text-xs' : 'gap-1 p-1 text-sm',
                isSelected
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-border-subtle hover:bg-surface-subtle',
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center rounded-full',
                  compact ? 'h-5 w-5 text-xs' : 'h-6 w-6 text-sm',
                  isToday ? 'bg-primary-600 font-semibold text-white' : 'text-foreground',
                )}
              >
                {day}
              </span>
              {types.length > 0 && (
                <span className="flex flex-wrap items-center justify-center gap-0.5">
                  {types.map((t) => (
                    <span
                      key={t}
                      className={cn('rounded-full', compact ? 'h-1 w-1' : 'h-1.5 w-1.5', TYPE_STYLE[t].dot)}
                      aria-hidden="true"
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda (oculta en compacto para ahorrar espacio). */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
          {(Object.keys(TYPE_STYLE) as HomeEventType[]).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', TYPE_STYLE[t].dot)} aria-hidden="true" />
              {TYPE_STYLE[t].label}
            </span>
          ))}
        </div>
      )}

      {/* Detalle del día seleccionado. */}
      {selectedDay && (
        <div className="rounded-lg border border-border-subtle bg-surface-subtle/40 p-3">
          <p className="mb-2 text-sm font-medium text-foreground">
            {new Date(`${selectedDay}T00:00:00`).toLocaleDateString('es-AR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-foreground-muted">No hay eventos este día.</p>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((ev, i) => (
                <li key={`${ev.refId ?? 'x'}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', TYPE_STYLE[ev.type].dot)} aria-hidden="true" />
                    {ev.label}
                  </span>
                  {ev.amount != null && <span className="font-medium text-foreground">{money(ev.amount)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
