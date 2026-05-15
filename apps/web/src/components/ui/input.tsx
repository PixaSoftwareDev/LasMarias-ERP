'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

// CLAUDE.md §5.3 — inputs grandes (altura ≥44px), buen padding, labels arriba (no flotantes).
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex min-h-touch w-full rounded-md border bg-surface-elevated px-3 py-2 text-base',
          'placeholder:text-foreground-subtle',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalid ? 'border-danger focus-visible:ring-danger' : 'border-border',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
