'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from './label';
import { cn } from '@/lib/utils';

// Wrapper de campo: label + control + hint + error.
// CLAUDE.md §5.1 — "errores que ayudan, no que culpan": mostramos mensaje específico
// con ícono (no sólo color) para accesibilidad (§5.5).

interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>, {
            id: htmlFor,
            'aria-describedby': error ? errorId : hint ? hintId : undefined,
            'aria-invalid': !!error,
          })
        : children}
      {hint && !error && (
        <p id={hintId} className="text-xs text-foreground-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
