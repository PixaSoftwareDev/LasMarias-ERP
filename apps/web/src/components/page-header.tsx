import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// CLAUDE.md §5.3 — jerarquía visual clara, una acción primaria.
// En subpantallas (rutas hijas), `backHref` muestra un "← Volver a …" que da
// orientación sin reintroducir migas de pan globales.
interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  backHref?: string;
  backLabel?: string;
}

export function PageHeader({ title, description, action, className, backHref, backLabel }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel ?? 'Volver'}
        </Link>
      )}
      <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-foreground-muted">{description}</p>}
        </div>
        {action && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
      </header>
    </div>
  );
}
