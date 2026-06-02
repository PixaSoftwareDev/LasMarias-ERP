import { cn } from '@/lib/utils';
import { Card } from './card';

// Placeholders de carga con la FORMA del contenido real (CLAUDE.md §5.3 — skeletons,
// no spinners centrados). Evita el "salto" cuando llegan los datos.

// Bloque base animado.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-subtle', className)} />;
}

// Skeleton con forma de tabla/lista: filas con un par de columnas. Imita lo que
// renderiza <DataTable> mientras carga.
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 border-b border-border-subtle bg-surface-subtle/40 px-4 py-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
      <div className="divide-y divide-border-subtle">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// Skeleton con forma de fila de KPIs/chips (Home, Reportes, Caja, Cuenta corriente).
export function ChipsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[60px] min-w-[11rem] flex-1" />
      ))}
    </div>
  );
}
