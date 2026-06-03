'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  invalid?: boolean;
  /** Adorno fijo a la izquierda dentro del campo (ej: "$"). */
  prefix?: React.ReactNode;
  /** Adorno fijo a la derecha dentro del campo (ej: "kg", "L"). */
  suffix?: React.ReactNode;
}

// CLAUDE.md §5.3 — inputs grandes (altura ≥44px), buen padding, labels arriba (no flotantes).
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type = 'text', prefix, suffix, ...props }, ref) => {
    const inputEl = (
      <input
        ref={ref}
        type={type}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className={cn(
          'flex min-h-touch w-full rounded-md border bg-surface-elevated px-3 py-2 text-base',
          'placeholder:text-foreground-subtle',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalid ? 'border-danger focus-visible:ring-danger' : 'border-border',
          // Espacio para los adornos cuando existen.
          prefix && 'pl-7',
          suffix && 'pr-10',
          className,
        )}
        {...props}
      />
    );

    if (!prefix && !suffix) return inputEl;

    // Adornos dentro del campo: no capturan el click (pointer-events-none) para que
    // el foco vaya siempre al input. Color tenue para no competir con el valor.
    return (
      <div className="relative w-full">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-foreground-muted">
            {prefix}
          </span>
        )}
        {inputEl}
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
            {suffix}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
