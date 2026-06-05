'use client';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Filtro de rango de fechas: dos campos "Desde" / "Hasta" con label arriba (CLAUDE.md §7).
// Simple y consistente: sin íconos extra (el date input ya trae el suyo) ni separadores.
interface Props {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear?: () => void;
  className?: string;
}

export function DateRangeFilter({ from, to, onFromChange, onToChange, onClear, className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-foreground-muted">Desde</span>
        <Input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onFromChange(e.target.value)}
          className="w-[9.5rem]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-foreground-muted">Hasta</span>
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onToChange(e.target.value)}
          className="w-[9.5rem]"
        />
      </label>
      {onClear && (from || to) && (
        <button
          type="button"
          onClick={onClear}
          className="min-h-touch text-sm font-medium text-foreground-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
