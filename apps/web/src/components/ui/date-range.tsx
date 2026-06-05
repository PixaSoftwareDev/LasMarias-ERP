'use client';

import { CalendarDays, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Filtro de rango de fechas (Desde → Hasta) en UNA sola pastilla, en vez de dos cajas
// sueltas con un "a" en el medio (se veían cramped). Ícono de calendario + dos fechas
// borderless adentro + botón limpiar. Consistente en toda la app (CLAUDE.md §7).
interface Props {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear?: () => void;
  className?: string;
}

const dateInput =
  'min-w-0 bg-transparent text-sm text-foreground [color-scheme:light] focus:outline-none';

export function DateRangeFilter({ from, to, onFromChange, onToChange, onClear, className }: Props) {
  return (
    <div
      className={cn(
        'inline-flex min-h-touch items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 py-1.5',
        'focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-1',
        className,
      )}
    >
      <CalendarDays className="h-4 w-4 flex-shrink-0 text-foreground-muted" aria-hidden="true" />
      <input
        type="date"
        aria-label="Desde"
        value={from}
        max={to || undefined}
        onChange={(e) => onFromChange(e.target.value)}
        className={cn(dateInput, 'w-[7.25rem]')}
      />
      <span className="flex-shrink-0 text-foreground-subtle" aria-hidden="true">→</span>
      <input
        type="date"
        aria-label="Hasta"
        value={to}
        min={from || undefined}
        onChange={(e) => onToChange(e.target.value)}
        className={cn(dateInput, 'w-[7.25rem]')}
      />
      {onClear && (from || to) && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Limpiar fechas"
          className="ml-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-foreground-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
