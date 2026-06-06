import * as React from 'react';
import { cn } from '@/lib/utils';

// CLAUDE.md §5.2 — radio generoso (rounded-lg, 16px), shadow-sm en reposo, padding amplio.
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-elevated shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-4 sm:p-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-xl font-semibold text-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // pt-0 asume que va debajo de un CardHeader (que ya da el espacio superior).
  // Si CardContent es el primer hijo (tarjeta SIN header), recuperamos el padding
  // superior para que el contenido no quede pegado al borde. Arregla toda la app.
  return (
    <div
      className={cn('p-4 pt-0 first:pt-4 sm:p-6 sm:pt-0 sm:first:pt-6', className)}
      {...props}
    />
  );
}
