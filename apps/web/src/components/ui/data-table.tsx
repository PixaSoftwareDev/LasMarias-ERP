'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from './card';
import { Button } from './button';
import { cn } from '@/lib/utils';

// Tabla simple compartida. Responsive: en mobile cada fila se convierte en stack vertical.
// CLAUDE.md §5.2/§5.3 — listas sobre tablas en mobile; paginación (nunca scroll infinito).
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
  primary?: boolean; // en mobile aparece arriba destacado
  secondary?: boolean; // en mobile aparece como metadata
  className?: string;
}

interface Props<T> {
  data: T[];
  columns: Column<T>[];
  getKey: (row: T) => string;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  /** Filas por página. Default 10. Pasar 0 para desactivar la paginación. */
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 10;

export function DataTable<T>({ data, columns, getKey, emptyText, onRowClick, pageSize = DEFAULT_PAGE_SIZE }: Props<T>) {
  const [page, setPage] = React.useState(0);

  const total = data.length;
  const paginated = pageSize > 0 && total > pageSize;
  const totalPages = paginated ? Math.ceil(total / pageSize) : 1;

  // Si cambia el dataset (filtros, recarga) y la página quedó fuera de rango, volvemos al inicio.
  React.useEffect(() => {
    if (page > totalPages - 1) setPage(0);
  }, [totalPages, page]);

  if (total === 0)
    return (
      <Card className="p-8 text-center text-sm text-foreground-muted">
        {emptyText ?? 'No hay datos para mostrar.'}
      </Card>
    );

  const start = paginated ? page * pageSize : 0;
  const rows = paginated ? data.slice(start, start + pageSize) : data;

  return (
    <>
      {/* Mobile */}
      <div className="grid gap-2 md:hidden">
        {rows.map((row) => {
          const primary = columns.filter((c) => c.primary);
          const secondary = columns.filter((c) => c.secondary);
          const rest = columns.filter((c) => !c.primary && !c.secondary);
          return (
            <Card
              key={getKey(row)}
              className={cn('p-4', onRowClick && 'cursor-pointer hover:bg-surface-subtle')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {primary.length > 0 && (
                <div className="mb-1 font-semibold">
                  {primary.map((c) => (
                    <React.Fragment key={c.key}>{c.render(row)}</React.Fragment>
                  ))}
                </div>
              )}
              {secondary.length > 0 && (
                <div className="mb-2 text-xs text-foreground-muted">
                  {secondary.map((c, i) => (
                    <span key={c.key}>
                      {i > 0 && ' · '}
                      {c.render(row)}
                    </span>
                  ))}
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {rest.map((c) => (
                  <React.Fragment key={c.key}>
                    <dt className="text-foreground-muted">{c.header}</dt>
                    <dd className={cn('text-right', c.align === 'left' && 'text-left')}>{c.render(row)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </Card>
          );
        })}
      </div>

      {/* Desktop */}
      <Card className="hidden md:block">
        <table className="w-full">
          <thead className="border-b border-border-subtle bg-surface-subtle/40">
            <tr className="text-left text-xs uppercase tracking-wide text-foreground-muted">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-4 py-3 font-medium',
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getKey(row)}
                className={cn(
                  'border-b border-border-subtle last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-subtle/30',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-4 py-3 text-sm',
                      c.align === 'right' && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Paginación — solo si hay más de una página. */}
      {paginated && (
        <div className="mt-3 flex flex-col items-center justify-between gap-2 text-sm sm:flex-row">
          <span className="text-foreground-muted">
            Mostrando {start + 1}–{Math.min(start + pageSize, total)} de {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="px-1 text-foreground-muted">
              Página {page + 1} de {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
